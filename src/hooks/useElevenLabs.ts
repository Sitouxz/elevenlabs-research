import { useState, useCallback, useRef, useEffect } from "react";
import { Conversation } from "@elevenlabs/client";

// Type signature for client-tool handlers registered with the agent.
// ElevenLabs client tools are async functions that receive structured args
// (parsed from the agent's tool call) and return a string the agent reads back.
export type ClientToolHandler = (
    parameters: Record<string, unknown>
) => Promise<string> | string;

export type ClientToolMap = Record<string, ClientToolHandler>;

export const useElevenLabs = (agentId: string) => {
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
    const [stream, setStream] = useState<MediaStream | null>(null);

    const conversationRef = useRef<Conversation | null>(null);
    const isConnectedRef = useRef(false);
    // Guards against a second startConversation() firing while the first
    // is still connecting (e.g. user tabs away mid-connect, comes back to
    // a UI that still shows "Start" since isConnected hasn't flipped yet,
    // and clicks/presses Start again) — without this, two live sessions
    // open and the agent greets twice.
    const isConnectingRef = useRef(false);
    const isMutedRef = useRef(false);
    const streamRef = useRef<MediaStream | null>(null);
    // Separate from isMuted/isMutedRef: silences the SDK's outgoing mic audio
    // without touching UI-facing mute state or disabling the local stream
    // track, so the mute button/visualizer never show the mic as "off" while
    // this is active. Used to make the agent effectively non-interruptible
    // (no audio reaches the server to trigger a barge-in) without surfacing
    // an auto-mute to the user.
    const gateMutedRef = useRef(false);

    // Client tools registered before startConversation() — read at session
    // start so the agent can invoke them. Stored in a ref so updates from the
    // App don't restart the session.
    const clientToolsRef = useRef<ClientToolMap>({});

    const registerClientTools = useCallback((tools: ClientToolMap) => {
        clientToolsRef.current = { ...clientToolsRef.current, ...tools };
    }, []);

    const applyMuteState = useCallback(
        (muted: boolean) => {
            if (conversationRef.current) {
                try {
                    // Combine with the gate mute so a resolved gate never
                    // accidentally unmutes audio the user explicitly muted.
                    conversationRef.current.setMicMuted(muted || gateMutedRef.current);
                } catch (err) {
                    console.error("Failed to set SDK mic mute:", err);
                }
            }

            // Also gate the visualizer's stream so the UI reflects the muted state.
            if (streamRef.current) {
                streamRef.current.getAudioTracks().forEach((track) => {
                    track.enabled = !muted;
                });
            }

            isMutedRef.current = muted;
            setIsMuted(muted);
        },
        []
    );

    /**
     * Silences outgoing mic audio at the SDK level without touching isMuted
     * state or the stream track — used to prevent the agent from being
     * interrupted while it's speaking, without showing the mic as muted.
     */
    const setGateMuted = useCallback((muted: boolean) => {
        gateMutedRef.current = muted;
        if (conversationRef.current) {
            try {
                conversationRef.current.setMicMuted(muted || isMutedRef.current);
            } catch (err) {
                console.error("Failed to set SDK mic mute (gate):", err);
            }
        }
    }, []);

    const toggleMute = useCallback(() => {
        applyMuteState(!isMuted);
    }, [isMuted, applyMuteState]);

    /** Mute the microphone unconditionally (no-op if already muted). */
    const muteMic = useCallback(() => {
        if (!isMutedRef.current) {
            applyMuteState(true);
        }
    }, [applyMuteState]);

    /** Unmute the microphone unconditionally (no-op if already unmuted). */
    const unmuteMic = useCallback(() => {
        if (isMutedRef.current) {
            applyMuteState(false);
        }
    }, [applyMuteState]);

    const interrupt = useCallback(async () => {
        const conversation = conversationRef.current;
        if (!conversation) return;
        try {
            // The SDK has no public "force interrupt" API — real interruptions
            // are server-driven (VAD detects the user talking over the agent),
            // and the client reacts internally via VoiceConversation's
            // fadeOutAudio(), which fades out queued audio and flips the mode
            // back to "listening". That method exists on the live instance at
            // runtime even though it's marked private in the SDK's types, so
            // call it directly to replicate a real interruption.
            const fadeOutAudio = (
                conversation as unknown as { fadeOutAudio?: () => void }
            ).fadeOutAudio;
            if (typeof fadeOutAudio === "function") {
                fadeOutAudio.call(conversation);
            }
        } catch (error) {
            console.error("Failed to interrupt:", error);
        }
    }, []);

    const startConversation = useCallback(async () => {
        if (isConnectingRef.current || isConnectedRef.current) return;
        isConnectingRef.current = true;
        setIsConnecting(true);
        gateMutedRef.current = false;
        try {
            // Optimize microphone constraints for lower latency
            const micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    // @ts-ignore - lowlatency is non-standard but supported in some browsers
                    latency: 0,
                    sampleRate: 16000,
                    channelCount: 1,
                },
            });
            streamRef.current = micStream;
            setStream(micStream);
            setIsMuted(false);

            const sessionOptions: any = {
                agentId: agentId,
                // Wrap each registered handler so the latest version (from the
                // ref) is invoked at call time. This lets the App swap the
                // implementation without restarting the conversation.
                clientTools: Object.fromEntries(
                    Object.keys(clientToolsRef.current).map((name) => [
                        name,
                        async (params: Record<string, unknown>) => {
                            const fn = clientToolsRef.current[name];
                            if (!fn) {
                                return `Tool ${name} is not available right now.`;
                            }
                            try {
                                const result = await fn(params || {});
                                return typeof result === "string"
                                    ? result
                                    : JSON.stringify(result);
                            } catch (err: any) {
                                console.error(
                                    `Client tool ${name} failed:`,
                                    err
                                );
                                return `Tool ${name} failed: ${
                                    err?.message || "unknown error"
                                }`;
                            }
                        },
                    ])
                ),
                onConnect: () => {
                    isConnectedRef.current = true;
                    setIsConnected(true);
                },
                onDisconnect: (details: any) => {
                    console.log("ElevenLabs disconnected:", details);

                    // Immediately mark disconnected (sync) to stop all sends
                    isConnectedRef.current = false;
                    conversationRef.current = null;

                    // Stop mic tracks to kill the audio worklet
                    if (streamRef.current) {
                        streamRef.current.getTracks().forEach((t) => t.stop());
                        streamRef.current = null;
                    }

                    setIsConnected(false);
                    setIsSpeaking(false);
                    setIsListening(false);
                    setStream(null);
                },
                onMessage: (message: any) => {
                    if (message.message) {
                        setMessages((prev) => [
                            ...prev,
                            {
                                role: message.source === "ai" ? "ai" : "user",
                                text: message.message,
                            },
                        ]);
                    }
                },
                onError: (error: any) => {
                    console.error("ElevenLabs Error:", error);
                },
                onModeChange: (mode: any) => {
                    setIsSpeaking(mode.mode === "speaking");
                    setIsListening(mode.mode === "listening");
                },
            };

            const conversation = await Conversation.startSession(sessionOptions);
            conversationRef.current = conversation;
            console.log("ElevenLabs session started, id:", conversation.getId());
        } catch (error) {
            console.error("Failed to start conversation:", error);
        } finally {
            isConnectingRef.current = false;
            setIsConnecting(false);
        }
    }, [agentId]);

    const endConversation = useCallback(async () => {
        // Mark disconnected first to prevent any further sends
        isConnectedRef.current = false;
        const conv = conversationRef.current;
        conversationRef.current = null;

        // Stop mic tracks before ending session to prevent audio worklet errors
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }

        if (conv) {
            try {
                await conv.endSession();
            } catch {
                // Ignore errors during cleanup
            }
        }
        setStream(null);
        setIsMuted(false);
    }, []);

    const sendContextualUpdate = useCallback((text: string) => {
        // Synchronous ref check — avoids race with React state updates
        if (!isConnectedRef.current || !conversationRef.current) return;
        try {
            conversationRef.current.sendContextualUpdate(text);
        } catch {
            // Silently ignore if connection is closing/closed
        }
    }, []);

    // Send a user-activity heartbeat every 30 seconds while connected so the
    // ElevenLabs server-side inactivity timer never fires during silence.
    useEffect(() => {
        if (!isConnected) return;
        const id = window.setInterval(() => {
            if (isConnectedRef.current && conversationRef.current) {
                try {
                    conversationRef.current.sendUserActivity();
                } catch {
                    // ignore if session is closing
                }
            }
        }, 30_000);
        return () => window.clearInterval(id);
    }, [isConnected]);

    return {
        isConnected,
        isConnecting,
        isSpeaking,
        isListening,
        isMuted,
        isMutedRef,
        messages,
        stream,
        startConversation,
        endConversation,
        toggleMute,
        muteMic,
        unmuteMic,
        setGateMuted,
        interrupt,
        sendContextualUpdate,
        registerClientTools,
    };
};
