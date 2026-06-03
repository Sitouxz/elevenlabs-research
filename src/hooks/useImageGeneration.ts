import { useState, useCallback, useRef, useEffect } from "react";

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

                // Push to history (latest first). Don't dedupe by URL — same
                // prompt twice creates two distinct items.
                setHistory((prev) => {
                    const win = windowsRef.current.find(
                        (w) => w.id === windowId
                    );
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
        (prompt: string, mediaType: MediaType = "image"): string => {
            const trimmed = prompt.trim();
            if (!trimmed) return "";

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
                                input: { prompt: trimmed },
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
        reopenFromHistory,
        clearHistory,
    };
};
