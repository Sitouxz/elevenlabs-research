import { useState, useCallback, useRef, useEffect } from "react";
import {
    checkPromptSafety,
    getModerationRefusalMessage,
} from "../utils/contentModeration";

// ---------------------------------------------------------------------------
// Replicate media (image + video) generation hook
//
// Architecture:
//   browser -> n8n webhook -> https://api.replicate.com/v1/*
//   n8n acts as a proxy to handle CORS and inject the API token.
//   The webhook waits for the result and returns it directly in the response.
//
// Endpoint pattern:
//   POST {N8N_IMAGE_WEBHOOK} - creates image prediction and waits for result
//   POST {N8N_VIDEO_WEBHOOK} - creates video prediction and waits for result
// ---------------------------------------------------------------------------

// Socket.IO v4 (EIO=4) endpoint — sid is session-specific, so omit it and let
// the server assign one on each connection.
const XR_WS_URL = "wss://xr-api.fxwebapps.com/socket.io/?EIO=4&transport=websocket";

// Sends two Socket.IO events over a short-lived connection:
//   emit("image_url", url)
//   emit("message", "image generated")
// Follows Engine.IO v4 framing: "0"=open, "2"=ping→"3"pong, "40"=SIO connect, "42"=SIO event.
function sendToXR(url: string) {
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
                // Socket.IO namespace connected → emit events then close
                sioConnected = true;
                ws.send(`42["image_url",${JSON.stringify(url)}]`);
                ws.send(`42["message",${JSON.stringify(url)}]`);
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

export type MediaType = "image" | "video";

const N8N_IMAGE_WEBHOOK = import.meta.env.VITE_N8N_IMAGE_WEBHOOK || "https://fxaitools.app.n8n.cloud/webhook/generate-image-jarvis";
const N8N_VIDEO_WEBHOOK = import.meta.env.VITE_N8N_VIDEO_WEBHOOK || "https://fxaitools.app.n8n.cloud/webhook/generate-video-jarvis";

const WEBHOOK_BY_TYPE: Record<MediaType, string> = {
    image: N8N_IMAGE_WEBHOOK,
    video: N8N_VIDEO_WEBHOOK,
};

const IMAGE_MODEL =
    import.meta.env.VITE_REPLICATE_MODEL || "black-forest-labs/flux-schnell";
const VIDEO_MODEL =
    import.meta.env.VITE_REPLICATE_VIDEO_MODEL ||
    "wan-video/wan-2.2-t2v-fast";

const MODEL_BY_TYPE: Record<MediaType, string> = {
    image: IMAGE_MODEL,
    video: VIDEO_MODEL,
};

// const POLL_INTERVAL_MS = 800;
// Image generations should complete in <90s. Video models routinely take
// 1-2 minutes, sometimes more for higher-quality models.
// const MAX_POLL_MS_BY_TYPE: Record<MediaType, number> = {
//     image: 90_000,
//     video: 300_000,
// };

const WINDOW_WIDTH = 512;
const WINDOW_HEIGHT = 600; // body 512 + header/footer ~88
const SPAWN_OFFSET = 28;

export type WindowStatus =
    | "loading"
    | "succeeded"
    | "failed"
    | "canceled";

export interface ImageWindow {
    id: string;
    mediaType: MediaType;
    prompt: string;
    status: WindowStatus;
    imageUrl?: string; // Either an image URL or an mp4 URL depending on mediaType
    error?: string;
    predictionId?: string;
    createdAt: number;
    completedAt?: number;
    position: { x: number; y: number };
    zIndex: number;
}

export interface ImageHistoryItem {
    id: string;
    mediaType: MediaType;
    prompt: string;
    imageUrl: string;
    createdAt: number;
}

const computeSpawnPosition = (existingCount: number) => {
    if (typeof window === "undefined") {
        return { x: 100, y: 100 };
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

const parseModel = (slug: string): { owner: string; name: string } => {
    const [owner, name] = slug.split("/");
    return { owner: owner || "black-forest-labs", name: name || "flux-schnell" };
};

export const useImageGeneration = () => {
    const [windows, setWindows] = useState<ImageWindow[]>([]);
    const [history, setHistory] = useState<ImageHistoryItem[]>([]);
    const [error, setError] = useState<string>("");

    const zCounterRef = useRef(100);
    const activePollsRef = useRef<Map<string, number>>(new Map());

    // Always have access to the latest windows count for cascading spawn
    const windowsRef = useRef<ImageWindow[]>([]);
    useEffect(() => {
        windowsRef.current = windows;
    }, [windows]);

    // Track the most recently generated image URL so the AI can reference it
    // when the user asks to edit or iterate on a previous generation.
    const lastImageUrlRef = useRef<string | null>(null);

    // Track when the last image completed so we can detect conversational edits.
    // If the user asks for another image shortly after seeing the result, it's
    // almost certainly an edit / iteration request.
    const lastImageTimeRef = useRef<number>(0);

    // The prompt used for the last generated image. Paired with the new
    // prompt's keywords to tell "edit the same subject" apart from "generate
    // something completely different" (see soundsLikeSameSubject in App.tsx).
    const lastPromptRef = useRef<string>("");

    // -----------------------------------------------------------------------
    // Internal: update a single window by id
    // -----------------------------------------------------------------------
    const patchWindow = useCallback(
        (id: string, patch: Partial<ImageWindow>) => {
            setWindows((prev) =>
                prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
            );
        },
        []
    );


    // -----------------------------------------------------------------------
    // Internal: extract URL + push to history when a prediction terminates
    // -----------------------------------------------------------------------
    const handlePredictionResult = useCallback(
        (windowId: string, data: any) => {
            const status: string = data?.status;

            if (status === "succeeded") {
                // Replicate returns either a string or an array depending on
                // the model. Normalize to the first URL.
                const raw = data?.output;
                const url: string | undefined = Array.isArray(raw)
                    ? raw[0]
                    : typeof raw === "string"
                      ? raw
                      : undefined;

                if (!url) {
                    patchWindow(windowId, {
                        status: "failed",
                        error: "No media URL returned",
                    });
                    return;
                }

                patchWindow(windowId, {
                    status: "succeeded",
                    imageUrl: url,
                    completedAt: Date.now(),
                });

                const win = windowsRef.current.find((w) => w.id === windowId);

                // Remember the last generated image (URL + prompt + timestamp)
                // for reference-based iteration (e.g. "make it turn left").
                // Only images are useful as a style/edit reference — videos
                // don't apply here.
                if (win?.mediaType === "image") {
                    lastImageUrlRef.current = url;
                    lastImageTimeRef.current = Date.now();
                    lastPromptRef.current = win.prompt;
                }

                sendToXR(url);

                // Push to history (latest first). Don't dedupe by URL — same
                // prompt twice creates two distinct items.
                setHistory((prev) => {
                    const item: ImageHistoryItem = {
                        id: windowId,
                        mediaType: win?.mediaType || "image",
                        prompt: win?.prompt || "(no prompt)",
                        imageUrl: url,
                        createdAt: Date.now(),
                    };
                    return [item, ...prev].slice(0, 60);
                });
            } else if (status === "failed" || status === "canceled") {
                patchWindow(windowId, {
                    status: status === "canceled" ? "canceled" : "failed",
                    error: data?.error
                        ? String(data.error)
                        : status === "canceled"
                          ? "Generation canceled"
                          : "Generation failed",
                });
            }
        },
        [patchWindow]
    );

    // -----------------------------------------------------------------------
    // Public: kick off a new generation. Returns the windowId.
    // -----------------------------------------------------------------------
    const generate = useCallback(
        (
            prompt: string,
            mediaType: MediaType = "image",
            referenceImage?: string,
        ): string => {
            const trimmed = prompt.trim();
            if (!trimmed) return "";

            const moderation = checkPromptSafety(trimmed);
            if (moderation.blocked) {
                setError(getModerationRefusalMessage(moderation));
                return "";
            }

            const id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `win_${Date.now()}_${Math.random()
                          .toString(36)
                          .slice(2, 8)}`;

            zCounterRef.current += 1;

            const newWindow: ImageWindow = {
                id,
                mediaType,
                prompt: trimmed,
                status: "loading",
                createdAt: Date.now(),
                position: computeSpawnPosition(windowsRef.current.length),
                zIndex: zCounterRef.current,
            };

            setWindows((prev) => [...prev, newWindow]);
            setError("");

            const { owner, name } = parseModel(MODEL_BY_TYPE[mediaType]);
            const webhookUrl = WEBHOOK_BY_TYPE[mediaType];

            (async () => {
                try {
                    const res = await fetch(
                        webhookUrl,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                                owner,
                                model: name,
                                input: {
                                    prompt: trimmed,
                                    ...(referenceImage
                                        ? { image: referenceImage }
                                        : {}),
                                },
                            }),
                        }
                    );

                    if (!res.ok) {
                        const errBody = await res.text();
                        let parsed = errBody;
                        try {
                            const j = JSON.parse(errBody);
                            parsed = j?.detail || j?.error || errBody;
                        } catch {
                            // not JSON, leave as-is
                        }
                        patchWindow(id, {
                            status: "failed",
                            error: `${res.status}: ${parsed}`.slice(0, 240),
                        });
                        setError(`Generation ${res.status}`);
                        return;
                    }

                    const data = await res.json();
                    handlePredictionResult(id, data);
                } catch (err: any) {
                    patchWindow(id, {
                        status: "failed",
                        error:
                            err?.message ||
                            "Network error contacting generation service",
                    });
                }
            })();

            return id;
        },
        [handlePredictionResult, patchWindow]
    );

    // -----------------------------------------------------------------------
    // Public: window controls
    // -----------------------------------------------------------------------
    const closeWindow = useCallback((id: string) => {
        const handle = activePollsRef.current.get(id);
        if (handle) {
            clearTimeout(handle);
            activePollsRef.current.delete(id);
        }
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

    // -----------------------------------------------------------------------
    // Public: re-open a history item in a brand-new window (no API call)
    // -----------------------------------------------------------------------
    const reopenFromHistory = useCallback(
        (item: ImageHistoryItem): string => {
            const id =
                typeof crypto !== "undefined" && "randomUUID" in crypto
                    ? crypto.randomUUID()
                    : `win_${Date.now()}_${Math.random()
                          .toString(36)
                          .slice(2, 8)}`;

            zCounterRef.current += 1;

            const newWindow: ImageWindow = {
                id,
                mediaType: item.mediaType,
                prompt: item.prompt,
                status: "succeeded",
                imageUrl: item.imageUrl,
                createdAt: Date.now(),
                completedAt: Date.now(),
                position: computeSpawnPosition(windowsRef.current.length),
                zIndex: zCounterRef.current,
            };

            setWindows((prev) => [...prev, newWindow]);
            return id;
        },
        []
    );

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    // Cleanup any pending polls on unmount
    useEffect(() => {
        return () => {
            activePollsRef.current.forEach((h) => clearTimeout(h));
            activePollsRef.current.clear();
        };
    }, []);

    return {
        windows,
        history,
        error,
        imageModel: IMAGE_MODEL,
        videoModel: VIDEO_MODEL,
        generate,
        closeWindow,
        focusWindow,
        updateWindowPosition,
        lastImageUrlRef,
        lastImageTimeRef,
        lastPromptRef,
        reopenFromHistory,
        clearHistory,
    };
};
