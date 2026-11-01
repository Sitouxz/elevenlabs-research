import {
    SNAP_CENTER_MAX_PX,
    SNAP_MAX_SPEED,
    SNAP_RADIUS_PX,
    SNAP_STICKY_PX,
} from "./config";

const SNAP_SELECTOR =
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [role="button"], [role="tab"], .cursor-grab, .cursor-pointer';
const REFRESH_MS = 250;
const MIN_SIZE_PX = 8;

interface Target {
    el: Element;
    left: number;
    top: number;
    right: number;
    bottom: number;
}

const distanceTo = (t: Target, x: number, y: number): number => {
    const dx = Math.max(t.left - x, 0, x - t.right);
    const dy = Math.max(t.top - y, 0, y - t.bottom);
    return Math.hypot(dx, dy);
};

/**
 * Hand pointing is imprecise (the fingertip is a few pixels of landmark noise
 * wide, and the hand never holds perfectly still), so controls act a little
 * like magnets: a slow cursor near one is pulled onto it and stays put until
 * clearly pulled away. Fast movement is left alone so it can't snag on the way
 * past, and nothing snaps during a drag.
 */
export class TargetSnap {
    private targets: Target[] = [];
    private refreshedAt = -Infinity;
    private current: Target | null = null;

    /** Force a rescan on the next call (layout changed). */
    invalidate(): void {
        this.refreshedAt = -Infinity;
    }

    reset(): void {
        this.current = null;
    }

    /** Writes the adjusted position into `out` and returns whether it snapped. */
    snap(x: number, y: number, speed: number, now: number, out: { x: number; y: number }): boolean {
        out.x = x;
        out.y = y;
        if (now - this.refreshedAt > REFRESH_MS) this.refresh(now);

        const held = this.current;
        const heldAlive = held !== null && held.el.isConnected && this.targets.includes(held);
        if (!heldAlive) this.current = null;

        // Moving fast and not already snapped: don't catch anything.
        if (!this.current && speed > SNAP_MAX_SPEED) return false;

        let best: Target | null = null;
        let bestScore = Infinity;
        for (const t of this.targets) {
            const d = distanceTo(t, x, y);
            const limit = t === this.current ? SNAP_STICKY_PX : SNAP_RADIUS_PX;
            if (d > limit) continue;
            // Prefer the one we're already on, then the closest, then the smaller.
            const area = (t.right - t.left) * (t.bottom - t.top);
            const score = d + area / 1e6 - (t === this.current ? 14 : 0);
            if (score < bestScore) {
                bestScore = score;
                best = t;
            }
        }
        this.current = best;
        if (!best) return false;

        const w = best.right - best.left;
        const h = best.bottom - best.top;
        if (w <= SNAP_CENTER_MAX_PX && h <= SNAP_CENTER_MAX_PX) {
            out.x = (best.left + best.right) / 2;
            out.y = (best.top + best.bottom) / 2;
        } else {
            // Big or thin control (a window title bar): just pull the cursor inside.
            const insetX = Math.min(10, w / 3);
            const insetY = Math.min(10, h / 3);
            out.x = Math.min(Math.max(x, best.left + insetX), best.right - insetX);
            out.y = Math.min(Math.max(y, best.top + insetY), best.bottom - insetY);
        }
        return true;
    }

    private refresh(now: number): void {
        this.refreshedAt = now;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const found: Target[] = [];
        for (const el of document.querySelectorAll(SNAP_SELECTOR)) {
            const r = el.getBoundingClientRect();
            if (r.width < MIN_SIZE_PX || r.height < MIN_SIZE_PX) continue;
            if (r.right < 0 || r.bottom < 0 || r.left > vw || r.top > vh) continue;
            // Skip anything covered by something else at its centre.
            const hit = document.elementFromPoint(
                Math.min(Math.max((r.left + r.right) / 2, 0), vw - 1),
                Math.min(Math.max((r.top + r.bottom) / 2, 0), vh - 1)
            );
            if (!hit || !(el === hit || el.contains(hit))) continue;
            found.push({ el, left: r.left, top: r.top, right: r.right, bottom: r.bottom });
        }
        // Keep the held target object identity if it's still there, so
        // "held" survives a rescan.
        if (this.current) {
            const same = found.find((t) => t.el === this.current?.el);
            this.current = same ?? null;
        }
        this.targets = found;
    }
}
