import { useState, useEffect, useRef, useCallback } from "react";

// ---------------------------------------------------------------------------
// useNetworkStatus — measures REAL round-trip latency and derives a
// connection-strength label, replacing the previously hardcoded "24ms".
//
// Two signals are combined:
//   1. Active latency probe — a tiny cache-busted request to a fast, CORS-
//      friendly endpoint (Google's generate_204), timed with performance.now().
//      This reflects the user's actual internet round-trip time.
//   2. Network Information API (navigator.connection) — where supported,
//      exposes effectiveType (4g/3g/…) and downlink (Mbps) for extra context
//      and as a fallback when the probe can't run (e.g. offline).
// ---------------------------------------------------------------------------

export type ConnectionStrength =
    | "excellent"
    | "good"
    | "fair"
    | "poor"
    | "offline"
    | "unknown";

export interface NetworkStatus {
    /** Measured round-trip latency in milliseconds, or null if unknown. */
    latencyMs: number | null;
    /** Derived qualitative strength label. */
    strength: ConnectionStrength;
    /** navigator.connection.effectiveType, e.g. "4g" — null if unsupported. */
    effectiveType: string | null;
    /** navigator.connection.downlink in Mbps — null if unsupported. */
    downlinkMbps: number | null;
    /** navigator.onLine snapshot. */
    online: boolean;
}

// Non-standard Network Information API — typed loosely since it's not in
// the DOM lib and only some browsers (Chrome/Edge/Android) implement it.
interface NetworkInformationLike extends EventTarget {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
}

// Tiny 204 endpoint used purely for timing. no-cors lets us time cross-origin
// requests even though we can't read the (empty) body.
const PROBE_URL = "https://www.gstatic.com/generate_204";
const PROBE_INTERVAL_MS = 5_000;

function strengthFromLatency(latency: number | null, online: boolean): ConnectionStrength {
    if (!online) return "offline";
    if (latency === null) return "unknown";
    if (latency < 100) return "excellent";
    if (latency < 200) return "good";
    if (latency < 400) return "fair";
    return "poor";
}

export const useNetworkStatus = (enabled = true): NetworkStatus => {
    const [latencyMs, setLatencyMs] = useState<number | null>(null);
    const [effectiveType, setEffectiveType] = useState<string | null>(null);
    const [downlinkMbps, setDownlinkMbps] = useState<number | null>(null);
    const [online, setOnline] = useState<boolean>(
        typeof navigator !== "undefined" ? navigator.onLine : true
    );

    const timerRef = useRef<number | null>(null);

    // Read the Network Information API (if present) for effectiveType/downlink.
    const readConnectionInfo = useCallback(() => {
        const conn = (navigator as unknown as { connection?: NetworkInformationLike })
            .connection;
        if (conn) {
            setEffectiveType(conn.effectiveType ?? null);
            setDownlinkMbps(typeof conn.downlink === "number" ? conn.downlink : null);
        }
    }, []);

    // Fire a single latency probe. Uses performance.now() around a cache-busted
    // no-cors fetch; on failure, falls back to navigator.connection.rtt.
    const probeLatency = useCallback(async () => {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            setOnline(false);
            setLatencyMs(null);
            return;
        }
        const start = performance.now();
        try {
            await fetch(`${PROBE_URL}?_=${Date.now()}`, {
                method: "GET",
                mode: "no-cors",
                cache: "no-store",
            });
            const rtt = Math.round(performance.now() - start);
            setLatencyMs(rtt);
            setOnline(true);
        } catch {
            // Probe failed — fall back to the Network Information API's rtt
            // estimate if available, otherwise mark latency unknown.
            const conn = (navigator as unknown as { connection?: NetworkInformationLike })
                .connection;
            if (conn && typeof conn.rtt === "number" && conn.rtt > 0) {
                setLatencyMs(conn.rtt);
            } else {
                setLatencyMs(null);
            }
        }
        readConnectionInfo();
    }, [readConnectionInfo]);

    useEffect(() => {
        if (!enabled) {
            if (timerRef.current !== null) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
            return;
        }

        // Initial read + probe immediately, then poll on an interval. The
        // first calls are deferred to a microtask so the synchronous setState
        // they trigger doesn't run inside the effect body (avoids cascading
        // renders / the react-hooks set-state-in-effect warning).
        queueMicrotask(() => {
            readConnectionInfo();
            probeLatency();
        });
        timerRef.current = window.setInterval(probeLatency, PROBE_INTERVAL_MS);

        const handleOnline = () => {
            setOnline(true);
            probeLatency();
        };
        const handleOffline = () => {
            setOnline(false);
            setLatencyMs(null);
        };
        const conn = (navigator as unknown as { connection?: NetworkInformationLike })
            .connection;
        conn?.addEventListener?.("change", readConnectionInfo);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        return () => {
            if (timerRef.current !== null) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
            conn?.removeEventListener?.("change", readConnectionInfo);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, [enabled, probeLatency, readConnectionInfo]);

    return {
        latencyMs,
        strength: strengthFromLatency(latencyMs, online),
        effectiveType,
        downlinkMbps,
        online,
    };
};
