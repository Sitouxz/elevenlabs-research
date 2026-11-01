import { useState, useCallback, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Image-to-3D scan hook
//
// Flow:
//   1. Capture a single frame from the live camera <video> element
//   2. POST the raw JPEG bytes as multipart/form-data under the field "data"
//      to the n8n "generate-3d-tripo" webhook (binary, not base64 JSON)
//   3. The webhook proxies to Tripo (image-to-3D) and returns a .glb URL
//   4. That URL is fed into a draggable ObjectViewer window (<model-viewer>)
//      so the user can orbit / interact with the generated 3D object.

//
// Mirrors the window-management pattern of useImageGeneration so the two
// feel consistent (spawn position, z-index focus, drag reposition, close).
// ---------------------------------------------------------------------------

// Submit endpoint: POST the JPEG, returns a job id ({ "id": "27677" }).
const N8N_OBJECT_WEBHOOK =
    import.meta.env.VITE_N8N_OBJECT_WEBHOOK ||
    "https://fxaitools.app.n8n.cloud/webhook/generate-3d-tripo";

// Text-to-3D submit endpoint: POST { prompt: "<description>" } as JSON,
// returns a job id ({ "id": "27677" }) just like the image-to-3D webhook.
// Polling then reuses the SAME N8N_OBJECT_POLL_WEBHOOK below.
const N8N_OBJECT_TEXT_WEBHOOK =
    import.meta.env.VITE_N8N_OBJECT_TEXT_WEBHOOK ||
    "https://fxaitools.app.n8n.cloud/webhook/generate-3d-tripo-text";


// Poll endpoint: GET ?jobid=<id>, returns the .glb once ready in a `url` field.
const N8N_OBJECT_POLL_WEBHOOK =
    import.meta.env.VITE_N8N_OBJECT_POLL_WEBHOOK ||
    "https://fxaitools.app.n8n.cloud/webhook/generate-3d";

// Poll cadence and overall ceiling. Tripo jobs take ~3-4 min; poll every 30s
// and give up after 30 tries (~15 min) so a window never spins forever.
const POLL_INTERVAL_MS = 30_000;
const MAX_POLL_ATTEMPTS = 30;

// Tripo's CDN (tripo-data.*.tripo3d.com) serves the .glb WITHOUT an
// Access-Control-Allow-Origin header, so <model-viewer>'s fetch is blocked by
// CORS in the browser. Route the model through an n8n proxy webhook that
// refetches it server-side and re-serves it WITH CORS headers.
//
// Contract (see the "n8n GLB proxy" spec):
//   GET {GLB_PROXY_WEBHOOK}?url=<url-encoded Tripo .glb URL>
//   → 200 with the raw .glb bytes, Content-Type: model/gltf-binary,
//     Access-Control-Allow-Origin: *
//
// If GLB_PROXY_WEBHOOK is empty, we skip proxying and use the raw URL (useful
// once the poll `url` is already a CORS-enabled, re-hosted URL). Non-Tripo
// URLs are always passed through untouched.
const GLB_PROXY_WEBHOOK =
    import.meta.env.VITE_N8N_GLB_PROXY_WEBHOOK ||
    "https://fxaitools.app.n8n.cloud/webhook/glb-proxy";

const proxifyGlbUrl = (url: string): string => {

    if (!GLB_PROXY_WEBHOOK) return url;
    try {
        const u = new URL(url);
        if (/\.tripo3d\.com$/i.test(u.hostname)) {
            const sep = GLB_PROXY_WEBHOOK.includes("?") ? "&" : "?";
            return `${GLB_PROXY_WEBHOOK}${sep}url=${encodeURIComponent(url)}`;
        }
    } catch {
        // not an absolute URL — return as-is
    }
    return url;
};

// ---------------------------------------------------------------------------
// Push the generated 3D model URL to the XR / Unity display over WebSocket.
//
// Unity is a NATIVE standalone build, so it is NOT bound by browser CORS and
// can download the .glb straight from Tripo's CDN. We therefore send the RAW
// Tripo signed URL (NOT the CORS proxy URL, which only exists for the in-app
// <model-viewer>). Unity loads it at runtime with glTFast.
//
// Transport mirrors sendToXR() in useImageGeneration.ts: a short-lived
// Socket.IO v4 (Engine.IO v4) connection to the same XR endpoint. We emit the
// URL on the "message" event that Unity already listens for:
//   emit("message", "<raw tripo .glb url>")
// Engine.IO framing: "0"=open, "2"=ping→"3"pong, "40"=SIO connect, "42"=SIO event.
//
// NOTE: Tripo signed URLs expire, so Unity should download promptly on receipt.
// ---------------------------------------------------------------------------
const XR_WS_URL =
    "wss://xr-api.fxwebapps.com/socket.io/?EIO=4&transport=websocket";

function sendModelToXR(url: string) {
    try {
        const ws = new WebSocket(XR_WS_URL);
        let sioConnected = false;

        ws.addEventListener("message", ({ data }) => {
            if (typeof data !== "string") return;
            const eioType = data[0];

            if (eioType === "0") {
                // Engine.IO open → connect to Socket.IO default namespace
                ws.send("40");
            } else if (eioType === "2") {
                // Engine.IO ping → pong
                ws.send("3");
            } else if (eioType === "4" && data[1] === "0" && !sioConnected) {
                // Socket.IO namespace connected → emit the raw URL then close
                sioConnected = true;
                ws.send(`42["message",${JSON.stringify(url)}]`);
                console.log("[XR-WS] sent 3D model url to Unity:", url);
                setTimeout(() => ws.close(), 200);
            }
        });

        ws.addEventListener("error", (e) => {
            console.warn("[XR-WS] send error", e);
        });
    } catch (err) {
        console.warn("[XR-WS] could not open socket", err);
    }
}






const WINDOW_WIDTH = 560;
const WINDOW_HEIGHT = 620;
const SPAWN_OFFSET = 28;

export type ObjectWindowStatus = "loading" | "succeeded" | "failed";

export interface ObjectWindow {
    id: string;
    label: string; // short caption (e.g. the scanned object name)
    status: ObjectWindowStatus;
    glbUrl?: string;
    error?: string;
    createdAt: number;
    completedAt?: number;
    position: { x: number; y: number };
    zIndex: number;
}

const computeSpawnPosition = (existingCount: number) => {
    if (typeof window === "undefined") {
        return { x: 120, y: 120 };
    }
    const baseX = Math.max(
        16,
        Math.round(window.innerWidth / 2 - WINDOW_WIDTH / 2)
    );
    const baseY = Math.max(
        16,
        Math.round(window.innerHeight / 2 - WINDOW_HEIGHT / 2)
    );
    const offset = (existingCount % 6) * SPAWN_OFFSET;
    return { x: baseX + offset, y: baseY + offset };
};

// Wait until the <video> has actually PAINTED a real frame before we read
// it. readyState >= 2 (HAVE_CURRENT_DATA) is reached before the first frame
// is truly decoded/painted — capturing then yields an all-black image,
// especially right after the camera is auto-enabled. requestVideoFrameCallback
// fires only when a new frame has been presented, so we wait for one (with a
// timeout fallback for browsers/edge cases where it never fires).
const waitForPaintedFrame = (video: HTMLVideoElement): Promise<void> => {
    return new Promise((resolve) => {
        const rvfc = (
            video as HTMLVideoElement & {
                requestVideoFrameCallback?: (cb: () => void) => number;
            }
        ).requestVideoFrameCallback?.bind(video);

        if (!rvfc) {
            // No rVFC support — fall back to a couple of animation frames so
            // at least one paint has occurred.
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            return;
        }

        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            resolve();
        };
        // Take the SECOND presented frame — the first can still be the
        // initial black/garbage buffer on some webcams.
        rvfc(() => rvfc(() => done()));
        // Safety net so we never hang if a frame is never presented.
        setTimeout(done, 1500);
    });
};

// Capture the current camera frame as a binary JPEG Blob (raw bytes, not
// base64) so it can be sent as multipart/form-data. Uses canvas.toBlob,
// which hands back the encoded image directly with no data-URL round-trip.
const captureFrameAsBlob = async (
    video: HTMLVideoElement
): Promise<Blob | null> => {
    await waitForPaintedFrame(video);
    return new Promise((resolve) => {
        try {
            const canvas = document.createElement("canvas");
            const scale = Math.min(1, 1920 / (video.videoWidth || 1920));
            canvas.width = (video.videoWidth || 1920) * scale;
            canvas.height = (video.videoHeight || 1080) * scale;
            const ctx = canvas.getContext("2d");
            if (!ctx) return resolve(null);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(
                (blob) => resolve(blob),
                "image/jpeg",
                0.92
            );
        } catch {
            resolve(null);
        }
    });
};



// The webhook may return the .glb URL under a few possible field names or
// nested shapes depending on how the n8n workflow is wired. Try the common
// ones and finally fall back to any string that looks like a .glb URL.
//
// The Tripo-via-n8n response looks like:
//   [ { code, status, data: { output: { model_url, rendered_image_url } } } ]
// i.e. a top-level ARRAY whose first item nests the model URL at
// data.output.model_url — so we unwrap arrays and check that path first.
const extractGlbUrl = (data: any): string | undefined => {
    if (!data) return undefined;
    if (typeof data === "string") {
        return data.includes(".glb") || data.startsWith("http")
            ? data
            : undefined;
    }

    // n8n often wraps the payload in a single-element array — unwrap it.
    const root = Array.isArray(data) ? data[0] : data;
    if (!root) return undefined;

    const candidates = [
        // Tripo image-to-3D shape (preferred, most specific first)
        root?.data?.output?.model_url,
        root?.output?.model_url,
        root?.data?.model_url,
        // Generic / other workflow shapes
        root.glb_url,
        root.glbUrl,
        root.model_url,
        root.modelUrl,
        root.url,
        root.output,
        root.model,
        root.result,
        root?.data?.glb_url,
        root?.data?.url,
        root?.output?.glb,
        root?.model?.url,
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.length > 0) return c;
        if (Array.isArray(c) && typeof c[0] === "string") return c[0];
    }

    // Last resort: deep-scan for the first string containing ".glb" (handles
    // signed URLs like ".../model.glb?Policy=...&Signature=...").
    try {
        const json = JSON.stringify(data);
        const match = json.match(/https?:\/\/[^"'\s]+\.glb[^"'\s]*/i);
        if (match) return match[0];
    } catch {
        // ignore
    }
    return undefined;
};


export const useObjectScan = () => {
    const [windows, setWindows] = useState<ObjectWindow[]>([]);
    const [error, setError] = useState<string>("");

    const zCounterRef = useRef(300);
    const windowsRef = useRef<ObjectWindow[]>([]);
    useEffect(() => {
        windowsRef.current = windows;
    }, [windows]);

    const patchWindow = useCallback(
        (id: string, patch: Partial<ObjectWindow>) => {
            setWindows((prev) =>
                prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
            );
        },
        []
    );

    // Small promise-based delay used between poll attempts.
    const sleep = (ms: number) =>
        new Promise<void>((resolve) => setTimeout(resolve, ms));

    // -----------------------------------------------------------------------
    // Poll the status endpoint until the .glb is ready.
    //   GET {POLL_WEBHOOK}?jobid=<id>  →  { url: "https://….glb", ... }
    // While the job is still running the `url` field is absent/empty, so we
    // wait POLL_INTERVAL_MS and try again (up to MAX_POLL_ATTEMPTS).
    // -----------------------------------------------------------------------
    const pollForGlb = useCallback(
        async (windowId: string, jobId: string) => {
            for (let attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
                await sleep(POLL_INTERVAL_MS);
                try {
                    const url = `${N8N_OBJECT_POLL_WEBHOOK}?jobid=${encodeURIComponent(
                        jobId
                    )}`;
                    console.log(
                        `[scan_to_3d] poll ${attempt}/${MAX_POLL_ATTEMPTS}: GET ${url}`
                    );
                    const res = await fetch(url, { method: "GET" });
                    if (!res.ok) {
                        console.warn(
                            `[scan_to_3d] poll ${attempt} HTTP ${res.status} — retrying`
                        );
                        continue;
                    }

                    const text = await res.text();
                    console.log(
                        `[scan_to_3d] poll ${attempt} response:`,
                        text.slice(0, 500)
                    );
                    let data: any = text;
                    try {
                        data = JSON.parse(text);
                    } catch {
                        // leave as raw string
                    }

                    // Preferred: explicit `url` field the workflow returns.
                    const root = Array.isArray(data) ? data[0] : data;
                    const direct =
                        root && typeof root === "object" ? root.url : undefined;
                    const glbUrl =
                        (typeof direct === "string" && direct.length > 0
                            ? direct
                            : undefined) ?? extractGlbUrl(data);

                    if (glbUrl) {
                        const viewerUrl = proxifyGlbUrl(glbUrl);
                        console.log(
                            "[scan_to_3d] got .glb URL:",
                            glbUrl,
                            viewerUrl !== glbUrl ? `(proxied)` : ""
                        );

                        // The in-app <model-viewer> renders the .glb via the
                        // CORS proxy.
                        patchWindow(windowId, {
                            status: "succeeded",
                            glbUrl: viewerUrl,
                            completedAt: Date.now(),
                        });

                        // Push the RAW Tripo .glb URL to Unity over WebSocket.
                        // Native Unity isn't CORS-bound, so it downloads the
                        // .glb straight from Tripo's CDN (no proxy hop).
                        sendModelToXR(glbUrl);
                        return;

                    }



                    // No URL yet → still processing, keep polling.
                } catch (err: any) {
                    console.warn(
                        `[scan_to_3d] poll ${attempt} error (retrying):`,
                        err?.message || err
                    );
                }
            }

            console.error("[scan_to_3d] polling exhausted, no .glb URL");
            patchWindow(windowId, {
                status: "failed",
                error: `Timed out after ${Math.round(
                    (MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 60000
                )} minutes waiting for the 3D model`,
            });

        },
        [patchWindow]
    );

    // -----------------------------------------------------------------------
    // Background job: submit the frame → get a job id → poll for the .glb.
    // Runs DETACHED from the client-tool call because Tripo takes ~3-4 minutes,
    // far longer than the ElevenLabs client-tool timeout. We must NOT await
    // this inside scanToObject, or the agent's tool call times out and it
    // wrongly reports failure. The loading window is the real progress channel.
    // -----------------------------------------------------------------------
    const runGeneration = useCallback(
        async (id: string, blob: Blob) => {
            try {
                // Submit: raw JPEG bytes as multipart/form-data under the field
                // name "data" (a File so n8n treats it as binary with filename
                // + mime type). Do NOT set Content-Type manually — the browser
                // adds the correct multipart boundary header. The submit
                // endpoint responds quickly with a job id ({ "id": "27677" }).
                const form = new FormData();
                form.append(
                    "data",
                    new File([blob], `${id}.jpg`, { type: "image/jpeg" })
                );

                console.log(
                    `[scan_to_3d] POST ${N8N_OBJECT_WEBHOOK} (${blob.size} bytes) — submitting job`
                );
                const res = await fetch(N8N_OBJECT_WEBHOOK, {
                    method: "POST",
                    body: form,
                });

                if (!res.ok) {
                    const errBody = await res.text();
                    console.error(
                        `[scan_to_3d] submit ${res.status}:`,
                        errBody.slice(0, 500)
                    );
                    patchWindow(id, {
                        status: "failed",
                        error: `${res.status}: ${errBody}`.slice(0, 240),
                    });
                    return;
                }

                const text = await res.text();
                console.log("[scan_to_3d] submit response:", text.slice(0, 500));
                let data: any = text;
                try {
                    data = JSON.parse(text);
                } catch {
                    // leave as raw string
                }

                // Job id lives in `id` (fall back to a couple of likely names).
                const root = Array.isArray(data) ? data[0] : data;
                const jobId =
                    root && typeof root === "object"
                        ? root.id ?? root.jobid ?? root.job_id ?? root.task_id
                        : typeof root === "string"
                          ? root
                          : undefined;

                if (jobId === undefined || jobId === null || jobId === "") {
                    console.error("[scan_to_3d] no job id in submit response");
                    patchWindow(id, {
                        status: "failed",
                        error: "The 3D service didn't return a job id.",
                    });
                    return;
                }

                console.log("[scan_to_3d] job id:", jobId);
                // Hand off to polling (still detached from the tool call).
                await pollForGlb(id, String(jobId));
            } catch (err: any) {
                console.error(
                    "[scan_to_3d] submit error:",
                    err?.message || err
                );
                patchWindow(id, {
                    status: "failed",
                    error:
                        err?.message ||
                        "Network error contacting the 3D service",
                });
            }
        },
        [patchWindow, pollForGlb]
    );

    // -----------------------------------------------------------------------
    // Background job: submit a text prompt → get a job id → poll for the .glb.
    // Same detached, long-running pattern as runGeneration, but the submit
    // body is JSON ({ prompt }) hitting the text-to-3D webhook instead of a
    // multipart image upload. Polling is identical (shared poll webhook).
    // -----------------------------------------------------------------------
    const runTextGeneration = useCallback(
        async (id: string, prompt: string) => {
            try {
                console.log(
                    `[text_to_3d] POST ${N8N_OBJECT_TEXT_WEBHOOK} — submitting job, prompt="${prompt}"`
                );
                const res = await fetch(N8N_OBJECT_TEXT_WEBHOOK, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ prompt }),
                });

                if (!res.ok) {
                    const errBody = await res.text();
                    console.error(
                        `[text_to_3d] submit ${res.status}:`,
                        errBody.slice(0, 500)
                    );
                    patchWindow(id, {
                        status: "failed",
                        error: `${res.status}: ${errBody}`.slice(0, 240),
                    });
                    return;
                }

                const text = await res.text();
                console.log("[text_to_3d] submit response:", text.slice(0, 500));
                let data: any = text;
                try {
                    data = JSON.parse(text);
                } catch {
                    // leave as raw string
                }

                // Job id lives in `id` (fall back to a couple of likely names).
                const root = Array.isArray(data) ? data[0] : data;
                const jobId =
                    root && typeof root === "object"
                        ? root.id ?? root.jobid ?? root.job_id ?? root.task_id
                        : typeof root === "string"
                          ? root
                          : undefined;

                if (jobId === undefined || jobId === null || jobId === "") {
                    console.error("[text_to_3d] no job id in submit response");
                    patchWindow(id, {
                        status: "failed",
                        error: "The 3D service didn't return a job id.",
                    });
                    return;
                }

                console.log("[text_to_3d] job id:", jobId);
                // Hand off to polling (shared with the image-to-3D flow).
                await pollForGlb(id, String(jobId));
            } catch (err: any) {
                console.error(
                    "[text_to_3d] submit error:",
                    err?.message || err
                );
                patchWindow(id, {
                    status: "failed",
                    error:
                        err?.message ||
                        "Network error contacting the 3D service",
                });
            }
        },
        [patchWindow, pollForGlb]
    );


    // -----------------------------------------------------------------------
    // Public: capture a frame, open a loading viewer window, and kick off the

    // (long-running) 3D generation in the BACKGROUND. Returns IMMEDIATELY with
    // a short status message so the agent's client-tool call doesn't block for
    // minutes and time out. The window fills in when the model is ready.
    // -----------------------------------------------------------------------
    const scanToObject = useCallback(
        async (
            video: HTMLVideoElement,
            label = "Scanned object"
        ): Promise<{ ok: boolean; message: string; id?: string }> => {
            const blob = await captureFrameAsBlob(video);
            if (!blob) {
                console.error("[scan_to_3d] captureFrameAsBlob returned null");
                return {
                    ok: false,
                    message:
                        "I couldn't capture the camera frame. Please make sure the camera is on and try again.",
                };
            }
            console.log(
                `[scan_to_3d] captured frame: ${blob.size} bytes, type=${blob.type}`
            );

            const id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `obj_${Date.now()}_${Math.random()
                          .toString(36)
                          .slice(2, 8)}`;

            zCounterRef.current += 1;

            const newWindow: ObjectWindow = {
                id,
                label: label || "Scanned object",
                status: "loading",
                createdAt: Date.now(),
                position: computeSpawnPosition(windowsRef.current.length),
                zIndex: zCounterRef.current,
            };

            setWindows((prev) => [...prev, newWindow]);
            setError("");

            // Fire-and-forget — do NOT await (see runGeneration comment).
            void runGeneration(id, blob);

            return {
                ok: true,
                id,
                message:
                    "I've captured the object and started building the 3D model — a loading window is on screen now. This takes a few minutes; it'll fill in automatically when the model is ready, so you can keep chatting meanwhile.",
            };
        },
        [runGeneration]
    );

    // -----------------------------------------------------------------------
    // Public: generate a 3D object from a TEXT prompt only (no camera / image).
    // Opens a loading viewer window and kicks off the (long-running) text-to-3D
    // job in the BACKGROUND, returning IMMEDIATELY with a status message so the
    // agent's client-tool call doesn't block for minutes and time out. The
    // window fills in on its own when the model is ready.
    // -----------------------------------------------------------------------
    const generateFromText = useCallback(
        (
            prompt: string,
            label?: string
        ): { ok: boolean; message: string; id?: string } => {
            const promptStr = typeof prompt === "string" ? prompt.trim() : "";
            if (!promptStr) {
                return {
                    ok: false,
                    message:
                        "I need a description of the object you'd like me to build in 3D.",
                };
            }

            const id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `obj_${Date.now()}_${Math.random()
                          .toString(36)
                          .slice(2, 8)}`;

            zCounterRef.current += 1;

            const newWindow: ObjectWindow = {
                id,
                label: (label || promptStr).slice(0, 60),
                status: "loading",
                createdAt: Date.now(),
                position: computeSpawnPosition(windowsRef.current.length),
                zIndex: zCounterRef.current,
            };

            setWindows((prev) => [...prev, newWindow]);
            setError("");

            // Fire-and-forget — do NOT await (see runTextGeneration comment).
            void runTextGeneration(id, promptStr);

            return {
                ok: true,
                id,
                message: `I've started building a 3D model of "${promptStr}" — a loading window is on screen now. This takes a few minutes; it'll fill in automatically when the model is ready, so you can keep chatting meanwhile.`,
            };
        },
        [runTextGeneration]
    );


    const closeWindow = useCallback((id: string) => {

        setWindows((prev) => prev.filter((w) => w.id !== id));
    }, []);

    const focusWindow = useCallback((id: string) => {
        zCounterRef.current += 1;
        const next = zCounterRef.current;
        setWindows((prev) =>
            prev.map((w) => (w.id === id ? { ...w, zIndex: next } : w))
        );
    }, []);

    const updateWindowPosition = useCallback(
        (id: string, position: { x: number; y: number }) => {
            patchWindow(id, { position });
        },
        [patchWindow]
    );

    return {
        windows,
        error,
        scanToObject,
        generateFromText,
        closeWindow,

        focusWindow,
        updateWindowPosition,
    };
};
