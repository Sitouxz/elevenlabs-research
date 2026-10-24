import {
    FRAME_FLOATS,
    LANDMARK_COUNT,
    type Delegate,
    type FrameMeta,
    type HandFrame,
    type MainToWorker,
    type WorkerToMain,
} from "./types";

const IDLE_DISPOSE_MS = 60_000;
const WATCHDOG_MS = 1000;

const assetUrl = (path: string): string =>
    new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href;

/**
 * Main-thread side of the tracker. It only does the cheap parts: pull one
 * frame per real camera frame, hand it to the worker, deliver the result.
 *
 * Latency rules baked in here:
 *  - requestVideoFrameCallback fires exactly when the camera delivers a frame,
 *    so we never poll (rAF would add up to one display frame of lag) and never
 *    process the same frame twice.
 *  - The worker handles one frame at a time, and exactly one newer frame may
 *    wait in a "newest wins" slot. Older waiting frames are dropped, never
 *    queued: a queue is stale data and pure latency. The slot keeps the
 *    worker saturated, so it never idles between a result and the next
 *    camera frame.
 *  - ImageBitmaps are transferred, not copied.
 */
export class HandTracker {
    onFrame: ((hand: HandFrame | null, meta: FrameMeta) => void) | null = null;
    onError: ((message: string) => void) | null = null;

    private static pooled: HandTracker | null = null;

    private readonly worker: Worker;
    private readonly readyPromise: Promise<Delegate>;
    private video: HTMLVideoElement | null = null;
    private running = false;
    private workerBusy = false;
    private busySince = 0;
    private preparing = false;
    private sentCaptureTs = 0;
    private pending: { image: ImageBitmap; captureTs: number } | null = null;
    private frameId = 0;
    private lastMediaTime = -1;
    private callbackHandle = 0;
    private idleTimer: number | undefined;
    private disposed = false;
    // Bumped on every stop(): lets a start() still waiting on the model find
    // out it was cancelled instead of resurrecting the frame pump.
    private session = 0;

    /** Reuse a warmed-up tracker if there is one, otherwise create one. */
    static acquire(): HandTracker {
        const tracker = HandTracker.pooled ?? new HandTracker();
        HandTracker.pooled = null;
        window.clearTimeout(tracker.idleTimer);
        return tracker;
    }

    /** Start loading the model before the user asks for it (e.g. on hover). */
    static preload(): void {
        if (HandTracker.pooled && !HandTracker.pooled.disposed) return;
        HandTracker.pooled = new HandTracker();
        HandTracker.pooled.armIdleDispose();
    }

    private constructor() {
        this.worker = new Worker(
            new URL("./tracker.worker.ts", import.meta.url),
            { type: "module" }
        );
        this.readyPromise = new Promise<Delegate>((resolve, reject) => {
            this.worker.onmessage = (event: MessageEvent<WorkerToMain>) => {
                const msg = event.data;
                if (msg.type === "ready") {
                    resolve(msg.delegate);
                    this.worker.onmessage = this.handleMessage;
                } else if (msg.type === "error") {
                    reject(new Error(msg.message));
                }
            };
            this.worker.onerror = (event) => {
                const message = event.message || "Hand tracker worker crashed";
                reject(new Error(message));
                this.onError?.(message);
            };
        });
        // Avoid an unhandled rejection if nobody awaits (preload only).
        this.readyPromise.catch(() => undefined);
        this.post({
            type: "init",
            wasmBase: assetUrl("mediapipe/wasm"),
            modelUrl: assetUrl("mediapipe/hand_landmarker.task"),
        });
    }

    /** Resolves with the delegate in use once the model is loaded. */
    start(video: HTMLVideoElement): Promise<Delegate> {
        const session = ++this.session;
        return this.readyPromise.then((delegate) => {
            if (this.disposed || session !== this.session) {
                throw new Error("Tracker start cancelled");
            }
            this.video = video;
            this.running = true;
            this.workerBusy = false;
            this.lastMediaTime = -1;
            this.schedule();
            return delegate;
        });
    }

    /** Stop pumping but keep the loaded model around for quick re-entry. */
    release(): void {
        this.stop();
        this.onFrame = null;
        this.onError = null;
        HandTracker.pooled = this;
        this.armIdleDispose();
    }

    dispose(): void {
        this.stop();
        this.disposed = true;
        window.clearTimeout(this.idleTimer);
        this.worker.terminate();
        if (HandTracker.pooled === this) HandTracker.pooled = null;
    }

    private stop(): void {
        this.session++;
        this.running = false;
        const video = this.video;
        if (video && this.callbackHandle) {
            if ("cancelVideoFrameCallback" in video) {
                video.cancelVideoFrameCallback(this.callbackHandle);
            } else {
                cancelAnimationFrame(this.callbackHandle);
            }
        }
        this.callbackHandle = 0;
        this.video = null;
        this.pending?.image.close();
        this.pending = null;
    }

    private armIdleDispose(): void {
        window.clearTimeout(this.idleTimer);
        this.idleTimer = window.setTimeout(() => this.dispose(), IDLE_DISPOSE_MS);
    }

    private post(msg: MainToWorker, transfer: Transferable[] = []): void {
        this.worker.postMessage(msg, transfer);
    }

    private schedule(): void {
        const video = this.video;
        if (!video) return;
        if ("requestVideoFrameCallback" in video) {
            this.callbackHandle = video.requestVideoFrameCallback(this.onVideoFrame);
        } else {
            this.callbackHandle = requestAnimationFrame((now) =>
                this.onVideoFrame(now)
            );
        }
    }

    private onVideoFrame = (
        now: DOMHighResTimeStamp,
        meta?: VideoFrameCallbackMetadata
    ): void => {
        if (!this.running || !this.video) return;
        this.schedule();
        const video = this.video;

        // Fallback path (no rVFC) polls on rAF: skip frames we've already seen.
        if (!meta) {
            if (video.currentTime === this.lastMediaTime) return;
            this.lastMediaTime = video.currentTime;
        }
        if (video.readyState < 2) return;

        // Never wedge forever if the worker stops answering.
        if (this.workerBusy && now - this.busySince > WATCHDOG_MS) {
            this.workerBusy = false;
        }
        // captureTime is on the performance.now() timeline, so latency can be
        // measured honestly from the camera, not from when we noticed the frame.
        const captureTs = meta?.captureTime ?? now;

        // One conversion at a time; the next camera frame will come soon.
        if (this.preparing) return;
        this.preparing = true;
        createImageBitmap(video)
            .then((image) => {
                this.preparing = false;
                this.accept(image, captureTs);
            })
            .catch(() => {
                this.preparing = false;
            });
    };

    private accept(image: ImageBitmap, captureTs: number): void {
        if (!this.running || this.disposed) {
            image.close();
            return;
        }
        if (!this.workerBusy) {
            this.send(image, captureTs);
            return;
        }
        // Worker busy: this frame replaces whatever was waiting. The slot
        // holds at most one frame, always the newest, so the worker never
        // starts on stale data and never idles either.
        this.pending?.image.close();
        this.pending = { image, captureTs };
    }
    private send(image: ImageBitmap, captureTs: number): void {
        this.workerBusy = true;
        this.busySince = performance.now();
        this.sentCaptureTs = captureTs;
        this.post({ type: "frame", image, id: ++this.frameId }, [image]);
    }

    private handleMessage = (event: MessageEvent<WorkerToMain>): void => {
        const msg = event.data;
        if (msg.type === "result") {
            const captureTs = this.sentCaptureTs;
            this.workerBusy = false;
            // Hand the worker its next frame before we spend time on this
            // result, so inference overlaps with cursor/DOM work.
            const next = this.pending;
            this.pending = null;
            if (next) {
                if (this.running) this.send(next.image, next.captureTs);
                else next.image.close();
            }
            if (!this.running) return;

            const meta: FrameMeta = { captureTs, inferMs: msg.inferMs };
            if (!msg.data || msg.data.length !== FRAME_FLOATS) {
                this.onFrame?.(null, meta);
                return;
            }
            const split = LANDMARK_COUNT * 3;
            this.onFrame?.(
                {
                    image: msg.data.subarray(0, split),
                    world: msg.data.subarray(split),
                },
                meta
            );
        } else if (msg.type === "error") {
            this.onError?.(msg.message);
        }
    };
}