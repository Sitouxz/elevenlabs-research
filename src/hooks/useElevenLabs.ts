import { useState, useCallback, useRef } from "react";
import { Conversation } from "@elevenlabs/client";

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

    const toggleMute = useCallback(() => {
        if (!stream) return;
        const newMuted = !isMuted;
        stream.getAudioTracks().forEach((track) => {
            track.enabled = !newMuted;
        });
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

            // Delay the vision system prompt to let the connection stabilize
            setTimeout(() => {
                if (!isConnectedRef.current || !conversationRef.current) return;
                try {
                    conversationRef.current.sendContextualUpdate(
                        `[SYSTEM] You have real-time camera vision capabilities. ` +
                        `You will receive contextual updates prefixed with [VISION UPDATE] describing what the camera sees. ` +
                        `Naturally incorporate what you see into conversation. ` +
                        `Say things like "I can see you're holding a..." or "That looks like a...". ` +
                        `If the user asks what you see, use the most recent vision context.`
                    );
                    console.log("Vision system prompt sent.");
                } catch { /* ignore if disconnected */ }
            }, 3000);
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
    };
};
