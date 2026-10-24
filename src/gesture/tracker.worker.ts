// Hand tracking off the main thread. Inference (even on the GPU) involves a
// synchronous readback; keeping it here means the UI thread only ever does the
// cheap work of moving a cursor.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import {
    FRAME_FLOATS,
    LANDMARK_COUNT,
    type Delegate,
    type MainToWorker,
    type WorkerToMain,
} from "./types";
import {
    MIN_DETECTION_CONF,
    MIN_PRESENCE_CONF,
    MIN_TRACKING_CONF,
} from "./config";

// lib.dom and lib.webworker clash, so type only what we use of the worker scope.
interface WorkerScope {
    onmessage: ((e: MessageEvent<MainToWorker>) => void) | null;
    postMessage(message: WorkerToMain, transfer?: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

let landmarker: HandLandmarker | null = null;
let lastTs = 0;

/** VIDEO mode needs strictly increasing integer-ms timestamps. */
const nextTimestamp = (): number => {
    lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
    return lastTs;
};

const init = async (
    wasmBase: string,
    modelUrl: string,
    preferred: Delegate
): Promise<Delegate> => {
    // We run as a module worker, where the classic wasm loader can't register
    // itself ("ModuleFactory not set"), so ask for the ES module build.
    const fileset = await FilesetResolver.forVisionTasks(wasmBase, true);
    const create = (delegate: Delegate) =>
        HandLandmarker.createFromOptions(fileset, {
            baseOptions: { modelAssetPath: modelUrl, delegate },
            runningMode: "VIDEO",
            // One hand only. With numHands > 1 MediaPipe re-runs the palm
            // detector every frame hunting for the missing hands, which is
            // the single biggest avoidable per-frame cost.
            numHands: 1,
            minHandDetectionConfidence: MIN_DETECTION_CONF,
            minHandPresenceConfidence: MIN_PRESENCE_CONF,
            minTrackingConfidence: MIN_TRACKING_CONF,
        });

    let delegate: Delegate = preferred;
    try {
        landmarker = await create(preferred);
    } catch (error) {
        if (preferred === "CPU") throw error;
        console.warn("[gesture] GPU delegate unavailable, using CPU:", error);
        delegate = "CPU";
        landmarker = await create("CPU");
    }

    // Compile the GPU graph now (on a blank frame) so the first real frame
    // doesn't hitch.
    const blank = new OffscreenCanvas(640, 480);
    landmarker.detectForVideo(blank, nextTimestamp());
    return delegate;
};

const track = (image: ImageBitmap, id: number): void => {
    if (!landmarker) {
        image.close();
        return;
    }
    const started = performance.now();
    let data: Float32Array | null = null;
    try {
        const result = landmarker.detectForVideo(image, nextTimestamp());
        const landmarks = result.landmarks[0];
        const world = result.worldLandmarks[0];
        if (landmarks && world && landmarks.length === LANDMARK_COUNT) {
            data = new Float32Array(FRAME_FLOATS);
            const worldOffset = LANDMARK_COUNT * 3;
            for (let i = 0; i < LANDMARK_COUNT; i++) {
                data[i * 3] = landmarks[i].x;
                data[i * 3 + 1] = landmarks[i].y;
                data[i * 3 + 2] = landmarks[i].z;
                data[worldOffset + i * 3] = world[i].x;
                data[worldOffset + i * 3 + 1] = world[i].y;
                data[worldOffset + i * 3 + 2] = world[i].z;
            }
        }
    } catch (error) {
        ctx.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
        });
    } finally {
        image.close();
    }
    const inferMs = performance.now() - started;
    ctx.postMessage(
        { type: "result", id, data, inferMs },
        data ? [data.buffer] : []
    );
};

ctx.onmessage = (event) => {
    const msg = event.data;
    if (msg.type === "init") {
        init(msg.wasmBase, msg.modelUrl, msg.delegate ?? "GPU")
            .then((delegate) => ctx.postMessage({ type: "ready", delegate }))
            .catch((error: unknown) =>
                ctx.postMessage({
                    type: "error",
                    message:
                        error instanceof Error ? error.message : String(error),
                })
            );
    } else if (msg.type === "frame") {
        track(msg.image, msg.id);
    }
};
