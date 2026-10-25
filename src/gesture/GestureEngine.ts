import {
    FILTER_BETA,
    FILTER_D_CUTOFF,
    FILTER_MIN_CUTOFF,
    FIST_EXIT_MS,
    LEAD_MAX_PX,
    LEAD_SECONDS,
    LOST_GRACE_MS,
    PINCH_ANCHOR_LOOKBACK_MS,
    PINCH_HINT_START,
    PINCH_ON,
    POSE_STABLE_FRAMES,
    SCROLL_GAIN,
} from "./config";
import { DomPointer } from "./DomPointer";
import {
    FINGERTIPS,
    HAND_CONNECTIONS,
    INDEX_MCP,
    INDEX_TIP,
    MIDDLE_MCP,
    ViewMapper,
    computeFeatures,
    nextPinch,
} from "./handMath";
import { OneEuroFilter2D } from "./oneEuro";
import { TargetSnap } from "./TargetSnap";
import {
    LANDMARK_COUNT,
    type FrameMeta,
    type GestureStats,
    type HandFrame,
    type Pose,
} from "./types";

export interface EngineCallbacks {
    onPose: (pose: Pose) => void;
    onStats: (stats: GestureStats) => void;
    onExitRequested: () => void;
}

const HISTORY = 24;
const STATS_INTERVAL_MS = 250;
const PRIMARY = "0,238,255";

/**
 * Per-frame brain. Runs synchronously inside the tracker's message handler:
 * landmarks in, DOM events + canvas pixels out, no React and no rAF hop in
 * between (each hop would add up to a display frame of latency).
 */
export class GestureEngine {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly cb: EngineCallbacks;
    private readonly mapper = new ViewMapper();
    private readonly pointer = new DomPointer();
    private readonly snapper = new TargetSnap();
    private readonly snapOut = { x: 0, y: 0 };
    private readonly video: HTMLVideoElement;

    private readonly opts = {
        minCutoff: FILTER_MIN_CUTOFF,
        beta: FILTER_BETA,
        dCutoff: FILTER_D_CUTOFF,
    };
    private readonly tipFilter = new OneEuroFilter2D(this.opts);
    // Knuckle midpoint: a rigid reference that closing/opening the fingers
    // cannot move, unlike the thumb/index midpoint (the thumb does most of the
    // moving in a pinch, which shifts that midpoint by tens of pixels).
    private readonly refFilter = new OneEuroFilter2D(this.opts);

    private readonly pts = new Float32Array(LANDMARK_COUNT * 2);
    // Ring buffer of displayed (pre-lead) cursor positions, for pinch anchoring.
    private readonly histT = new Float64Array(HISTORY);
    private readonly histX = new Float32Array(HISTORY);
    private readonly histY = new Float32Array(HISTORY);
    private readonly histRX = new Float32Array(HISTORY);
    private readonly histRY = new Float32Array(HISTORY);
    private histCount = 0;
    private histHead = 0;

    private videoW = 640;
    private videoH = 480;
    private dpr = 1;
    private width = 1;
    private height = 1;

    private pinching = false;
    private aboveOffFrames = 0;
    private anchorX = 0;
    private anchorY = 0;
    private anchorRefX = 0;
    private anchorRefY = 0;
    private cursorX = 0;
    private cursorY = 0;
    private snapped = false;
    private pinchRatio = 1;

    private pose: Pose = "none";
    private candidate: Pose = "none";
    private candidateFrames = 0;
    private fistSince = 0;
    private exitFired = false;
    private scrollLastY = 0;
    private scrolling = false;

    private lastSeen = 0;
    private hasHand = false;
    private overInteractive = false;

    private fps = 0;
    private latency = 0;
    private infer = 0;
    private lastCaptureTs = 0;
    private lastStatsAt = 0;

    private disposed = false;

    constructor(
        canvas: HTMLCanvasElement,
        video: HTMLVideoElement,
        callbacks: EngineCallbacks
    ) {
        this.canvas = canvas;
        this.video = video;
        this.cb = callbacks;
        // `desynchronized` lets the browser skip compositor sync for the
        // canvas: lower cursor latency where the platform supports it.
        const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
        if (!ctx) throw new Error("2D canvas unavailable");
        this.ctx = ctx;
        this.resize();
    }

    /** Call once the camera resolution is known (and if it changes). */
    setVideoSize(videoW: number, videoH: number): void {
        this.videoW = videoW;
        this.videoH = videoH;
        this.resize();
    }

    /** Call on viewport resize. */
    resize(): void {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = Math.round(this.width * this.dpr);
        this.canvas.height = Math.round(this.height * this.dpr);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.mapper.configure(this.width, this.height, this.videoW, this.videoH);
        // The backdrop shares the mapper's numbers, so skeleton and image agree.
        const { left, top, width, height } = this.mapper.layout;
        const s = this.video.style;
        s.left = `${left}px`;
        s.top = `${top}px`;
        s.width = `${width}px`;
        s.height = `${height}px`;
        this.snapper.invalidate();
    }

    /** `hand` is null when the tracker saw no hand in this frame. */
    handleFrame(hand: HandFrame | null, meta: FrameMeta): void {
        if (this.disposed) return;
        const now = performance.now();
        this.recordStats(meta, now);
        if (!hand) {
            this.handleNoHand(now);
            return;
        }
        this.hasHand = true;
        this.lastSeen = now;

        // 1. Landmarks -> viewport pixels (raw, unfiltered: used for the skeleton).
        const { image, world } = hand;
        for (let i = 0; i < LANDMARK_COUNT; i++) {
            this.mapper.map(image[i * 3], image[i * 3 + 1], this.pts, i * 2);
        }
        const tipX = this.pts[INDEX_TIP * 2];
        const tipY = this.pts[INDEX_TIP * 2 + 1];
        const refX = (this.pts[INDEX_MCP * 2] + this.pts[MIDDLE_MCP * 2]) / 2;
        const refY = (this.pts[INDEX_MCP * 2 + 1] + this.pts[MIDDLE_MCP * 2 + 1]) / 2;

        // 2. Smooth. Time base is camera capture time, not arrival time, so
        //    scheduling jitter in the pipeline doesn't pollute the velocity.
        const t = meta.captureTs;
        this.tipFilter.update(tipX, tipY, t);
        this.refFilter.update(refX, refY, t);

        // 3. Pose.
        const f = computeFeatures(world, image, this.videoW, this.videoH);
        this.pinchRatio = f.pinchRatio;
        const wasPinching = this.pinching;
        const p = nextPinch(wasPinching, f.pinchRatio, f.fist, this.aboveOffFrames);
        this.pinching = p.pinching;
        this.aboveOffFrames = p.aboveOffFrames;

        let raw: Pose = "point";
        if (this.pinching) raw = "pinch";
        else if (f.fist) raw = "fist";
        else if (f.indexExtended && f.middleExtended && f.ringCurled && f.pinkyCurled) {
            raw = "scroll";
        }
        const pose = this.stabilise(raw);

        // 4. Cursor + DOM events.
        if (this.pinching && !wasPinching) {
            this.beginPinch(t);
        } else if (!this.pinching && wasPinching) {
            this.endPinch();
        }

        if (this.pinching) {
            this.updatePinchCursor();
            this.pointer.drag(this.cursorX, this.cursorY);
        } else {
            this.updatePointCursor(t);
            if (pose === "scroll") {
                this.handleScroll();
            } else {
                this.scrolling = false;
                this.pointer.cancelScroll();
                this.overInteractive = this.pointer.hover(this.cursorX, this.cursorY);
            }
        }

        this.handleFist(pose, now);
        if (pose !== this.pose) {
            this.pose = pose;
            this.cb.onPose(pose);
        }

        // 5. Draw immediately, in the same task.
        this.draw();
    }

    dispose(): void {
        this.disposed = true;
        this.pointer.reset();
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    // ----- pose handling -----

    /** Scroll/fist must hold for a couple of frames; pinch is never delayed. */
    private stabilise(raw: Pose): Pose {
        if (raw === "pinch" || raw === "point") {
            this.candidate = raw;
            this.candidateFrames = 0;
            return raw;
        }
        if (raw === this.candidate) {
            this.candidateFrames++;
        } else {
            this.candidate = raw;
            this.candidateFrames = 1;
        }
        // Until the new pose is confirmed, behave like a plain pointer.
        return this.candidateFrames >= POSE_STABLE_FRAMES ? raw : "point";
    }

    private handleFist(pose: Pose, now: number): void {
        if (pose !== "fist") {
            this.fistSince = 0;
            this.exitFired = false;
            return;
        }
        if (!this.fistSince) this.fistSince = now;
        if (!this.exitFired && now - this.fistSince >= FIST_EXIT_MS) {
            this.exitFired = true;
            this.cb.onExitRequested();
        }
    }

    private handleScroll(): void {
        this.overInteractive = false;
        if (!this.scrolling) {
            this.scrolling = true;
            this.scrollLastY = this.cursorY;
            // Drop any hover highlight; the scroll target is picked on first move.
            this.pointer.reset();
            return;
        }
        // Content follows the hand, like dragging a touchscreen.
        const dy = (this.scrollLastY - this.cursorY) * SCROLL_GAIN;
        this.scrollLastY = this.cursorY;
        if (dy !== 0) this.pointer.scroll(this.cursorX, this.cursorY, dy);
    }

    // ----- cursor math -----

    private updatePointCursor(t: number): void {
        const f = this.tipFilter;
        const lead = this.lead(f.vx, f.vy);
        const out = this.snapOut;
        this.snapped = this.snapper.snap(
            f.x + lead.x,
            f.y + lead.y,
            Math.hypot(f.vx, f.vy),
            t,
            out
        );
        this.cursorX = out.x;
        this.cursorY = out.y;
        // History holds where the cursor was actually shown, so a pinch that
        // starts a moment later lands on whatever the user was looking at.
        this.record(t, out.x, out.y, this.refFilter.x, this.refFilter.y);
    }

    private beginPinch(t: number): void {
        // Where was the fingertip just before the fingers started to close,
        // and where were the knuckles then? From here the cursor only follows
        // the knuckles, i.e. the hand itself, never the closing fingers.
        const anchor = this.lookup(t - PINCH_ANCHOR_LOOKBACK_MS);
        this.anchorX = anchor.x;
        this.anchorY = anchor.y;
        this.anchorRefX = anchor.rx;
        this.anchorRefY = anchor.ry;
        this.scrolling = false;
        this.overInteractive = true;
        this.snapped = false;
        this.snapper.reset();
        this.updatePinchCursor();
        this.pointer.press(this.cursorX, this.cursorY);
    }

    private updatePinchCursor(): void {
        const f = this.refFilter;
        const lead = this.lead(f.vx, f.vy);
        // Fingertip-before-pinch + how far the hand has moved since then.
        this.cursorX = this.anchorX + (f.x - this.anchorRefX) + lead.x;
        this.cursorY = this.anchorY + (f.y - this.anchorRefY) + lead.y;
    }

    private endPinch(): void {
        // Release where the last pinching frame put the cursor (this runs
        // before the point cursor is recomputed), not where the opening
        // fingers have drifted to.
        this.pointer.release(this.cursorX, this.cursorY);
    }

    private lead(vx: number, vy: number): { x: number; y: number } {
        let lx = vx * LEAD_SECONDS;
        let ly = vy * LEAD_SECONDS;
        const mag = Math.hypot(lx, ly);
        if (mag > LEAD_MAX_PX) {
            lx *= LEAD_MAX_PX / mag;
            ly *= LEAD_MAX_PX / mag;
        }
        return { x: lx, y: ly };
    }

    private record(t: number, x: number, y: number, rx: number, ry: number): void {
        this.histT[this.histHead] = t;
        this.histX[this.histHead] = x;
        this.histY[this.histHead] = y;
        this.histRX[this.histHead] = rx;
        this.histRY[this.histHead] = ry;
        this.histHead = (this.histHead + 1) % HISTORY;
        if (this.histCount < HISTORY) this.histCount++;
    }

    /** Newest sample at or before `t`; falls back to the oldest we have. */
    private lookup(t: number): { x: number; y: number; rx: number; ry: number } {
        if (this.histCount === 0) {
            return {
                x: this.cursorX,
                y: this.cursorY,
                rx: this.refFilter.x,
                ry: this.refFilter.y,
            };
        }
        let idx = (this.histHead - 1 + HISTORY) % HISTORY;
        let best = idx;
        for (let n = 0; n < this.histCount; n++) {
            best = idx;
            if (this.histT[idx] <= t) break;
            idx = (idx - 1 + HISTORY) % HISTORY;
        }
        return {
            x: this.histX[best],
            y: this.histY[best],
            rx: this.histRX[best],
            ry: this.histRY[best],
        };
    }

    // ----- hand lost -----

    private handleNoHand(now: number): void {
        if (!this.hasHand) return;
        if (now - this.lastSeen < LOST_GRACE_MS) return;
        // Really gone: end any press without clicking, drop all state.
        this.hasHand = false;
        this.pinching = false;
        this.aboveOffFrames = 0;
        this.scrolling = false;
        this.pointer.reset();
        this.tipFilter.reset();
        this.refFilter.reset();
        this.histCount = 0;
        this.histHead = 0;
        this.fistSince = 0;
        this.exitFired = false;
        this.snapper.reset();
        this.snapped = false;
        this.pinchRatio = 1;
        this.candidate = "none";
        this.candidateFrames = 0;
        if (this.pose !== "none") {
            this.pose = "none";
            this.cb.onPose("none");
        }
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    // ----- drawing -----

    private draw(): void {
        const { ctx, pts } = this;
        ctx.clearRect(0, 0, this.width, this.height);

        // Skeleton: a dark underlay keeps it readable on bright camera frames.
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const [a, b] of HAND_CONNECTIONS) {
            ctx.moveTo(pts[a * 2], pts[a * 2 + 1]);
            ctx.lineTo(pts[b * 2], pts[b * 2 + 1]);
        }
        ctx.lineWidth = 5;
        ctx.strokeStyle = "rgba(5,11,12,0.55)";
        ctx.stroke();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = `rgba(${PRIMARY},0.9)`;
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        for (let i = 0; i < LANDMARK_COUNT; i++) {
            ctx.moveTo(pts[i * 2] + 2, pts[i * 2 + 1]);
            ctx.arc(pts[i * 2], pts[i * 2 + 1], 2, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.fillStyle = `rgba(${PRIMARY},0.9)`;
        ctx.beginPath();
        for (const i of FINGERTIPS) {
            ctx.moveTo(pts[i * 2] + 4, pts[i * 2 + 1]);
            ctx.arc(pts[i * 2], pts[i * 2 + 1], 4, 0, Math.PI * 2);
        }
        ctx.fill();

        this.drawCursor();
    }

    private drawCursor(): void {
        const { ctx, cursorX: x, cursorY: y } = this;
        if (this.pose === "pinch") {
            ctx.fillStyle = `rgba(${PRIMARY},0.95)`;
            ctx.shadowColor = `rgba(${PRIMARY},0.9)`;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.arc(x, y, 9, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.beginPath();
            ctx.arc(x, y, 15, 0, Math.PI * 2);
            ctx.stroke();
            return;
        }
        const radius = this.overInteractive ? 20 : 13;
        if (this.snapped) {
            // Locked onto a control: a soft disc says "this will be clicked".
            ctx.fillStyle = `rgba(${PRIMARY},0.2)`;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = this.overInteractive
            ? `rgba(${PRIMARY},1)`
            : "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = `rgba(${PRIMARY},0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();

        // Pinch progress: the ring fills as thumb and index close, so you can
        // see how far you are from a click before it happens.
        if (this.pose === "point" && this.pinchRatio < PINCH_HINT_START) {
            const progress = Math.min(
                (PINCH_HINT_START - this.pinchRatio) / (PINCH_HINT_START - PINCH_ON),
                1
            );
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            ctx.strokeStyle = progress >= 1 ? "rgba(255,255,255,1)" : `rgba(${PRIMARY},0.95)`;
            ctx.beginPath();
            ctx.arc(x, y, radius + 8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.stroke();
        }

        if (this.pose === "scroll") {
            ctx.strokeStyle = `rgba(${PRIMARY},0.9)`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x - 6, y - 26);
            ctx.lineTo(x, y - 32);
            ctx.lineTo(x + 6, y - 26);
            ctx.moveTo(x - 6, y + 26);
            ctx.lineTo(x, y + 32);
            ctx.lineTo(x + 6, y + 26);
            ctx.stroke();
        } else if (this.pose === "fist" && this.fistSince) {
            const progress = Math.min(
                (performance.now() - this.fistSince) / FIST_EXIT_MS,
                1
            );
            ctx.strokeStyle = "rgba(255,90,90,0.95)";
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(x, y, 28, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
            ctx.stroke();
        }
    }

    // ----- stats -----

    /** Latency is camera capture -> result in hand (draw follows in the same task). */
    private recordStats(meta: FrameMeta, now: number): void {
        const smooth = 0.1;
        const dt = meta.captureTs - this.lastCaptureTs;
        if (this.lastCaptureTs && dt > 0 && dt < 500) {
            this.fps += (1000 / dt - this.fps) * smooth;
        }
        this.lastCaptureTs = meta.captureTs;
        this.latency += (now - meta.captureTs - this.latency) * smooth;
        this.infer += (meta.inferMs - this.infer) * smooth;
        if (now - this.lastStatsAt >= STATS_INTERVAL_MS) {
            this.lastStatsAt = now;
            this.cb.onStats({
                fps: Math.round(this.fps),
                latencyMs: Math.round(this.latency),
                inferMs: Math.round(this.infer * 10) / 10,
            });
        }
    }
}
