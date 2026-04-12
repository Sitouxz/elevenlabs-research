import { useState, useCallback, useRef, useEffect } from "react";

export type AvatarMode = "streaming" | "static" | "initializing";

export interface UseAkoolAvatarReturn {
  mode: AvatarMode;
  isReady: boolean;
  isSpeaking: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  error: string | null;
}

const AKOOL_API_BASE = "https://openapi.akool.com";
const CLIENT_ID = import.meta.env.VITE_AKOOL_CLIENT_ID as string | undefined;
const CLIENT_SECRET = import.meta.env.VITE_AKOOL_CLIENT_SECRET as string | undefined;
const AVATAR_ID = import.meta.env.VITE_AKOOL_AVATAR_ID as string | undefined;
const VOICE_ID = import.meta.env.VITE_AKOOL_VOICE_ID as string | undefined;

export function useAkoolAvatar(): UseAkoolAvatarReturn {
  const [mode, setMode] = useState<AvatarMode>("initializing");
  const [isReady, setIsReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (tokenRef.current) return tokenRef.current;
    if (!CLIENT_ID || !CLIENT_SECRET) return null;

    try {
      const res = await fetch(`${AKOOL_API_BASE}/api/open/v3/getToken`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
      });
      const data = await res.json();
      if (data?.data?.token) {
        tokenRef.current = data.data.token;
        return tokenRef.current;
      }
      return null;
    } catch (e) {
      console.error("[Akool] Token fetch failed:", e);
      return null;
    }
  }, []);

  const initStreamingSession = useCallback(async () => {
    const token = await getToken();
    if (!token || !AVATAR_ID) {
      console.warn("[Akool] Missing credentials — falling back to static avatar");
      setMode("static");
      setIsReady(true);
      return;
    }

    try {
      const res = await fetch(`${AKOOL_API_BASE}/api/open/v3/liveAvatar/session/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          avatar_id: AVATAR_ID,
          voice_id: VOICE_ID || "",
        }),
      });

      if (!res.ok) throw new Error(`Session create failed: ${res.status}`);
      const data = await res.json();
      const session = data?.data;
      if (!session?.session_id) throw new Error("No session_id returned");

      sessionIdRef.current = session.session_id;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      peerConnectionRef.current = pc;

      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.play().catch(() => {});
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch(`${AKOOL_API_BASE}/api/open/v3/liveAvatar/session/connect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: session.session_id,
          sdp: offer.sdp,
          type: "offer",
        }),
      });

      if (!sdpRes.ok) throw new Error(`SDP connect failed: ${sdpRes.status}`);
      const sdpData = await sdpRes.json();
      const answer = sdpData?.data;
      if (!answer?.sdp) throw new Error("No SDP answer returned");

      await pc.setRemoteDescription({ type: "answer", sdp: answer.sdp });

      setMode("streaming");
      setIsReady(true);
      console.log("[Akool] Streaming session established");
    } catch (e) {
      console.warn("[Akool] Streaming init failed, falling back to static:", e);
      setError("Akool streaming unavailable — using static avatar");
      setMode("static");
      setIsReady(true);
    }
  }, [getToken]);

  useEffect(() => {
    initStreamingSession();
    return () => {
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const speak = useCallback(async (text: string) => {
    if (mode !== "streaming" || !sessionIdRef.current || !tokenRef.current) return;

    setIsSpeaking(true);
    try {
      await fetch(`${AKOOL_API_BASE}/api/open/v3/liveAvatar/session/talk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenRef.current}`,
        },
        body: JSON.stringify({
          session_id: sessionIdRef.current,
          text,
        }),
      });
    } catch (e) {
      console.error("[Akool] Speak failed:", e);
    } finally {
      setIsSpeaking(false);
    }
  }, [mode]);

  const stop = useCallback(() => {
    setIsSpeaking(false);
  }, []);

  return { mode, isReady, isSpeaking, videoRef, speak, stop, error };
}
