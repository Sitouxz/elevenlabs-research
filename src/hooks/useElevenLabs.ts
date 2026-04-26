import { useState, useCallback, useRef } from "react";
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
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
    const [stream, setStream] = useState<MediaStream | null>(null);

    const conversationRef = useRef<Conversation | null>(null);
    const isConnectedRef = useRef(false);
    const streamRef = useRef<MediaStream | null>(null);

    // Client tools registered before startConversation() — read at session
    // start so the agent can invoke them. Stored in a ref so updates from the
    // App don't restart the session.
    const clientToolsRef = useRef<ClientToolMap>({});

    const registerClientTools = useCallback((tools: ClientToolMap) => {
        clientToolsRef.current = { ...clientToolsRef.current, ...tools };
    }, []);

    const toggleMute = useCallback(() => {
        const newMuted = !isMuted;

        // The ElevenLabs SDK captures its OWN internal microphone stream when
        // Conversation.startSession() runs — it does NOT use the `stream`
        // captured by this hook (that stream only feeds the local visualizer).
        // So muting must go through the SDK's setMicMuted API; toggling
        // track.enabled on the local stream alone leaves the agent still
        // hearing the user.
        if (conversationRef.current) {
            try {
                conversationRef.current.setMicMuted(newMuted);
            } catch (err) {
                console.error("Failed to toggle SDK mic mute:", err);
            }
        }

        // Also gate the visualizer's stream so the UI reflects the muted state.
        if (stream) {
            stream.getAudioTracks().forEach((track) => {
                track.enabled = !newMuted;
            });
        }

        setIsMuted(newMuted);
    }, [isMuted, stream]);

    const interrupt = useCallback(async () => {
        if (!conversationRef.current) return;
        try {
            // In the current SDK, manual interruption can be achieved by sending a stop signal
            // or just by the user speaking. If we want a button to force it:
            // @ts-ignore
            if (conversationRef.current.interrupt) {
                // @ts-ignore
                await conversationRef.current.interrupt();
            }
        } catch (error) {
            console.error("Failed to interrupt:", error);
        }
    }, []);

    const startConversation = useCallback(async () => {
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

    return {
        isConnected,
        isSpeaking,
        isListening,
        isMuted,
        messages,
        stream,
        startConversation,
        endConversation,
        toggleMute,
        interrupt,
        sendContextualUpdate,
        registerClientTools,
    };
};
