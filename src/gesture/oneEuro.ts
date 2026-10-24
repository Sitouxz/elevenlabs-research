// One Euro filter (Casiez et al., CHI 2012): heavy smoothing when the signal is
// slow (kills jitter while holding still) and almost none when it is fast
// (no perceived lag while moving). 2D variant that also exposes the smoothed
// velocity, which the engine uses for look-ahead.

const TWO_PI = Math.PI * 2;

const alphaFor = (cutoff: number, dt: number): number => {
    const tau = 1 / (TWO_PI * cutoff);
    return 1 / (1 + tau / dt);
};

export interface OneEuroOptions {
    minCutoff: number;
    beta: number;
    dCutoff: number;
}

export class OneEuroFilter2D {
    x = 0;
    y = 0;
    /** Smoothed velocity in units per second. */
    vx = 0;
    vy = 0;

    private readonly opts: OneEuroOptions;
    private rawX = 0;
    private rawY = 0;
    private lastT = 0;
    private primed = false;

    constructor(opts: OneEuroOptions) {
        this.opts = opts;
    }

    reset(): void {
        this.primed = false;
        this.vx = 0;
        this.vy = 0;
    }

    /** `tMs` must be monotonic; frame capture time is ideal. */
    update(x: number, y: number, tMs: number): void {
        if (!this.primed) {
            this.primed = true;
            this.x = this.rawX = x;
            this.y = this.rawY = y;
            this.lastT = tMs;
            this.vx = this.vy = 0;
            return;
        }
        // Clamp dt: a stalled frame must not produce a huge alpha or a div-by-zero.
        const dt = Math.min(Math.max((tMs - this.lastT) / 1000, 1 / 240), 0.1);
        this.lastT = tMs;

        const dAlpha = alphaFor(this.opts.dCutoff, dt);
        const rvx = (x - this.rawX) / dt;
        const rvy = (y - this.rawY) / dt;
        this.vx += dAlpha * (rvx - this.vx);
        this.vy += dAlpha * (rvy - this.vy);

        const cutoff =
            this.opts.minCutoff + this.opts.beta * Math.hypot(this.vx, this.vy);
        const a = alphaFor(cutoff, dt);
        this.x += a * (x - this.x);
        this.y += a * (y - this.y);
        this.rawX = x;
        this.rawY = y;
    }
}
