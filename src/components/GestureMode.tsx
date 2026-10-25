import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { GestureEngine } from "../gesture/GestureEngine";
import { HandTracker } from "../gesture/HandTracker";
import type { Delegate, GestureStats, Pose } from "../gesture/types";

interface GestureModeProps {
    stream: MediaStream | null;
    cameraError: string;
    onExit: () => void;
}

type Status = "loading" | "ready" | "error";

const HINT_MS = 8000;

const POSE_LABEL: Record<Pose, string> = {
    none: "",
    point: "Point",
    pinch: "Pinch",
    scroll: "Scroll",
    fist: "Hold to exit",
};

/**
 * Full-viewport camera with hand tracking on top of the live app. Everything
 * is portalled to <body>: the app UI keeps rendering above the (mirrored)
 * camera, and a pointer-events:none canvas draws the hand and cursor above it
 * all. Per-frame work never touches React state; React only sees status, pose
 * changes and a 4 Hz stats tick.
 */
export const GestureMode = ({ stream, cameraError, onExit }: GestureModeProps) => {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const onExitRef = useRef(onExit);
    const [status, setStatus] = useState<Status>("loading");
    const [errorMessage, setErrorMessage] = useState("");
    const [delegate, setDelegate] = useState<Delegate | null>(null);
    const [pose, setPose] = useState<Pose>("none");
    const [stats, setStats] = useState<GestureStats | null>(null);
    const [hintExpired, setHintExpired] = useState(false);

    useEffect(() => {
        onExitRef.current = onExit;
    });

    // Camera shows through the app: drop the opaque page background and the
    // backdrop blur (re-blurring live video every frame costs latency).
    useEffect(() => {
        document.body.classList.add("gesture-mode");
        return () => document.body.classList.remove("gesture-mode");
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => setHintExpired(true), HINT_MS);
        return () => window.clearTimeout(timer);
    }, []);

    // Leaving browser fullscreen (Esc) leaves gesture mode; without fullscreen
    // (denied/unsupported) Esc is handled here.
    useEffect(() => {
        let wasFullscreen = Boolean(document.fullscreenElement);
        const onChange = () => {
            const isFullscreen = Boolean(document.fullscreenElement);
            if (wasFullscreen && !isFullscreen) onExitRef.current();
            wasFullscreen = isFullscreen;
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onExitRef.current();
        };
        document.addEventListener("fullscreenchange", onChange);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("fullscreenchange", onChange);
            window.removeEventListener("keydown", onKey);
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => undefined);
            }
        };
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas || !stream) return;

        let cancelled = false;
        let engine: GestureEngine | null = null;
        let tracker: HandTracker | null = null;
        video.srcObject = stream;

        const syncVideoSize = () =>
            engine?.setVideoSize(video.videoWidth, video.videoHeight);
        const onResize = () => engine?.resize();
        window.addEventListener("resize", onResize);
        video.addEventListener("resize", syncVideoSize);

        const run = async () => {
            try {
                // Constructing these can throw on unsupported browsers (no
                // module workers / 2D canvas); report it instead of crashing.
                const e = new GestureEngine(canvas, video, {
                    onPose: setPose,
                    onStats: setStats,
                    onExitRequested: () => onExitRef.current(),
                });
                const t = HandTracker.acquire();
                engine = e;
                tracker = t;
                t.onFrame = (hand, meta) => e.handleFrame(hand, meta);
                t.onError = (message) => console.warn("[gesture]", message);

                await video.play();
                if (!video.videoWidth) {
                    await new Promise<void>((resolve) =>
                        video.addEventListener("loadedmetadata", () => resolve(), {
                            once: true,
                        })
                    );
                }
                if (cancelled) return;
                syncVideoSize();
                const d = await t.start(video);
                if (cancelled) return;
                setDelegate(d);
                setStatus("ready");
            } catch (error) {
                if (cancelled) return;
                setErrorMessage(
                    error instanceof Error ? error.message : "Hand tracking failed"
                );
                setStatus("error");
            }
        };
        void run();

        return () => {
            cancelled = true;
            window.removeEventListener("resize", onResize);
            video.removeEventListener("resize", syncVideoSize);
            // Keeps the loaded model warm for quick re-entry.
            tracker?.release();
            engine?.dispose();
            video.srcObject = null;
        };    }, [stream]);

    const failed = status === "error" || (!stream && cameraError !== "");
    const handVisible = pose !== "none";

    let statusText = "Starting camera…";
    let dotClass = "bg-yellow-400";
    if (failed) {
        statusText = cameraError || errorMessage || "Hand tracking failed";
        dotClass = "bg-red-400";
    } else if (stream && status === "loading") {
        statusText = "Loading hand model…";
    } else if (status === "ready") {
        statusText = handVisible ? "Tracking" : "Show your hand";
        dotClass = handVisible ? "bg-green-400" : "bg-primary";
    }

    const showHint = status === "ready" && (!handVisible || !hintExpired);

    return createPortal(
        <>
            {/* Mirrored live camera, behind the app UI. */}
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                disablePictureInPicture
                aria-hidden="true"
                // Size and position are set by the engine from the same mapping it
                // uses for the cursor, so the image and the skeleton always agree.
                className="fixed max-w-none pointer-events-none"
                style={{ zIndex: 5, transform: "scaleX(-1)", objectFit: "fill" }}
            />
            {/* Keeps the app's text legible over a busy camera image. */}
            <div
                aria-hidden="true"
                className="fixed inset-0 pointer-events-none bg-midnight/50"
                style={{ zIndex: 6 }}
            />
            {/* Hand skeleton + cursor, above everything. */}
            <canvas
                ref={canvasRef}
                aria-hidden="true"
                className="fixed top-0 left-0 pointer-events-none"
                style={{ zIndex: 9000 }}
            />

            <div
                className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none"
                style={{ zIndex: 9001 }}
            >
                <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-primary/30 bg-background-dark/95 pl-4 pr-1.5 py-1.5 font-mono text-[11px] text-gray-200 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
                    <span role="status" aria-live="polite" className="flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${dotClass}`}
                        />
                        <span className="uppercase tracking-wider">{statusText}</span>
                    </span>
                    {status === "ready" && stats && (
                        <span
                            className="tabular-nums text-primary/80"
                            title={`Hand model inference: ${stats.inferMs} ms. Latency is camera capture to cursor update.`}
                        >
                            {delegate} · {stats.fps} fps · {stats.latencyMs} ms
                        </span>
                    )}
                    {POSE_LABEL[pose] && (
                        <span className="uppercase tracking-wider text-primary">
                            {POSE_LABEL[pose]}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={onExit}
                        aria-label="Exit gesture mode"
                        className="flex h-9 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-4 uppercase tracking-wider text-primary hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                        <X size={14} aria-hidden="true" />
                        Exit
                    </button>
                </div>

                <p
                    className={`rounded-full bg-background-dark/90 px-4 py-1.5 font-mono text-[11px] tracking-wide text-gray-300 transition-opacity duration-200 motion-reduce:transition-none ${
                        showHint ? "opacity-100" : "opacity-0"
                    }`}
                >
                    Point to aim · Pinch to click or drag · Two fingers to scroll · Hold a
                    fist to exit
                </p>
            </div>
        </>,
        document.body
    );
};
