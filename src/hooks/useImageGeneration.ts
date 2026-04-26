import { useState, useCallback, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Replicate image generation hook
//
// Architecture:
//   browser -> /api/replicate/* (Vite dev proxy) -> https://api.replicate.com/v1/*
//   The proxy injects the Authorization: Bearer header so the Replicate token
//   never reaches the client bundle (see vite.config.ts).
//
// Endpoint pattern used (works for any owner/model on Replicate):
//   POST /api/replicate/models/{owner}/{model}/predictions
//   GET  /api/replicate/predictions/{id}
//
// We send the `Prefer: wait=60` header on the initial POST so fast models
// (e.g. flux-schnell) return the finished prediction in a single round trip.
// Slower models fall back to short-interval polling.
// ---------------------------------------------------------------------------

const DEFAULT_MODEL =
    import.meta.env.VITE_REPLICATE_MODEL || "black-forest-labs/flux-schnell";
const POLL_INTERVAL_MS = 800;
const MAX_POLL_MS = 90_000;

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
    prompt: string;
    status: WindowStatus;
    imageUrl?: string;
    error?: string;
    predictionId?: string;
    createdAt: number;
    completedAt?: number;
    position: { x: number; y: number };
    zIndex: number;
}

export interface ImageHistoryItem {
    id: string;
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
    // Internal: poll a prediction until it terminates
    // -----------------------------------------------------------------------
    const pollPrediction = useCallback(
        (
            windowId: string,
            predictionId: string,
            startedAt: number
        ) => {
            const tick = async () => {
                if (Date.now() - startedAt > MAX_POLL_MS) {
                    patchWindow(windowId, {
                        status: "failed",
                        error: "Timed out after 90s",
                    });
                    activePollsRef.current.delete(windowId);
                    return;
                }

                try {
                    const res = await fetch(
                        `/api/replicate/predictions/${predictionId}`
                    );
                    if (!res.ok) {
                        patchWindow(windowId, {
                            status: "failed",
                            error: `Poll error ${res.status}`,
                        });
                        activePollsRef.current.delete(windowId);
                        return;
                    }
                    const data = await res.json();
                    handlePredictionResult(windowId, data);
                    if (
                        data.status === "starting" ||
                        data.status === "processing"
                    ) {
                        const handle = window.setTimeout(
                            tick,
                            POLL_INTERVAL_MS
                        );
                        activePollsRef.current.set(windowId, handle);
                    } else {
                        activePollsRef.current.delete(windowId);
                    }
                } catch (err: any) {
                    patchWindow(windowId, {
                        status: "failed",
                        error: err?.message || "Network error while polling",
                    });
                    activePollsRef.current.delete(windowId);
                }
            };

            const handle = window.setTimeout(tick, POLL_INTERVAL_MS);
            activePollsRef.current.set(windowId, handle);
        },
        [patchWindow]
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
                        error: "No image URL returned",
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
        (prompt: string): string => {
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
                prompt: trimmed,
                status: "loading",
                createdAt: Date.now(),
                position: computeSpawnPosition(windowsRef.current.length),
                zIndex: zCounterRef.current,
            };

            setWindows((prev) => [...prev, newWindow]);
            setError("");

            const { owner, name } = parseModel(DEFAULT_MODEL);
            const startedAt = Date.now();

            (async () => {
                try {
                    const res = await fetch(
                        `/api/replicate/models/${owner}/${name}/predictions`,
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                // Block up to 60s on the initial POST so fast
                                // models return without us needing to poll.
                                Prefer: "wait=60",
                            },
                            body: JSON.stringify({
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
                        setError(`Replicate ${res.status}`);
                        return;
                    }

                    const data = await res.json();
                    patchWindow(id, { predictionId: data?.id });
                    handlePredictionResult(id, data);

                    // If the model didn't finish during the wait window,
                    // start polling.
                    if (
                        data?.status === "starting" ||
                        data?.status === "processing"
                    ) {
                        if (data?.id) {
                            pollPrediction(id, data.id, startedAt);
                        } else {
                            patchWindow(id, {
                                status: "failed",
                                error: "Missing prediction id",
                            });
                        }
                    }
                } catch (err: any) {
                    patchWindow(id, {
                        status: "failed",
                        error:
                            err?.message ||
                            "Network error contacting Replicate",
                    });
                }
            })();

            return id;
        },
        [handlePredictionResult, patchWindow, pollPrediction]
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
        model: DEFAULT_MODEL,
        generate,
        closeWindow,
        focusWindow,
        updateWindowPosition,
        reopenFromHistory,
        clearHistory,
    };
};
