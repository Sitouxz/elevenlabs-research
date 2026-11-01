// Hand tracking off the main thread. Inference (even on the GPU) involves a
// synchronous readback; keeping it here means the UI thread only ever does the
// cheap work of moving a cursor.
//
// Three ways to find a hand, tried in this order each frame:
//  1. ROI: while a small hand is being followed, run on a square crop around it.
//  2. Full frame in VIDEO mode (MediaPipe's own tracking; the normal path).
//  3. Tile scan: the palm detector sees a 192px image, so a hand under ~25% of
//     the frame height is invisible to it. Zoomed square tiles make it findable;
//     one tile per frame, cycling, only while no hand is known.
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
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
    ROI_PAD,
    ROI_TO_FULLFRAME,
    TILE_SIZE,
} from "./config";

// lib.dom and lib.webworker clash, so type only what we use of the worker scope.
interface WorkerScope {
    onmessage: ((e: MessageEvent<MainToWorker>) => void) | null;
    postMessage(message: WorkerToMain, transfer?: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

const CROP_PX = 256;

interface Square {
    x: number;
    y: number;
    side: number;
}

let tracking: HandLandmarker | null = null; // VIDEO mode, full frame
let scanning: HandLandmarker | null = null; // IMAGE mode, stateless, for crops
let lastTs = 0;
let roi: Square | null = null;
let tileCursor = 0;
/** Which path produced the last result (diagnostics only). */
let via: "roi" | "full" | "tile" | "none" = "none";
let cropCanvas: OffscreenCanvas | null = null;
let cropCtx: OffscreenCanvasRenderingContext2D | null = null;

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
    const create = (
        delegate: Delegate,
        mode: "VIDEO" | "IMAGE",
        files: WasmFileset = fileset
    ) =>
        HandLandmarker.createFromOptions(files, {
            baseOptions: { modelAssetPath: modelUrl, delegate },
            runningMode: mode,
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
        tracking = await create(preferred, "VIDEO");
    } catch (error) {
        if (preferred === "CPU") throw error;
        console.warn("[gesture] GPU delegate unavailable, using CPU:", error);
        delegate = "CPU";
        tracking = await create("CPU", "VIDEO");
    }
    // The wasm loader registers itself on a global once per module URL, so a
    // second instance needs its own URL (a query string is enough) or it fails
    // with "ModuleFactory not set". Created strictly after the first finished.
    scanning = await create(delegate, "IMAGE", {
        ...fileset,
        wasmLoaderPath: `${fileset.wasmLoaderPath}?scan`,
    });

    // Compile the GPU graphs now (on a blank frame) so the first real frame
    // doesn't hitch.
    const blank = new OffscreenCanvas(CROP_PX, CROP_PX);
    tracking.detectForVideo(blank, nextTimestamp());
    scanning.detect(blank);
    return delegate;
};

const clamp = (v: number, lo: number, hi: number): number =>
    Math.min(Math.max(v, lo), hi);

/** Run the stateless detector on a zoomed square crop of `image`. */
const detectCrop = (image: ImageBitmap, sq: Square): HandLandmarkerResult | null => {
    if (!scanning) return null;
    if (!cropCanvas) {
        cropCanvas = new OffscreenCanvas(CROP_PX, CROP_PX);
        cropCtx = cropCanvas.getContext("2d", { alpha: false });
    }
    if (!cropCtx) return null;
    cropCtx.drawImage(image, sq.x, sq.y, sq.side, sq.side, 0, 0, CROP_PX, CROP_PX);
    const result = scanning.detect(cropCanvas);
    return result.landmarks[0] ? result : null;
};

const tileAt = (index: number, w: number, h: number): Square => {
    const side = Math.min(Math.round(TILE_SIZE * h), w, h);
    const xs = [(w - side) / 2, 0, w - side];
    const ys = [h - side, 0];
    // Centre column first, bottom row first: that's where hands usually are.
    const col = [0, 1, 2][Math.floor(index / 2) % 3];
    const row = index % 2;
    return { x: xs[col], y: ys[row], side };
};
const TILE_COUNT = 6;

interface Packed {
    data: Float32Array;
    /** Hand size in pixels (longest side of its bounding box). */
    sizePx: number;
    cx: number;
    cy: number;
}

/**
 * Pack a result into the transfer layout. `crop` maps crop-local landmarks
 * back into full-frame normalised coordinates.
 */
const pack = (
    result: HandLandmarkerResult,
    w: number,
    h: number,
    crop: Square | null
): Packed | null => {
    const landmarks = result.landmarks[0];
    const world = result.worldLandmarks[0];
    if (!landmarks || !world || landmarks.length !== LANDMARK_COUNT) return null;

    const data = new Float32Array(FRAME_FLOATS);
    const worldOffset = LANDMARK_COUNT * 3;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < LANDMARK_COUNT; i++) {
        const px = crop ? crop.x + landmarks[i].x * crop.side : landmarks[i].x * w;
        const py = crop ? crop.y + landmarks[i].y * crop.side : landmarks[i].y * h;
        data[i * 3] = px / w;
        data[i * 3 + 1] = py / h;
        data[i * 3 + 2] = crop ? (landmarks[i].z * crop.side) / w : landmarks[i].z;
        data[worldOffset + i * 3] = world[i].x;
        data[worldOffset + i * 3 + 1] = world[i].y;
        data[worldOffset + i * 3 + 2] = world[i].z;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
    }
    return {
        data,
        sizePx: Math.max(maxX - minX, maxY - minY),
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
    };
};

const roiAround = (p: Packed, w: number, h: number): Square => {
    const side = Math.min(Math.max(p.sizePx * ROI_PAD, 0.4 * h), w, h);
    return {
        x: clamp(p.cx - side / 2, 0, w - side),
        y: clamp(p.cy - side / 2, 0, h - side),
        side,
    };
};

const locate = (image: ImageBitmap): Packed | null => {
    if (!tracking) return null;
    const w = image.width;
    const h = image.height;

    // 1. Small hand already being followed: stay zoomed on it.
    if (roi) {
        const hit = detectCrop(image, roi);
        const packed = hit ? pack(hit, w, h, roi) : null;
        if (packed) {
            // Big enough for the normal tracker again: hand back over to it.
            roi = packed.sizePx > ROI_TO_FULLFRAME * h ? null : roiAround(packed, w, h);
            via = "roi";
            return packed;
        }
        roi = null;
    }

    // 2. Normal path.
    const full = pack(tracking.detectForVideo(image, nextTimestamp()), w, h, null);
    if (full) {
        via = "full";
        return full;
    }

    // 3. Nothing found: look through one zoomed tile.
    const tile = tileAt(tileCursor++ % TILE_COUNT, w, h);
    const hit = detectCrop(image, tile);
    const packed = hit ? pack(hit, w, h, tile) : null;
    via = packed ? "tile" : "none";
    if (packed) roi = roiAround(packed, w, h);
    return packed;
};

const track = (image: ImageBitmap, id: number): void => {
    if (!tracking) {
        image.close();
        return;
    }
    const started = performance.now();
    let data: Float32Array | null = null;
    try {
        data = locate(image)?.data ?? null;
    } catch (error) {
        roi = null;
        ctx.postMessage({
            type: "error",
            message: error instanceof Error ? error.message : String(error),
        });
    } finally {
        image.close();
    }
    const inferMs = performance.now() - started;
    ctx.postMessage(
        { type: "result", id, data, inferMs, via },
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
