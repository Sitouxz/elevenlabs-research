export const LANDMARK_COUNT = 21;
/** Per-hand payload: 21 image landmarks then 21 world landmarks, xyz each. */
export const FRAME_FLOATS = LANDMARK_COUNT * 3 * 2;

export type Delegate = "GPU" | "CPU";

export type MainToWorker =
    | {
          type: "init";
          wasmBase: string;
          modelUrl: string;
          /** Preferred delegate; GPU falls back to CPU if it fails. */
          delegate?: Delegate;
      }
    | { type: "frame"; image: ImageBitmap; id: number };

export type WorkerToMain =
    | { type: "ready"; delegate: Delegate }
    | { type: "error"; message: string }
    | {
          type: "result";
          id: number;
          /** null when no hand is visible. */
          data: Float32Array | null;
          inferMs: number;
      };

/** Per-frame timing, delivered whether or not a hand was found. */
export interface FrameMeta {
    /** performance.now() timeline: when the camera captured the frame. */
    captureTs: number;
    inferMs: number;
}

/** A decoded hand. */
export interface HandFrame {
    /** Normalised image landmarks (x,y in 0..1 of the camera frame). */
    image: Float32Array;
    /** Metric world landmarks, wrist-relative. */
    world: Float32Array;
}

export type Pose = "none" | "point" | "pinch" | "scroll" | "fist";

export interface GestureStats {
    fps: number;
    latencyMs: number;
    inferMs: number;
}
