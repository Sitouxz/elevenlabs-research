import { useState, useCallback, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Configuration — follows the OpenAI Vision API pattern from
// https://github.com/roboflow/awesome-openai-vision-api-experiments
//
// Default: Groq free tier (OpenAI-compatible, 30 RPM free)
//   - Get a free key at https://console.groq.com
//   - Model: meta-llama/llama-4-scout-17b-16e-instruct (vision-capable)
//
// You can also point this at OpenAI, OpenRouter, Together, etc.
// ---------------------------------------------------------------------------
const VISION_API_KEY = import.meta.env.VITE_VISION_API_KEY || "";
const VISION_BASE_URL =
    import.meta.env.VITE_VISION_BASE_URL ||
    "https://api.groq.com/openai/v1";
const VISION_MODEL =
    import.meta.env.VITE_VISION_MODEL ||
    "meta-llama/llama-4-scout-17b-16e-instruct";

const DEFAULT_INTERVAL_MS = 10_000; // 10s between analyses
const MAX_BACKOFF_MS = 120_000;

const VISION_PROMPT =
    "You are an AI vision system feeding real-time descriptions to a voice " +
    "assistant called JARVIS. Analyze this camera frame and provide a concise, " +
    "natural description of what you see.\n\n" +
    "Include:\n" +
    "- Objects and their approximate positions/relationships\n" +
    "- Any text or labels visible (OCR)\n" +
    "- People and what they appear to be doing (if any)\n" +
    "- Notable colors, brands, or distinguishing features\n" +
    "- Context about the scene/environment\n\n" +
    "Keep the description under 3 sentences. Be specific and factual. " +
    'Do NOT say "I see an image" or "This is a photo" — describe the ' +
    "contents directly as if you are looking through a camera in real time.";

export interface VisionResult {
    description: string;
    timestamp: number;
}

export const useVision = () => {
    const [isReady, setIsReady] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [lastResult, setLastResult] = useState<VisionResult | null>(null);
    const [error, setError] = useState<string>("");

    const lastDescriptionRef = useRef<string>("");
    const analysisLoopRef = useRef<number | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const backoffMsRef = useRef(0);
    const consecutiveErrorsRef = useRef(0);

    // Ready when we have an API key
    useEffect(() => {
        if (VISION_API_KEY) {
            setIsReady(true);
            console.log(
                `Vision ready — model: ${VISION_MODEL}, provider: ${VISION_BASE_URL}`
            );
        } else {
            setError("Missing VITE_VISION_API_KEY in environment variables");
        }
    }, []);

    // -----------------------------------------------------------------------
    // Capture a video frame as base64 JPEG  (same pattern as webcam-gpt repo)
    // -----------------------------------------------------------------------
    const captureFrameAsBase64 = useCallback(
        (video: HTMLVideoElement): string | null => {
            try {
                const canvas = document.createElement("canvas");
                const scale = Math.min(1, 640 / (video.videoWidth || 640));
                canvas.width = (video.videoWidth || 640) * scale;
                canvas.height = (video.videoHeight || 480) * scale;
                const ctx = canvas.getContext("2d");
                if (!ctx) return null;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
                return dataUrl.split(",")[1];
            } catch {
                return null;
            }
        },
        []
    );

    // -----------------------------------------------------------------------
    // Send frame to vision API — OpenAI chat/completions format with image_url
    // (same payload structure as roboflow/awesome-openai-vision-api-experiments)
    // -----------------------------------------------------------------------
    const analyzeFrame = useCallback(
        async (video: HTMLVideoElement): Promise<VisionResult | null> => {
            if (!isReady || isAnalyzing) return null;

            const base64 = captureFrameAsBase64(video);
            if (!base64) return null;

            setIsAnalyzing(true);
            setError("");

            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            abortControllerRef.current = new AbortController();

            try {
                // OpenAI-compatible chat completions payload with image_url
                const payload = {
                    model: VISION_MODEL,
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: VISION_PROMPT,
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: `data:image/jpeg;base64,${base64}`,
                                    },
                                },
                            ],
                        },
                    ],
                    max_tokens: 300,
                    temperature: 0.3,
                };

                const response = await fetch(
                    `${VISION_BASE_URL}/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${VISION_API_KEY}`,
                        },
                        signal: abortControllerRef.current.signal,
                        body: JSON.stringify(payload),
                    }
                );

                if (!response.ok) {
                    const errBody = await response.text();

                    if (response.status === 429) {
                        consecutiveErrorsRef.current += 1;
                        backoffMsRef.current = Math.min(
                            MAX_BACKOFF_MS,
                            15_000 *
                                Math.pow(
                                    2,
                                    consecutiveErrorsRef.current - 1
                                )
                        );
                        const waitSec = Math.round(
                            backoffMsRef.current / 1000
                        );
                        console.warn(
                            `Vision API rate limited. Backing off ${waitSec}s`
                        );
                        setError(`Rate limited — retrying in ${waitSec}s`);
                        return null;
                    }

                    console.error(
                        "Vision API error:",
                        response.status,
                        errBody
                    );
                    setError(`API error: ${response.status}`);
                    return null;
                }

                // Parse OpenAI-compatible response
                const data = await response.json();
                const description =
                    data?.choices?.[0]?.message?.content?.trim() || "";

                if (!description) return null;

                const result: VisionResult = {
                    description,
                    timestamp: Date.now(),
                };

                // Reset backoff on success
                consecutiveErrorsRef.current = 0;
                backoffMsRef.current = 0;
                setError("");

                setLastResult(result);
                return result;
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    console.error("Vision analysis failed:", err);
                    setError(err.message || "Analysis failed");
                }
                return null;
            } finally {
                setIsAnalyzing(false);
            }
        },
        [isReady, isAnalyzing, captureFrameAsBase64]
    );

    const startAnalysisLoop = useCallback(
        (
            getVideo: () => HTMLVideoElement | null,
            onUpdate: (description: string) => void,
            intervalMs = DEFAULT_INTERVAL_MS
        ) => {
            if (analysisLoopRef.current) return;

            const loop = async () => {
                const video = getVideo();
                if (!video || !isReady) {
                    analysisLoopRef.current = window.setTimeout(
                        loop,
                        intervalMs
                    );
                    return;
                }

                const result = await analyzeFrame(video);
                if (
                    result &&
                    result.description !== lastDescriptionRef.current
                ) {
                    lastDescriptionRef.current = result.description;
                    onUpdate(result.description);
                }

                const nextDelay =
                    backoffMsRef.current > 0
                        ? backoffMsRef.current
                        : intervalMs;

                analysisLoopRef.current = window.setTimeout(loop, nextDelay);
            };

            loop();
        },
        [isReady, analyzeFrame]
    );

    const stopAnalysisLoop = useCallback(() => {
        if (analysisLoopRef.current) {
            clearTimeout(analysisLoopRef.current);
            analysisLoopRef.current = null;
        }
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopAnalysisLoop();
        };
    }, [stopAnalysisLoop]);

    return {
        isReady,
        isAnalyzing,
        lastResult,
        error,
        analyzeFrame,
        startAnalysisLoop,
        stopAnalysisLoop,
    };
};
