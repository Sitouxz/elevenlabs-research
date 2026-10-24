import {
    FINGER_CURLED,
    FINGER_EXTENDED,
    PINCH_OFF,
    PINCH_OFF_HARD,
    PINCH_ON,
} from "./config";

// MediaPipe hand landmark indices.
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_TIP = 12;
export const RING_MCP = 13;
export const RING_TIP = 16;
export const PINKY_MCP = 17;
export const PINKY_TIP = 20;

/** Standard hand skeleton, for the HUD overlay. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [17, 18], [18, 19], [19, 20],
    [0, 17],
];

export const FINGERTIPS: ReadonlyArray<number> = [4, 8, 12, 16, 20];

const dist = (p: Float32Array, a: number, b: number): number => {
    const dx = p[a * 3] - p[b * 3];
    const dy = p[a * 3 + 1] - p[b * 3 + 1];
    const dz = p[a * 3 + 2] - p[b * 3 + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export interface HandFeatures {
    /** thumb-index distance / palm size. */
    pinchRatio: number;
    indexExtended: boolean;
    middleExtended: boolean;
    ringCurled: boolean;
    pinkyCurled: boolean;
    allCurled: boolean;
}

const extension = (w: Float32Array, tip: number, mcp: number): number => {
    const base = dist(w, mcp, WRIST);
    return base > 1e-6 ? dist(w, tip, WRIST) / base : 0;
};

/** `world` is the 21*3 metric landmark block. */
export const computeFeatures = (world: Float32Array): HandFeatures => {
    const palm = dist(world, WRIST, MIDDLE_MCP);
    const pinchRatio = palm > 1e-6 ? dist(world, THUMB_TIP, INDEX_TIP) / palm : 1;

    const index = extension(world, INDEX_TIP, INDEX_MCP);
    const middle = extension(world, MIDDLE_TIP, MIDDLE_MCP);
    const ring = extension(world, RING_TIP, RING_MCP);
    const pinky = extension(world, PINKY_TIP, PINKY_MCP);

    return {
        pinchRatio,
        indexExtended: index > FINGER_EXTENDED,
        middleExtended: middle > FINGER_EXTENDED,
        ringCurled: ring < FINGER_CURLED,
        pinkyCurled: pinky < FINGER_CURLED,
        allCurled:
            index < FINGER_CURLED &&
            middle < FINGER_CURLED &&
            ring < FINGER_CURLED &&
            pinky < FINGER_CURLED,
    };
};

/**
 * Pinch with hysteresis. `aboveOffFrames` counts consecutive frames over the
 * release threshold: release is debounced by one frame unless the fingers are
 * clearly apart, so a single noisy frame can't drop a drag.
 */
export const nextPinch = (
    wasPinching: boolean,
    ratio: number,
    allCurled: boolean,
    aboveOffFrames: number
): { pinching: boolean; aboveOffFrames: number } => {
    if (!wasPinching) {
        // A fist wraps the thumb against the index finger: not a pinch.
        return { pinching: ratio < PINCH_ON && !allCurled, aboveOffFrames: 0 };
    }
    if (ratio >= PINCH_OFF_HARD) return { pinching: false, aboveOffFrames: 0 };
    if (ratio >= PINCH_OFF) {
        const frames = aboveOffFrames + 1;
        return { pinching: frames < 2, aboveOffFrames: frames };
    }
    return { pinching: true, aboveOffFrames: 0 };
};

/** Maps normalised camera coordinates to viewport pixels. */
export class ViewMapper {
    private vw = 1;
    private vh = 1;
    private videoW = 640;
    private videoH = 480;
    private zoom = 1;
    private dispW = 1;
    private dispH = 1;

    configure(
        vw: number,
        vh: number,
        videoW: number,
        videoH: number,
        zoom: number
    ): void {
        this.vw = vw;
        this.vh = vh;
        this.videoW = videoW || 640;
        this.videoH = videoH || 480;
        this.zoom = zoom;
        // Mirrors `object-fit: cover` + CSS scale(zoom) on the <video>.
        const scale = Math.max(vw / this.videoW, vh / this.videoH);
        this.dispW = this.videoW * scale * zoom;
        this.dispH = this.videoH * scale * zoom;
    }

    /** Camera is shown mirrored, so x is flipped. Writes into `out[offset]`. */
    map(nx: number, ny: number, out: Float32Array, offset: number): void {
        out[offset] = this.vw / 2 + (0.5 - nx) * this.dispW;
        out[offset + 1] = this.vh / 2 + (ny - 0.5) * this.dispH;
    }

    get viewportWidth(): number {
        return this.vw;
    }
    get viewportHeight(): number {
        return this.vh;
    }
    get videoZoom(): number {
        return this.zoom;
    }
}
