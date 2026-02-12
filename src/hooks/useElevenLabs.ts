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
            setStream(micStream);
            setIsMuted(false);

            const conversation = await Conversation.startSession({
                agentId: agentId,
                // @ts-ignore
                connectionType: "websocket",
                // Optimize session for latency
                // Note: Actual threshold and latency levels are best set in the ElevenLabs Agent Dashboard
                // but we can pass initial configurations here if the SDK version supports it.
                onConnect: () => {
                    setIsConnected(true);
                },
                onDisconnect: () => {
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
            });

            conversationRef.current = conversation;
        } catch (error) {
            console.error("Failed to start conversation:", error);
        }
    }, [agentId]);

    const endConversation = useCallback(async () => {
        if (conversationRef.current) {
            await conversationRef.current.endSession();
            conversationRef.current = null;
        }
        setStream(null);
        setIsMuted(false);
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
    };
};
