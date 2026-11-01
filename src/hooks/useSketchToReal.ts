import { useEffect, useRef, useState } from "react";
import type { MediaType } from "./useImageGeneration";

// ---------------------------------------------------------------------------
// Sketch → Realism hook (Unity drawing → photoreal image)
//
// Flow:
//   1. Open a PERSISTENT Socket.IO (Engine.IO v4) connection to the same XR
//      endpoint Unity is bound to, and listen for the inbound "image" event.
//      Unity emits emit("image", "<base64 png/jpeg string>") whenever the user
//      finishes a drawing.
//   2. Upload that base64 string to Cloudinary via the n8n upload-image webhook
//      and extract the returned hosted image URL.
//   3. Feed the uploaded sketch URL as a reference image into the existing
//      image-generation pipeline with a sketch→photoreal prompt, so the result
//      looks like a real / higher-fidelity version of exactly what the user
//      drew. The generation hook already opens a display window AND pushes the
//      result URL back to Unity over the socket (sendToXR), satisfying step 4.
//
// Unlike sendToXR() in useImageGeneration.ts (a short-lived, outbound-only
// connection), this socket is long-lived because we need to RECEIVE events.
// Engine.IO v4 framing: "0"=open, "2"=ping→"3"pong, "40"=SIO connect,
// "42"=SIO event, "41"=SIO disconnect.
// ---------------------------------------------------------------------------

const XR_WS_URL =
    import.meta.env.VITE_XR_WS_URL ||
    "wss://xr-api.fxwebapps.com/socket.io/?EIO=4&transport=websocket";

// n8n webhook that accepts the base64 string and uploads it to Cloudinary,
// returning the hosted image URL.
const UPLOAD_IMAGE_WEBHOOK =
    import.meta.env.VITE_N8N_UPLOAD_IMAGE_WEBHOOK ||
    "https://fxaitools.app.n8n.cloud/webhook/upload-image";

// The event name Unity emits the base64 drawing on. Unity sends it on the
// shared "message" event with a custom (NON-JSON) payload of the form:
//   {type:image,data:<base64>}
// The same "message" event is also used to broadcast result URLs (glb / image
// URLs) back out, so we must be careful to ONLY react to sketch payloads and
// ignore everything else.
const INBOUND_EVENT = "message";

// Pull the base64 sketch out of whatever Unity sent on the "message" event.
// Handles:
//   - object form:  { type: "image", data: "<base64>" }
//   - custom string: "{type:image,data:<base64>}"  (NOT valid JSON — no quotes)
//   - a data-URL string ("data:image/png;base64,....")
//   - a bare base64 string
// Returns null for anything that isn't clearly a sketch (e.g. result URLs),
// so we don't accidentally re-trigger on our own outbound broadcasts.
function extractSketchBase64(arg: any): string | null {
    if (arg == null) return null;

    // Object form: { type, data } (or image/base64 aliases).
    if (typeof arg === "object") {
        const type = String(arg.type ?? "").toLowerCase();
        const d = arg.data ?? arg.image ?? arg.base64;
        if (typeof d === "string" && (type === "" || type === "image")) {
            return d.trim() || null;
        }
        return null;
    }

    if (typeof arg !== "string") return null;
    const s = arg.trim();
    if (!s) return null;

    // Never treat a plain result URL as a sketch.
    if (/^https?:\/\//i.test(s)) return null;

    // A real data-URL string ("data:image/png;base64,....") — use as-is.
    if (s.startsWith("data:image")) return s;

    // Custom wrapper "{type:image,data:<base64>}" (NOT JSON — no quotes).
    // Take everything after the FIRST "data:" key, strip a trailing "}".
    if (s.includes("data:")) {
        const after = s.slice(s.indexOf("data:") + "data:".length);
        const cleaned = after.replace(/}\s*$/, "").trim();
        if (cleaned) return cleaned;
    }

    // Bare base64 (only if it plausibly looks like one — long + base64 charset)
    // so we don't misfire on short status strings broadcast on "message".
    if (s.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(s)) return s;

    return null;
}

// Prompt that INTERPRETS the subject of the user's sketch and renders a real
// photograph of that actual subject — NOT a traced/realistic version of the
// pencil strokes. The sketch is used only as a guide for WHICH object it is and
// its pose/position/composition. Example: a stick-figure cat sketch should
// produce a photo of a REAL cat in the same pose and placement, not a lifelike
// drawing of the lines. Kept generic (no hard-coded subject) so it works for
// any doodle — the reference image supplies the subject + layout.
const SKETCH_TO_REAL_PROMPT =
    "Transform this doodle into a realistic, high-quality image based on what it represents. Understand the context and recreate the intended subject or scene naturally. Remove all doodle lines, marks, and sketch strokes completely. Replace them with the actual objects, characters, or scene depicted, with realistic details, lighting, and composition.";

// Extract a hosted image URL from the (loosely-typed) upload webhook response.
// Tries common field names, then deep-scans for any http(s) image-looking URL.
function extractImageUrl(data: any): string | null {
    if (!data) return null;
    if (typeof data === "string") {
        return data.startsWith("http") ? data : null;
    }

    const candidates = [
        data.url,
        data.secure_url,
        data.secureUrl,
        data.imageUrl,
        data.image_url,
        data.image,
        data.result,
        data.data?.url,
        data.data?.secure_url,
        data.data?.imageUrl,
    ];
    for (const c of candidates) {
        if (typeof c === "string" && c.startsWith("http")) return c;
    }

    // Deep scan: first http(s) URL found anywhere in the object.
    let found: string | null = null;
    const visit = (node: any) => {
        if (found || node == null) return;
        if (typeof node === "string") {
            if (/^https?:\/\/\S+/i.test(node)) found = node;
            return;
        }
        if (Array.isArray(node)) {
            for (const v of node) visit(v);
            return;
        }
        if (typeof node === "object") {
            for (const v of Object.values(node)) visit(v);
        }
    };
    visit(data);
    return found;
}

// Upload the base64 sketch to Cloudinary (via n8n) and return the hosted URL.
async function uploadSketch(base64: string): Promise<string> {
    // Normalize: some senders include the data-URL prefix, some don't. We send
    // both a raw and a data-URL friendly field so the webhook can use whichever.
    const hasPrefix = base64.startsWith("data:");
    const raw = hasPrefix ? base64.split(",")[1] ?? base64 : base64;

    const res = await fetch(UPLOAD_IMAGE_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            image: base64,
            base64: raw,
            file: hasPrefix ? base64 : `data:image/png;base64,${raw}`,
        }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`upload-image ${res.status}: ${body.slice(0, 200)}`);
    }

    // Response may be JSON or a bare URL string.
    const text = await res.text();
    let parsed: any = text;
    try {
        parsed = JSON.parse(text);
    } catch {
        // not JSON — leave as string
    }
    const url = extractImageUrl(parsed);
    if (!url) {
        throw new Error("upload-image: no image URL in response");
    }
    return url;
}


export type SketchStatus = "idle" | "uploading" | "generating" | "error";

interface UseSketchToRealArgs {
    // The generate() from useImageGeneration. Opens a display window and pushes
    // the result URL back to Unity over the socket.
    generate: (
        prompt: string,
        mediaType?: MediaType,
        referenceImage?: string,
    ) => string;
    // Master switch — only listen while enabled (e.g. after the session starts).
    enabled?: boolean;
    // Optional: make Flare speak when a drawing arrives / when we start
    // generating. Wire this to useElevenLabs.sendUserMessage so the agent
    // actually voices the line (sendContextualUpdate is silent).
    onSpeak?: (message: string) => void;
}

export const useSketchToReal = ({
    generate,
    enabled = true,
    onSpeak,
}: UseSketchToRealArgs) => {
    const [status, setStatus] = useState<SketchStatus>("idle");
    const [error, setError] = useState<string>("");
    const [lastSketchUrl, setLastSketchUrl] = useState<string | null>(null);

    // generate can change identity across renders; read it from a ref so the
    // socket effect doesn't need to tear down/reconnect when it does.
    const generateRef = useRef(generate);
    useEffect(() => {
        generateRef.current = generate;
    }, [generate]);

    // Same ref pattern for the speak callback so the socket effect never needs
    // to reconnect when the agent's send function identity changes.
    const onSpeakRef = useRef(onSpeak);
    useEffect(() => {
        onSpeakRef.current = onSpeak;
    }, [onSpeak]);

    // Guard against overlapping uploads for rapid-fire drawings.
    const busyRef = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        let ws: WebSocket | null = null;
        let closedByUs = false;
        let reconnectTimer: number | undefined;

        const handleSketch = async (base64: string) => {
            if (busyRef.current) {
                console.warn("[SketchToReal] busy — ignoring new sketch");
                return;
            }
            if (!base64 || typeof base64 !== "string") return;

            busyRef.current = true;
            setError("");
            setStatus("uploading");

            // Acknowledge the drawing out loud the moment it arrives.
            // NOTE: the wake-word gate (should_respond in App.tsx) returns SILENT
            // unless the message contains "Flare"/"Flair" — so we MUST use the
            // "[SYSTEM to Flare] ... Flare, ..." framing here (same as the
            // face-analysis flow) or the agent will just reply with a silent ".".
            console.log(
                "[SketchToReal] 🗣️ asking Flare to acknowledge the drawing " +
                `(onSpeak wired=${!!onSpeakRef.current})`,
            );
            onSpeakRef.current?.(
                "[SYSTEM to Flare] The user just sent you a drawing they made. " +
                "Flare, enthusiastically tell them out loud that you've received their " +
                "drawing and that you're now turning it into a real, generated image for " +
                "them. Keep it to one short, natural sentence.",
            );

            try {
                const sketchUrl = await uploadSketch(base64);
                setLastSketchUrl(sketchUrl);

                setStatus("generating");
                // Use the uploaded sketch as the reference image so the realism
                // render mirrors exactly what the user drew. generate() opens a
                // window and sends the result back to Unity via sendToXR().
                generateRef.current(
                    SKETCH_TO_REAL_PROMPT,
                    "image",
                    sketchUrl,
                );

                setStatus("idle");
            } catch (err: any) {
                console.error("[SketchToReal] failed:", err);
                setError(err?.message || "Sketch conversion failed");
                setStatus("error");
            } finally {
                busyRef.current = false;
            }
        };

        const connect = () => {
            console.log("[SketchToReal] connecting to XR socket…", XR_WS_URL);
            try {
                ws = new WebSocket(XR_WS_URL);
            } catch (err) {
                console.warn("[SketchToReal] could not open socket", err);
                scheduleReconnect();
                return;
            }

            ws.addEventListener("open", () => {
                console.log(
                    "[SketchToReal] 🔌 WebSocket OPEN →",
                    XR_WS_URL,
                );
            });

            ws.addEventListener("message", ({ data }) => {
                if (typeof data !== "string") {
                    console.log(
                        "[SketchToReal] ⬇️ non-string frame received:",
                        data,
                    );
                    return;
                }
                const eioType = data[0];

                if (eioType === "0") {
                    // Engine.IO open → connect to Socket.IO default namespace
                    console.log(
                        "[SketchToReal] engine.io OPEN, sending namespace connect (40)",
                    );
                    ws?.send("40");
                } else if (eioType === "2") {
                    // Engine.IO ping → pong (keeps the connection alive)
                    ws?.send("3");
                } else if (data.startsWith("40")) {
                    console.log(
                        "[SketchToReal] ✅ Socket.IO namespace CONNECTED — now listening for events",
                    );
                } else if (data.startsWith("42")) {
                    // Socket.IO event frame: 42["<event>",<payload>]
                    let eventName: any = "(unknown)";
                    let arg: any;
                    try {
                        const payload = JSON.parse(data.slice(2));
                        eventName = Array.isArray(payload)
                            ? payload[0]
                            : "(not an array)";
                        arg = Array.isArray(payload) ? payload[1] : undefined;
                    } catch {
                        // Unity's payload ({type:image,data:...}) is NOT valid
                        // JSON, so if it was embedded unquoted the whole frame
                        // fails to parse. Fall back to a manual extraction:
                        // grab the event name, then hand the raw remainder to
                        // the sketch parser.
                        const m = data.slice(2).match(/^\s*\[\s*"([^"]+)"\s*,/);
                        eventName = m ? m[1] : "(unparsed)";
                        arg = data.slice(2); // let extractSketchBase64 dig it out
                    }

                    // DEBUG: log EVERY inbound event so we can see exactly what
                    // Unity emits (event name + payload preview), even when it
                    // doesn't match what we expect.
                    const preview =
                        typeof arg === "string"
                            ? `string(len=${arg.length}) "${arg.slice(0, 60)}${arg.length > 60 ? "…" : ""}"`
                            : arg && typeof arg === "object"
                              ? `object keys=[${Object.keys(arg).join(", ")}]`
                              : String(arg);
                    console.log(
                        `[SketchToReal] ⬇️ EVENT received → name="${eventName}" | payload: ${preview}`,
                    );

                    // Case-insensitive match on the expected event name.
                    const nameMatches =
                        typeof eventName === "string" &&
                        eventName.toLowerCase() === INBOUND_EVENT.toLowerCase();

                    if (nameMatches) {
                        const base64 = extractSketchBase64(arg);
                        if (base64) {
                            console.log(
                                `[SketchToReal] 🎯 sketch detected on "${INBOUND_EVENT}" → processing (base64 len=${base64.length})`,
                            );
                            void handleSketch(base64);
                        } else {
                            // A non-sketch "message" (e.g. a result URL we or
                            // another client broadcast) — ignore quietly.
                            console.log(
                                `[SketchToReal] ℹ️ "${eventName}" event was not a sketch payload — ignoring`,
                            );
                        }
                    } else {
                        console.log(
                            `[SketchToReal] ℹ️ ignoring event "${eventName}" (waiting for "${INBOUND_EVENT}")`,
                        );
                    }
                } else {
                    // Any other engine.io/socket.io frame — log for completeness.
                    console.log(
                        "[SketchToReal] ⬇️ other frame:",
                        data.slice(0, 120),
                    );
                }
            });

            ws.addEventListener("close", (e) => {
                console.log(
                    `[SketchToReal] 🔌 WebSocket CLOSED (code=${e.code}, reason="${e.reason}", clean=${e.wasClean})`,
                );
                if (!closedByUs) scheduleReconnect();
            });

            ws.addEventListener("error", (e) => {
                console.warn("[SketchToReal] ⚠️ socket error", e);
            });
        };

        const scheduleReconnect = () => {
            if (closedByUs) return;
            reconnectTimer = window.setTimeout(() => {
                if (!closedByUs) connect();
            }, 3000);
        };

        connect();

        // Dev-only console bridge: lets you simulate a Unity "image" event
        // WITHOUT the network by calling it straight from DevTools, e.g.
        //   window.__sendSketch("data:image/png;base64,....")
        // This tests upload → generate → display → sendToXR end-to-end.
        if (import.meta.env.DEV) {
            (window as any).__sendSketch = (base64: string) =>
                handleSketch(base64);
        }

        return () => {
            if (import.meta.env.DEV) {
                delete (window as any).__sendSketch;
            }
            closedByUs = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            try {
                ws?.close();
            } catch {
                // ignore
            }
        };
    }, [enabled]);

    return { status, error, lastSketchUrl };
};
