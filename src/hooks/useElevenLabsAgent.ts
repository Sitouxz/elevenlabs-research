import { useState, useCallback, useRef } from "react";
import { Conversation } from "@elevenlabs/client";

export interface AgentMessage {
  role: "ai" | "user";
  text: string;
  timestamp: number;
}

export interface UseElevenLabsAgentReturn {
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
  messages: AgentMessage[];
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
  sendContextualUpdate: (text: string) => void;
}

export function useElevenLabsAgent(agentId: string): UseElevenLabsAgentReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<AgentMessage[]>([]);

  const conversationRef = useRef<Conversation | null>(null);
  const isConnectedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);

  const startSession = useCallback(async () => {
    if (isConnectedRef.current) return;
    if (!agentId) {
      console.warn("[ElevenLabs] No agent ID provided, skipping session start");
      return;
    }
    console.log(`[ElevenLabs Agent] Starting session with agent: ${agentId.slice(0, 8)}...`);
    try {
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = micStream;

      const sessionOptions: any = {
        agentId,
        onConnect: () => {
          isConnectedRef.current = true;
          setIsConnected(true);
        },
        onDisconnect: () => {
          isConnectedRef.current = false;
          conversationRef.current = null;
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
          }
          setIsConnected(false);
          setIsSpeaking(false);
          setIsListening(false);
        },
        onMessage: (message: any) => {
          if (message.message) {
            setMessages((prev) => [
              ...prev,
              {
                role: message.source === "ai" ? "ai" : "user",
                text: message.message,
                timestamp: Date.now(),
              },
            ]);
          }
        },
        onError: (error: any) => {
          console.error(`[ElevenLabs Agent ${agentId}] Error:`, error);
        },
        onModeChange: (mode: any) => {
          setIsSpeaking(mode.mode === "speaking");
          setIsListening(mode.mode === "listening");
        },
      };

      const conversation = await Conversation.startSession(sessionOptions);
      conversationRef.current = conversation;
    } catch (error) {
      console.error(`[ElevenLabs Agent ${agentId}] Failed to start:`, error);
    }
  }, [agentId]);

  const endSession = useCallback(async () => {
    isConnectedRef.current = false;
    const conv = conversationRef.current;
    conversationRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (conv) {
      try {
        await conv.endSession();
      } catch {
        // ignore cleanup errors
      }
    }
    setIsConnected(false);
    setIsSpeaking(false);
    setIsListening(false);
  }, []);

  const sendContextualUpdate = useCallback((text: string) => {
    if (!isConnectedRef.current || !conversationRef.current) return;
    try {
      conversationRef.current.sendContextualUpdate(text);
    } catch {
      // silently ignore
    }
  }, []);

  return {
    isConnected,
    isSpeaking,
    isListening,
    messages,
    startSession,
    endSession,
    sendContextualUpdate,
  };
}
