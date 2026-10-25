import { useState, useCallback, useRef, useEffect } from "react";
import {
    VISION_API_KEY,
    VISION_BASE_URL,
    VISION_MODEL,
} from "./useVision";

// ---------------------------------------------------------------------------
// Face analysis hook
//
// Flow ("scan my face and analyze"):
//   1. Open a MediaStream for the user-assigned FACE camera (falls back to the
//      default front camera / the already-running object camera stream).
//   2. Wait for a painted frame, capture it as a base64 JPEG.
//   3. Send it to the OpenAI-compatible vision API (same provider as useVision)
//      with a prompt that asks for a STRICT JSON block: age, gender, and a
//      color analysis (season, matched colors, best-outfit suggestions).
//   4. Parse the JSON, surface it in an interactive popup, and hand a concise
//      spoken summary back to the agent so it can say it out loud.
//
// By default the captured frame is POSTed as BINARY multipart/form-data (field
// name "image") to the n8n analyze-face workflow, which returns the JSON shape
// below. Override the endpoint with VITE_N8N_FACE_ANALYSIS_WEBHOOK, or set it to
// "off" to fall back to calling the browser-side Vision API directly.
// ---------------------------------------------------------------------------

// n8n workflow: POST image (binary) → { people, summary } JSON.
const DEFAULT_FACE_ANALYSIS_WEBHOOK =
    "https://fxaitools.app.n8n.cloud/webhook/analyze-face";

const RAW_FACE_ANALYSIS_WEBHOOK =
    import.meta.env.VITE_N8N_FACE_ANALYSIS_WEBHOOK ?? DEFAULT_FACE_ANALYSIS_WEBHOOK;

// Allow explicitly disabling the webhook (use the direct Vision API instead).
const N8N_FACE_ANALYSIS_WEBHOOK =
    RAW_FACE_ANALYSIS_WEBHOOK.toLowerCase() === "off"
        ? ""
        : RAW_FACE_ANALYSIS_WEBHOOK;


export interface PersonAnalysis {
    // Rough label so multiple people can be told apart in the popup.
    label?: string;
    age?: string; // e.g. "late 20s" or "27"
    gender?: string; // e.g. "male" / "female" / "non-binary presenting"
    colorSeason?: string; // e.g. "Warm Autumn", "Cool Winter"
    skinTone?: string;
    matchedColors?: string[]; // hex or named colors that flatter them
    avoidColors?: string[];
    bestOutfit?: string; // outfit recommendation sentence
    notes?: string;
}

export interface FaceAnalysisResult {
    people: PersonAnalysis[];
    summary: string; // one-paragraph spoken summary
    imageDataUrl?: string; // the captured frame, shown in the popup
    timestamp: number;
}

const FACE_PROMPT =
    "You are an AI image analyst performing a friendly, respectful appearance " +
    "and color-analysis reading for a fashion/styling assistant. Analyze the " +
    "person (or people) visible in this photo. For EACH person, estimate their " +
    "apparent age range and apparent gender presentation (these are best-effort " +
    "visual guesses, clearly approximate), then perform a seasonal color " +
    "analysis: determine their color season, list colors that flatter them, " +
    "colors to avoid, and suggest a best outfit.\n\n" +
    "Respond with ONLY a valid JSON object (no markdown, no code fences, no " +
    "prose before or after) in EXACTLY this shape:\n" +
    "{\n" +
    '  "people": [\n' +
    "    {\n" +
    '      "label": "Person 1",\n' +
    '      "age": "late 20s",\n' +
    '      "gender": "female",\n' +
    '      "colorSeason": "Cool Summer",\n' +
    '      "skinTone": "fair with cool undertones",\n' +
    '      "matchedColors": ["dusty blue", "powder blue", "soft rose"],\n' +
    '      "avoidColors": ["bright orange", "mustard"],\n' +
    '      "bestOutfit": "A dusty-blue tailored blazer over a soft white top with charcoal trousers.",\n' +
    '      "notes": "Silver jewelry over gold."\n' +
    "    }\n" +
    "  ],\n" +
    '  "summary": "A friendly one-paragraph spoken summary covering everyone detected."\n' +
    "}\n\n" +
    "IMPORTANT: matchedColors and avoidColors must contain ONLY descriptive color " +
    "names (e.g. 'icy blue', 'burnt orange', 'dusty rose', 'warm beige') — " +
    "never hex codes or RGB values. " +
    "If no clear face/person is visible, return { \"people\": [], \"summary\": " +
    '"No person was clearly visible in the frame." }. Keep the summary warm, ' +
    "concise, and speakable (2-4 sentences).";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Wait until the <video> actually has real dimensions AND has decoded at least
// one frame. getUserMedia + play() resolve before the first paintable frame, so
// capturing too early yields an all-black canvas.
const waitForVideoReady = async (video: HTMLVideoElement): Promise<void> => {
    const start = Date.now();
    // First, wait for metadata so videoWidth/Height are non-zero.
    while (
        (video.readyState < 2 || video.videoWidth === 0) &&
        Date.now() - start < 5000
    ) {
        await sleep(80);
    }
    // Then let a couple of frames actually paint via rVFC when available.
    const rvfc = (
        video as HTMLVideoElement & {
            requestVideoFrameCallback?: (cb: () => void) => number;
        }
    ).requestVideoFrameCallback?.bind(video);
    if (rvfc) {
        await new Promise<void>((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                resolve();
            };
            rvfc(() => rvfc(() => done()));
            setTimeout(done, 700);
        });
    } else {

        await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r()))
        );
    }
};

const drawToCanvas = (video: HTMLVideoElement): HTMLCanvasElement | null => {
    try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 1280 / (video.videoWidth || 1280));
        canvas.width = (video.videoWidth || 1280) * scale;
        canvas.height = (video.videoHeight || 720) * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas;
    } catch {
        return null;
    }
};

// Heuristic: sample the canvas and report whether it's essentially a blank
// (all-black / near-uniform) frame — the tell-tale sign the sensor hadn't
// warmed up yet when we captured.
const isBlankCanvas = (canvas: HTMLCanvasElement): boolean => {
    try {
        const ctx = canvas.getContext("2d");
        if (!ctx) return false;
        const { width, height } = canvas;
        if (!width || !height) return true;
        const data = ctx.getImageData(0, 0, width, height).data;
        let sum = 0;
        let sumSq = 0;
        let count = 0;
        // Sample every ~64th pixel for speed.
        const step = 64 * 4;
        for (let i = 0; i < data.length; i += step) {
            const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            sum += lum;
            sumSq += lum * lum;
            count++;
        }
        if (count === 0) return true;
        const mean = sum / count;
        const variance = sumSq / count - mean * mean;
        // Very dark AND very low variance → effectively a blank/black frame.
        return mean < 8 && variance < 12;
    } catch {
        return false;
    }
};

// Capture a non-blank frame, retrying with a short warm-up delay because the
// first frames after opening a camera are frequently still black.
const captureNonBlankCanvas = async (
    video: HTMLVideoElement
): Promise<HTMLCanvasElement | null> => {
    let lastCanvas: HTMLCanvasElement | null = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        const canvas = drawToCanvas(video);
        if (canvas) {
            lastCanvas = canvas;
            if (!isBlankCanvas(canvas)) return canvas;
        }
        // Give the sensor time to expose before the next try.
        await sleep(250);
    }
    // Fall back to whatever we last managed to draw (may be blank).
    return lastCanvas;
};


// Turn a canvas into a JPEG Blob (for binary upload).
const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise((resolve) => {
        try {
            canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9);
        } catch {
            resolve(null);
        }
    });


// Dig the actual model text out of the many wrapper shapes an n8n workflow or
// LLM provider might return: a plain string, { output | content | text | data |
// message | response }, OpenAI's choices[].message.content, or Gemini's
// candidates[]/content.parts[].text. Recurses until it finds a string.
const extractInnerText = (node: any, depth = 0): string => {
    if (node == null || depth > 6) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) {
        // Concatenate any strings we can pull out of array items.
        return node.map((n) => extractInnerText(n, depth + 1)).find((s) => s) || "";
    }
    if (typeof node === "object") {
        // Gemini: content.parts[].text  /  candidates[].content.parts[].text
        if (Array.isArray(node.parts)) {
            const joined = node.parts
                .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
                .join("");
            if (joined.trim()) return joined;
        }
        if (Array.isArray(node.candidates)) {
            const t = extractInnerText(node.candidates, depth + 1);
            if (t) return t;
        }
        // OpenAI: choices[].message.content
        if (Array.isArray(node.choices)) {
            const t = extractInnerText(node.choices, depth + 1);
            if (t) return t;
        }
        // Common single-field wrappers, in priority order.
        for (const key of [
            "output",
            "text",
            "content",
            "message",
            "response",
            "data",
            "json",
            "result",
        ]) {
            if (key in node) {
                const t = extractInnerText(node[key], depth + 1);
                if (t) return t;
            }
        }
    }
    return "";
};

// Best-effort JSON extraction from a model response that might wrap the object
// in prose or a ```json fence.
const parseAnalysisJson = (raw: string): { people: PersonAnalysis[]; summary: string } | null => {

    if (!raw) return null;
    let text = raw.trim();
    // Strip code fences if present.
    text = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    // Grab the outermost {...} if there's surrounding prose.
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
        text = text.slice(first, last + 1);
    }
    try {
        const obj = JSON.parse(text);
        const people = Array.isArray(obj.people) ? obj.people : [];
        const summary =
            typeof obj.summary === "string" && obj.summary.trim()
                ? obj.summary.trim()
                : "";
        return { people, summary };
    } catch {
        return null;
    }
};

export const useFaceAnalysis = (
    openStreamForDevice: (deviceId?: string) => Promise<MediaStream>,
    getFaceCameraId: () => string,
    getFallbackStream: () => MediaStream | null
) => {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [result, setResult] = useState<FaceAnalysisResult | null>(null);
    const [error, setError] = useState<string>("");
    const [isOpen, setIsOpen] = useState(false);
    // Live camera preview shown in the popup for ~1s BEFORE the frame is
    // captured, so the user sees themselves framed up before the shot is taken.
    const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
    const [isPreviewing, setIsPreviewing] = useState(false);
    // Captured still, available immediately after the frame grab so it can
    // serve as the background during the (potentially slow) analysis phase.
    const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);



    const abortRef = useRef<AbortController | null>(null);

    // Hidden <video> we attach the (possibly temporary) face stream to just
    // long enough to grab a frame. Lives for the hook's lifetime.
    const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
    const ensureHiddenVideo = useCallback((): HTMLVideoElement => {
        if (!hiddenVideoRef.current) {
            const v = document.createElement("video");
            v.autoplay = true;
            v.muted = true;
            v.playsInline = true;
            v.setAttribute("playsinline", "true");
            v.style.position = "fixed";
            v.style.width = "1px";
            v.style.height = "1px";
            v.style.opacity = "0";
            v.style.pointerEvents = "none";
            v.style.left = "-9999px";
            document.body.appendChild(v);
            hiddenVideoRef.current = v;
        }
        return hiddenVideoRef.current;
    }, []);

    useEffect(() => {
        return () => {
            if (hiddenVideoRef.current) {
                hiddenVideoRef.current.srcObject = null;
                hiddenVideoRef.current.remove();
                hiddenVideoRef.current = null;
            }
            abortRef.current?.abort();
        };
    }, []);

    const runVisionApi = useCallback(
        async (
            imageBlob: Blob | null,
            base64NoPrefix: string
        ): Promise<{ people: PersonAnalysis[]; summary: string } | null> => {
            abortRef.current?.abort();
            abortRef.current = new AbortController();

            // Route through a dedicated n8n workflow if configured. The workflow
            // expects the raw JPEG as BINARY multipart/form-data under the field
            // name "image".
            if (N8N_FACE_ANALYSIS_WEBHOOK) {
                const form = new FormData();
                if (imageBlob) {
                    form.append("image", imageBlob, "face.jpg");
                } else {
                    // Fallback: no blob available — send base64 so the webhook
                    // still receives something usable.
                    form.append("image", base64NoPrefix);
                }
                // NOTE: don't set Content-Type manually — the browser adds the
                // correct multipart boundary automatically.
                const res = await fetch(N8N_FACE_ANALYSIS_WEBHOOK, {
                    method: "POST",
                    body: form,
                    signal: abortRef.current.signal,
                });

                if (!res.ok) throw new Error(`Analysis webhook error ${res.status}`);
                const text = await res.text();
                let data: any = text;
                try {
                    data = JSON.parse(text);
                } catch {
                    /* raw */
                }
                const root = Array.isArray(data) ? data[0] : data;
                // Accept the JSON shape directly …
                if (root && Array.isArray(root.people)) {
                    return { people: root.people, summary: root.summary || "" };
                }
                // … or dig the JSON string out of the many wrapper shapes
                // different LLM providers / n8n nodes return (plain string,
                // { output|content|text }, OpenAI choices[].message.content, or
                // Gemini content.parts[].text).
                const inner = extractInnerText(root);
                return parseAnalysisJson(inner);

            }

            // Default: OpenAI-compatible vision chat/completions (same provider
            // as the object-vision pipeline).
            if (!VISION_API_KEY) {
                throw new Error("Missing VITE_VISION_API_KEY");
            }
            const payload = {
                model: VISION_MODEL,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: FACE_PROMPT },
                            {
                                type: "image_url",
                                image_url: {
                                    url: `data:image/jpeg;base64,${base64NoPrefix}`,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 900,
                temperature: 0.4,
            };
            const res = await fetch(`${VISION_BASE_URL}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${VISION_API_KEY}`,
                },
                signal: abortRef.current.signal,
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const body = await res.text();
                throw new Error(`Vision API ${res.status}: ${body.slice(0, 200)}`);
            }
            const data = await res.json();
            const content = data?.choices?.[0]?.message?.content?.trim() || "";
            return parseAnalysisJson(content);
        },
        []
    );

    // Public: run the whole "scan face and analyze" flow. Returns a spoken
    // summary string for the agent (or an error message).
    const analyzeFace = useCallback(async (): Promise<string> => {
        setError("");
        setIsOpen(true);
        setResult(null);
        // Start in "previewing" mode (not analyzing yet) so the popup shows a
        // live camera feed before the shot is taken.
        setIsPreviewing(true);
        setIsAnalyzing(false);
        setPreviewStream(null);

        let tempStream: MediaStream | null = null;
        try {
            const video = ensureHiddenVideo();
            const faceId = getFaceCameraId();

            // Acquire a stream for the face camera. Prefer a dedicated device;
            // fall back to the object camera's existing stream if opening a new
            // one fails (e.g. only one physical camera).
            let activeStream: MediaStream | null = null;
            try {
                tempStream = await openStreamForDevice(faceId || undefined);
                activeStream = tempStream;
            } catch (err) {
                console.warn(
                    "[face-analysis] face camera open failed, trying fallback stream:",
                    err
                );
                const fallback = getFallbackStream();
                if (fallback) {
                    video.srcObject = fallback;
                    activeStream = fallback;
                } else {
                    throw err;
                }
            }
            if (tempStream) {
                video.srcObject = tempStream;
            }
            await video.play().catch(() => {});
            await waitForVideoReady(video);

            // Show the live preview in the popup for ~1s so the user can frame
            // themselves before the frame is grabbed, THEN capture.
            if (activeStream) {
                setPreviewStream(activeStream);
            }
            await sleep(1000);

            // Preview done — switch to the analyzing state (loading overlay).
            setIsPreviewing(false);
            setIsAnalyzing(true);

            // The first frames after opening a camera are frequently still
            // black while the sensor exposes — capture with warm-up + retry
            // until we get a non-blank frame.
            const canvas = await captureNonBlankCanvas(video);

            if (!canvas) {
                throw new Error("Could not capture a frame from the face camera.");
            }

            const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
            const base64 = dataUrl.split(",")[1];

            // Show the captured still as the background immediately — before
            // the (potentially slow) API call returns.
            setCapturedDataUrl(dataUrl);

            // Prefer a real binary Blob for the multipart upload; base64 is the
            // fallback (and what the direct Vision API path always uses).
            const blob = await canvasToBlob(canvas);

            const parsed = await runVisionApi(blob, base64);


            if (!parsed) {
                throw new Error("The analyzer didn't return a readable result.");
            }

            const summary =
                parsed.summary ||
                (parsed.people.length
                    ? `I analyzed ${parsed.people.length} ${
                          parsed.people.length === 1 ? "person" : "people"
                      }.`
                    : "No person was clearly visible in the frame.");

            const finalResult: FaceAnalysisResult = {
                people: parsed.people,
                summary,
                imageDataUrl: dataUrl,
                timestamp: Date.now(),
            };
            setResult(finalResult);
            return summary;
        } catch (err: any) {
            const msg =
                err?.name === "AbortError"
                    ? "Face analysis was cancelled."
                    : err?.message || "Face analysis failed.";
            setError(msg);
            return `I couldn't complete the face analysis: ${msg}`;
        } finally {
            setIsAnalyzing(false);
            setIsPreviewing(false);
            // Drop the preview stream reference so the popup stops showing the
            // live feed (the captured still takes over).
            setPreviewStream(null);
            // capturedDataUrl is intentionally kept so the popup can continue
            // showing the still even after isAnalyzing flips false (it's the
            // same value stored in result.imageDataUrl, so it's never stale).

            // Release the temporary face stream (but never the shared fallback).
            if (tempStream) {
                tempStream.getTracks().forEach((t) => t.stop());
            }
            if (hiddenVideoRef.current) {
                hiddenVideoRef.current.srcObject = null;
            }
        }
    }, [
        ensureHiddenVideo,
        getFaceCameraId,
        getFallbackStream,
        openStreamForDevice,
        runVisionApi,
    ]);

    const close = useCallback(() => setIsOpen(false), []);

    return {
        isAnalyzing,
        isPreviewing,
        previewStream,
        capturedDataUrl,
        result,
        error,
        isOpen,
        analyzeFace,
        close,
    };

};

