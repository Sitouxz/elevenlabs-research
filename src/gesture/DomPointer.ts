import { CLICK_SLOP_PX } from "./config";

const HOVER_ATTR = "data-gesture-hover";
const POINTER_ID = 1;
const INTERACTIVE_SELECTOR =
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, label, [role="button"], [role="tab"]';

/**
 * Turns hand motion into the same DOM events a mouse would produce, so every
 * existing control (buttons, framer-motion drags, hover effects, scrollers)
 * works with zero per-component gesture code.
 *
 * Note: synthetic events are untrusted, so the browser won't run default
 * actions for them (focus, text selection, etc.). We cover the ones we need.
 */
export class DomPointer {
    private hovered: Element | null = null;
    private highlighted: Element | null = null;
    private downTarget: Element | null = null;
    private downX = 0;
    private downY = 0;
    private lastX = 0;
    private lastY = 0;
    private moved = false;
    private scrollTarget: Element | null = null;
    private lastCursor: Element | null = null;
    private lastCursorInteractive = false;

    get isPressed(): boolean {
        return this.downTarget !== null;
    }

    /** Hover at a point (no button down). Returns whether it's over something clickable. */
    hover(x: number, y: number): boolean {
        this.lastX = x;
        this.lastY = y;
        const target = document.elementFromPoint(x, y);
        if (target !== this.hovered) this.transition(this.hovered, target, x, y);
        if (target) this.fire(target, "pointermove", x, y, 0, true);
        if (target) this.fire(target, "mousemove", x, y, 0, true);
        return this.markInteractive(target);
    }

    press(x: number, y: number): void {
        this.cancelScroll();
        const target = document.elementFromPoint(x, y);
        if (!target) return;
        this.hover(x, y);
        this.downTarget = target;
        this.downX = x;
        this.downY = y;
        this.lastX = x;
        this.lastY = y;
        this.moved = false;
        this.fire(target, "pointerdown", x, y, 1, true);
        this.fire(target, "mousedown", x, y, 1, true);
        // mousedown's default action would focus the control.
        const focusable = target.closest<HTMLElement>(
            "input, textarea, select, button, [tabindex]"
        );
        focusable?.focus({ preventScroll: true });
    }

    /** While pressed, events go to the press target (like pointer capture). */
    drag(x: number, y: number): void {
        const target = this.downTarget;
        if (!target) return;
        this.lastX = x;
        this.lastY = y;
        if (Math.hypot(x - this.downX, y - this.downY) > CLICK_SLOP_PX) {
            this.moved = true;
        }
        this.fire(target, "pointermove", x, y, 1, true);
        this.fire(target, "mousemove", x, y, 1, true);
    }

    release(x: number, y: number): void {
        const target = this.downTarget;
        if (!target) return;
        this.downTarget = null;
        this.fire(target, "pointerup", x, y, 0, true);
        this.fire(target, "mouseup", x, y, 0, true);
        if (!this.moved) {
            // Untrusted click events still run activation behaviour
            // (buttons, links, checkboxes), and React's onClick fires.
            this.fire(target, "click", x, y, 0, true);
        }
        this.moved = false;
    }

    /** Hand vanished mid-press: end it without producing a click. */
    cancel(): void {
        const target = this.downTarget;
        if (!target) return;
        this.downTarget = null;
        this.fire(target, "pointerup", this.lastX, this.lastY, 0, true);
        this.fire(target, "mouseup", this.lastX, this.lastY, 0, true);
        this.moved = false;
    }

    /** Scroll the nearest scrollable ancestor under the cursor by `dy` px. */
    scroll(x: number, y: number, dy: number): void {
        if (!this.scrollTarget) {
            const under = document.elementFromPoint(x, y);
            this.scrollTarget = under ? findScrollable(under) : null;
        }
        const el = this.scrollTarget ?? document.scrollingElement;
        el?.scrollBy({ top: dy, behavior: "instant" });
    }

    cancelScroll(): void {
        this.scrollTarget = null;
    }

    /** Hand left the frame / mode ended: clear every trace we left in the DOM. */
    reset(): void {
        this.cancel();
        this.cancelScroll();
        if (this.hovered) this.transition(this.hovered, null, this.lastX, this.lastY);
        this.setHighlight(null);
        this.lastCursor = null;
    }

    // ----- internals -----

    private transition(
        from: Element | null,
        to: Element | null,
        x: number,
        y: number
    ): void {
        if (from) {
            this.fire(from, "pointerout", x, y, 0, true);
            this.fire(from, "mouseout", x, y, 0, true);
        }
        if (to) {
            this.fire(to, "pointerover", x, y, 0, true);
            this.fire(to, "mouseover", x, y, 0, true);
        }
        // enter/leave don't bubble: fire them on every element that was
        // actually entered/left (framer-motion's whileHover listens for these).
        const fromChain = from ? ancestors(from) : [];
        const toChain = to ? ancestors(to) : [];
        const toSet = new Set(toChain);
        const fromSet = new Set(fromChain);
        for (const el of fromChain) {
            if (!toSet.has(el)) {
                this.fire(el, "pointerleave", x, y, 0, false);
                this.fire(el, "mouseleave", x, y, 0, false);
            }
        }
        for (let i = toChain.length - 1; i >= 0; i--) {
            const el = toChain[i];
            if (!fromSet.has(el)) {
                this.fire(el, "pointerenter", x, y, 0, false);
                this.fire(el, "mouseenter", x, y, 0, false);
            }
        }
        this.hovered = to;
    }

    private markInteractive(target: Element | null): boolean {
        if (target === this.lastCursor) return this.lastCursorInteractive;
        this.lastCursor = target;
        let highlight: Element | null = null;
        if (target) {
            // Semantic controls first: Tailwind v4 resets <button> to the
            // default cursor, so cursor alone would miss them.
            highlight = target.closest(INTERACTIVE_SELECTOR);
            if (!highlight) {
                // Custom clickable/draggable divs advertise themselves via
                // `cursor`. It is inherited, so walk up to the element that
                // actually declares it.
                const kind = getComputedStyle(target).cursor;
                if (kind === "pointer" || kind === "grab") {
                    highlight = target;
                    for (
                        let p = target.parentElement;
                        p && getComputedStyle(p).cursor === kind;
                        p = p.parentElement
                    ) {
                        highlight = p;
                    }
                }
            }
        }
        this.setHighlight(highlight);
        this.lastCursorInteractive = highlight !== null;
        return this.lastCursorInteractive;
    }

    private setHighlight(el: Element | null): void {
        if (el === this.highlighted) return;
        this.highlighted?.removeAttribute(HOVER_ATTR);
        el?.setAttribute(HOVER_ATTR, "");
        this.highlighted = el;
    }

    private fire(
        target: Element,
        type: string,
        x: number,
        y: number,
        buttons: number,
        bubbles: boolean
    ): void {
        const base = {
            bubbles,
            cancelable: true,
            composed: true,
            view: window,
            clientX: x,
            clientY: y,
            screenX: x + window.screenX,
            screenY: y + window.screenY,
            // `button` is 0 for primary; framer-motion ignores non-primary.
            button: 0,
            buttons,
        };
        if (type.startsWith("pointer")) {
            target.dispatchEvent(
                new PointerEvent(type, {
                    ...base,
                    pointerId: POINTER_ID,
                    pointerType: "mouse",
                    isPrimary: true,
                    width: 1,
                    height: 1,
                    pressure: buttons ? 0.5 : 0,
                })
            );
        } else {
            target.dispatchEvent(new MouseEvent(type, base));
        }
    }
}

const ancestors = (el: Element): Element[] => {
    const chain: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) chain.push(n);
    return chain;
};

const findScrollable = (start: Element): Element | null => {
    for (let n: Element | null = start; n; n = n.parentElement) {
        const { overflowY } = getComputedStyle(n);
        if (
            (overflowY === "auto" || overflowY === "scroll") &&
            n.scrollHeight > n.clientHeight
        ) {
            return n;
        }
    }
    return null;
};
