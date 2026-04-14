import { useState, useCallback, useRef, useEffect } from "react";
import AgoraRTC, {
  type IAgoraRTCClient,
  type ILocalAudioTrack,
  type IRemoteAudioTrack,
  type IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";

interface RTCClient extends IAgoraRTCClient {
  sendStreamMessage(msg: Uint8Array | string, flag: boolean): Promise<void>;
}

export type AvatarMode = "streaming" | "static" | "initializing";

export interface AvatarMessage {
  role: "ai" | "user";
  text: string;
  timestamp: number;
}

export interface UseAkoolAvatarReturn {
  mode: AvatarMode;
  isReady: boolean;
  isVideoPlaying: boolean;
  videoTrackReady: boolean;
  loadingStatus: string;
  isSpeaking: boolean;
  isListening: boolean;
  isConnected: boolean;
  messages: AvatarMessage[];
  /** Callback ref to attach to the video container div */
  videoRef: React.Ref<HTMLDivElement>;
  /** Current video container element (for effects that need to react to mount) */
  videoContainer: HTMLDivElement | null;
  speak: (text: string) => Promise<void>;
  stop: () => void;
  error: string | null;
  retryPlay: () => void;
  sendContextualUpdate: (text: string) => void;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

const AKOOL_API_BASE = "https://openapi.akool.com";
const CLIENT_ID = import.meta.env.VITE_AKOOL_CLIENT_ID as string | undefined;
const CLIENT_SECRET = import.meta.env.VITE_AKOOL_CLIENT_SECRET as string | undefined;
const AVATAR_ID = import.meta.env.VITE_AKOOL_AVATAR_ID as string | undefined;
const VOICE_ID = import.meta.env.VITE_AKOOL_VOICE_ID as string | undefined;
const KNOWLEDGE_ID = import.meta.env.VITE_AKOOL_KNOWLEDGE_ID as string | undefined;
const LANGUAGE = (import.meta.env.VITE_AKOOL_LANGUAGE as string | undefined) || "en";
const LLM_PROVIDER = import.meta.env.VITE_AKOOL_LLM_PROVIDER as string | undefined;
const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY as string | undefined;
const ELEVENLABS_VOICE_ID = (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) || "Rachel"; // default female voice

const MAX_ENCODED_SIZE = 950;
const BYTES_PER_SECOND = 6000;

// Module-level singleton — survives React StrictMode double-invoke
let _activeSessionId: string | null = null;
let _initInProgress = false;

function waitForVideoAndMarkPlaying(
  container: HTMLDivElement,
  markPlaying: () => void,
  attempts = 0
) {
  const v = container.querySelector("video");
  if (v) {
    if (!v.paused) { markPlaying(); return; }
    v.addEventListener("playing", markPlaying, { once: true });
    setTimeout(() => markPlaying(), 3000);
  } else if (attempts < 20) {
    setTimeout(() => waitForVideoAndMarkPlaying(container, markPlaying, attempts + 1), 150);
  } else {
    markPlaying();
  }
}

async function sendChunked(client: RTCClient, text: string, msgType: "tts" | "chat" = "tts"): Promise<void> {
  const encoder = new TextEncoder();
  const base = encoder.encode(JSON.stringify({ v: 2, type: msgType, mid: "", idx: 0, fin: false, pld: { text: "" } })).length;
  const maxChunkLen = Math.floor((MAX_ENCODED_SIZE - base) / 4);
  const mid = `msg-${Date.now()}`;
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, maxChunkLen));
    remaining = remaining.slice(maxChunkLen);
  }
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    const payload = encoder.encode(JSON.stringify({ v: 2, type: msgType, mid, idx: i, fin: isLast, pld: { text: chunks[i] } }));
    const start = Date.now();
    await client.sendStreamMessage(payload, false);
    if (!isLast) {
      const delay = Math.max(0, Math.ceil((1000 * payload.length) / BYTES_PER_SECOND) - (Date.now() - start));
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
  }
}

export function useAkoolAvatar(): UseAkoolAvatarReturn {
  const [mode, setMode] = useState<AvatarMode>("initializing");
  const [isReady, setIsReady] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [videoTrackReady, setVideoTrackReady] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("Connecting to avatar...");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [messages, setMessages] = useState<AvatarMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [videoContainer, setVideoContainer] = useState<HTMLDivElement | null>(null);
  const lastContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useCallback((node: HTMLDivElement | null) => {
    setVideoContainer(node);
  }, []);
  const tokenRef = useRef<string | null>(null);
  const agoraClientRef = useRef<RTCClient | null>(null);
  const videoTrackRef = useRef<IRemoteVideoTrack | null>(null);
  const remoteAudioRef = useRef<IRemoteAudioTrack | null>(null);
  const micTrackRef = useRef<ILocalAudioTrack | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isSpeakingRef = useRef(false);
  const speakingMuteRef = useRef(false);
  const unmutePendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partialBotRef = useRef<string>("");
  const speechRecRef = useRef<any>(null);

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
      const token = data?.token || data?.data?.token;
      if (token) { tokenRef.current = token; return token; }
      console.error("[Akool] getToken response:", data);
      return null;
    } catch (e) {
      console.error("[Akool] Token fetch failed:", e);
      return null;
    }
  }, []);

  const closeSession = useCallback(async (sessionId: string, token: string) => {
    try {
      await fetch(`${AKOOL_API_BASE}/api/open/v4/liveAvatar/session/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId }),
      });
      console.log("[Akool] Session closed:", sessionId);
    } catch (e) {
      console.warn("[Akool] Session close failed:", e);
    }
  }, []);

  const initStreamingSession = useCallback(async (abortedRef: { current: boolean }) => {
    // Singleton guard: block if already initialising or a session is live
    if (_initInProgress || _activeSessionId) {
      console.log("[Akool] Init skipped — session already active or in progress");
      return;
    }
    _initInProgress = true;

    const token = await getToken();
    if (abortedRef.current) { _initInProgress = false; return; }
    if (!token || !AVATAR_ID) {
      _initInProgress = false;
      console.warn("[Akool] Missing credentials — falling back to static avatar");
      setMode("static");
      setIsReady(true);
      return;
    }

    // Close any leftover session from a previous page load
    const prevSessionId = localStorage.getItem("akool_session_id");
    if (prevSessionId) {
      localStorage.removeItem("akool_session_id");
      await closeSession(prevSessionId, token);
    }
    if (abortedRef.current) { _initInProgress = false; return; }

    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 4000;

    let data: any = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(`${AKOOL_API_BASE}/api/open/v4/liveAvatar/session/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            avatar_id: AVATAR_ID,
            duration: 600,
            mode_type: 2,
            language: LANGUAGE,
            scene_mode: "fast_dialogue",
            ...(KNOWLEDGE_ID ? { knowledge_id: KNOWLEDGE_ID } : {}),
            ...(LLM_PROVIDER ? { llm_provider: LLM_PROVIDER } : {}),
            stream_type: "agora",
            voice_params: {
              stt_language: LANGUAGE,
              stt_type: "openai_realtime",
              turn_detection: {
                type: "server_vad",
                threshold: 0.75,
                prefix_padding_ms: 300,
                silence_duration_ms: 800,
              },
              ...(ELEVENLABS_API_KEY ? {
                elevenlabs_settings: {
                  api_key: ELEVENLABS_API_KEY,
                  model_id: "eleven_flash_v2_5",
                  voice_id: ELEVENLABS_VOICE_ID,
                  stability: 0.5,
                  similarity_boost: 0.75,
                  style: 0,
                  use_speaker_boost: true,
                },
              } : {
                // Fallback: use Akool voice_id if no ElevenLabs key
                ...(VOICE_ID ? { voice_id: VOICE_ID } : {}),
              }),
            },
          }),
        });
        if (!res.ok) throw new Error(`Session create failed: ${res.status}`);
        data = await res.json();
        if (data?.code === 1000) break;
        const isBusy = typeof data?.msg === "string" && data.msg.toLowerCase().includes("busy");
        if (isBusy && attempt < MAX_RETRIES) {
          console.warn(`[Akool] Avatar busy, retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
          setLoadingStatus(`Avatar busy — retrying (${attempt}/${MAX_RETRIES})...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        throw new Error(`API error: ${data?.msg || data?.code}`);
      } catch (e) {
        if (attempt < MAX_RETRIES && e instanceof Error && e.message.toLowerCase().includes("busy")) {
          console.warn(`[Akool] Avatar busy, retrying in ${RETRY_DELAY_MS / 1000}s (attempt ${attempt}/${MAX_RETRIES})...`);
          setLoadingStatus(`Avatar busy — retrying (${attempt}/${MAX_RETRIES})...`);
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        throw e;
      }
    }

    try {
      if (!data || data.code !== 1000) throw new Error(`API error: ${data?.msg || data?.code}`);

      if (abortedRef.current) { _initInProgress = false; return; }

      const session = data?.data;
      if (!session?._id) throw new Error("No session _id returned");
      sessionIdRef.current = session._id;
      _activeSessionId = session._id;
      localStorage.setItem("akool_session_id", session._id);

      const creds = session.credentials;
      if (!creds?.agora_app_id || !creds?.agora_channel || !creds?.agora_token || !creds?.agora_uid) {
        throw new Error("Missing Agora credentials in session response");
      }

      AgoraRTC.onAudioAutoplayFailed = () => {
        console.warn("[Akool] Audio autoplay blocked — will resume on next user interaction");
        const resume = () => {
          if (remoteAudioRef.current) {
            try { remoteAudioRef.current.play(); } catch (e) { console.error("[Akool] Audio resume error:", e); }
          }
          document.removeEventListener("click", resume);
          document.removeEventListener("touchstart", resume);
        };
        document.addEventListener("click", resume, { once: true });
        document.addEventListener("touchstart", resume, { once: true });
      };

      const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" }) as RTCClient;
      agoraClientRef.current = client;

      client.on("user-published", async (user, mediaType) => {
        const track = await client.subscribe(user, mediaType);
        if (mediaType === "video") {
          videoTrackRef.current = track as IRemoteVideoTrack;
          const markPlaying = () => { setIsVideoPlaying(true); };
          setVideoTrackReady(true);
          if (videoContainer) {
            (track as IRemoteVideoTrack).play(videoContainer);
            waitForVideoAndMarkPlaying(videoContainer, markPlaying);
          } else {
            console.warn("[Akool] videoRef not ready when user-published fired — will replay on mount");
          }
        } else if (mediaType === "audio") {
          remoteAudioRef.current = track as IRemoteAudioTrack;
          try {
            (track as IRemoteAudioTrack).play();
            console.log("[Akool] Remote audio playing");
          } catch (e) {
            console.warn("[Akool] Audio autoplay blocked:", e);
          }
        }
      });

      client.on("user-unpublished", async (user, mediaType) => {
        await client.unsubscribe(user, mediaType);
      });

      client.on("stream-message", (_uid, raw) => {
        try {
          const msg = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw as Uint8Array));

          if (import.meta.env.DEV) {
            console.log("[Akool stream-message]", JSON.stringify(msg).slice(0, 200));
          }

          // TTS status events — track speaking state + mute mic while avatar speaks
          if (msg?.type === "tts") {
            const status = msg?.pld?.status ?? msg?.status;
            if (status === "start" || status === "speaking") {
              isSpeakingRef.current = true;
              setIsSpeaking(true);
              // Mute mic + browser STT so speaker audio doesn't feed back into STT
              if (!speakingMuteRef.current) {
                speakingMuteRef.current = true;
                micTrackRef.current?.setMuted(true).catch(() => {});
                if (speechRecRef.current) {
                  speechRecRef.current.onend = null;
                  try { speechRecRef.current.stop(); } catch { /* already stopped */ }
                }
                setIsListening(false);
              }
            } else if (status === "end" || status === "done") {
              isSpeakingRef.current = false;
              setIsSpeaking(false);
              // Unmute mic 400ms after TTS ends to let speaker audio decay
              if (speakingMuteRef.current) {
                speakingMuteRef.current = false;
                if (unmutePendingRef.current) clearTimeout(unmutePendingRef.current);
                unmutePendingRef.current = setTimeout(() => {
                  unmutePendingRef.current = null;
                  micTrackRef.current?.setMuted(false).catch(() => {});
                  if (speechRecRef.current) {
                    speechRecRef.current.onend = () => { if (speechRecRef.current) speechRecRef.current.start(); };
                    try { speechRecRef.current.start(); } catch { /* already running */ }
                  }
                  setIsListening(true);
                }, 400);
              }
            }
          }

          // ASR events — user speech transcript from Akool STT
          if (msg?.type === "asr") {
            const text = msg?.pld?.text ?? msg?.text ?? "";
            if (text.trim() && msg?.pld?.is_final !== false) {
              setMessages((prev) => [...prev, { role: "user", text: text.trim(), timestamp: Date.now() }]);
            }
          }

          // Chat events — bot response text and user transcript for chat log
          if (msg?.type === "chat") {
            const pld = msg.pld;
            if (pld?.from === "bot") {
              if (!msg.fin) {
                partialBotRef.current += pld.text ?? "";
                isSpeakingRef.current = true;
                setIsSpeaking(true);
              } else {
                const full = partialBotRef.current + (pld.text ?? "");
                partialBotRef.current = "";
                if (full.trim()) {
                  setMessages((prev) => [...prev, { role: "ai", text: full.trim(), timestamp: Date.now() }]);
                }
                isSpeakingRef.current = false;
                setIsSpeaking(false);
              }
            } else if (pld?.from === "user" && pld?.text?.trim()) {
              setMessages((prev) => [...prev, { role: "user", text: pld.text.trim(), timestamp: Date.now() }]);
            }
          }
        } catch {
          // ignore parse errors
        }
      });

      await client.join(creds.agora_app_id, creds.agora_channel, creds.agora_token, creds.agora_uid);

      // Create and publish mic track so Akool hears the user via Agora
      try {
        const mic = await AgoraRTC.createMicrophoneAudioTrack({
          encoderConfig: { sampleRate: 16000, bitrate: 24, stereo: false },
          AEC: true,
          ANS: true,
          AGC: true,
        });
        micTrackRef.current = mic;
        await client.publish(mic);
        setIsListening(true);
        console.log("[Akool] Mic published — Akool STT active");
      } catch (micErr) {
        console.warn("[Akool] Mic publish failed (no mic or permission denied):", micErr);
      }

      // Browser STT shadow — captures user transcripts for chat log & navigation
      // Akool handles all actual LLM+TTS; this only populates messages[]
      const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const rec = new SpeechRecognitionCtor();
        rec.lang = LANGUAGE.startsWith("zh") ? "zh-CN" : "en-US";
        rec.interimResults = false;
        rec.continuous = true;
        rec.onresult = (event: any) => {
          // Only read the NEW result at resultIndex — not the full history
          const result = event.results[event.resultIndex];
          if (!result?.isFinal) return;
          const transcript = result[0].transcript.trim();
          if (transcript) {
            setMessages((prev) => {
              // Deduplicate: skip if last user message is the same text
              const last = prev[prev.length - 1];
              if (last?.role === "user" && last.text === transcript) return prev;
              return [...prev, { role: "user", text: transcript, timestamp: Date.now() }];
            });
          }
        };
        rec.onerror = (e: any) => {
          if (e.error !== "no-speech" && e.error !== "aborted") {
            console.warn("[Akool] Browser STT error:", e.error);
          }
        };
        rec.onend = () => { if (speechRecRef.current) rec.start(); };
        speechRecRef.current = rec;
        rec.start();
        console.log("[Akool] Browser STT shadow started for chat log/navigation");
      }

      _initInProgress = false;
      setIsConnected(true);
      setMode("streaming");
      setLoadingStatus("Starting avatar stream...");
      setIsReady(true);
      console.log("[Akool] Agora joined channel, session:", session._id);
    } catch (e) {
      _initInProgress = false;
      console.warn("[Akool] Streaming init failed, falling back to static:", e);
      setError("Akool streaming unavailable — using static avatar");
      setMode("static");
      setIsReady(true);
    }
  }, [getToken]);

  useEffect(() => {
    const abortedRef = { current: false };
    initStreamingSession(abortedRef);

    return () => {
      abortedRef.current = true;
      if (speechRecRef.current) {
        speechRecRef.current.onend = null;
        speechRecRef.current.stop();
        speechRecRef.current = null;
      }
      micTrackRef.current?.setMuted(true);
      micTrackRef.current?.stop();
      micTrackRef.current?.close();
      micTrackRef.current = null;
      videoTrackRef.current?.stop();
      remoteAudioRef.current?.stop();
      agoraClientRef.current?.leave().catch(() => {});
      agoraClientRef.current = null;
      const sid = sessionIdRef.current;
      const tok = tokenRef.current;
      if (sid && tok) {
        sessionIdRef.current = null;
        _activeSessionId = null;
        _initInProgress = false;
        localStorage.removeItem("akool_session_id");
        closeSession(sid, tok);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Play video track when video container becomes available (handles race condition where Agora publishes before DOM ready)
  useEffect(() => {
    if (!videoContainer || !videoTrackRef.current) return;
    // Check if this is a new container (e.g., navigating between screens)
    const isNewContainer = videoContainer !== lastContainerRef.current;
    if (isNewContainer) {
      lastContainerRef.current = videoContainer;
    }
    // Play if: (1) new container, or (2) not currently playing
    if (isNewContainer || !isVideoPlaying) {
      videoTrackRef.current.play(videoContainer);
      const markPlaying = () => { setIsVideoPlaying(true); };
      waitForVideoAndMarkPlaying(videoContainer, markPlaying);
    }
  }, [videoContainer, videoTrackReady, isVideoPlaying]);

  const speak = useCallback(async (text: string) => {
    const client = agoraClientRef.current;
    if (mode !== "streaming" || !client) return;
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    // Mute mic immediately — unmute happens when TTS end event arrives
    if (!speakingMuteRef.current) {
      speakingMuteRef.current = true;
      micTrackRef.current?.setMuted(true).catch(() => {});
      if (speechRecRef.current) {
        speechRecRef.current.onend = null;
        try { speechRecRef.current.stop(); } catch { /* already stopped */ }
      }
      setIsListening(false);
    }
    try {
      await sendChunked(client, text, "tts");
      // Safety reset if server never sends a done event within 30s
      setTimeout(() => {
        if (isSpeakingRef.current) {
          isSpeakingRef.current = false;
          setIsSpeaking(false);
        }
        if (speakingMuteRef.current) {
          speakingMuteRef.current = false;
          if (unmutePendingRef.current) clearTimeout(unmutePendingRef.current);
          unmutePendingRef.current = setTimeout(() => {
            unmutePendingRef.current = null;
            micTrackRef.current?.setMuted(false).catch(() => {});
            if (speechRecRef.current) {
              speechRecRef.current.onend = () => { if (speechRecRef.current) speechRecRef.current.start(); };
              try { speechRecRef.current.start(); } catch { /* already running */ }
            }
            setIsListening(true);
          }, 400);
        }
      }, 30000);
    } catch (e) {
      console.error("[Akool] Speak failed:", e);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      speakingMuteRef.current = false;
      micTrackRef.current?.setMuted(false).catch(() => {});
      if (speechRecRef.current) {
        speechRecRef.current.onend = () => { if (speechRecRef.current) speechRecRef.current.start(); };
        try { speechRecRef.current.start(); } catch { /* already running */ }
      }
      setIsListening(true);
    }
  }, [mode]);

  // startListening: unmute mic so Akool STT picks up the user, resume browser STT shadow
  const startListening = useCallback(async () => {
    const mic = micTrackRef.current;
    if (mic) {
      try { await mic.setMuted(false); } catch (e) { console.warn("[Akool] setMuted(false) failed:", e); }
    }
    if (speechRecRef.current) {
      try { speechRecRef.current.start(); } catch { /* already running */ }
    }
    setIsListening(true);
  }, []);

  // stopListening: mute mic and pause browser STT shadow
  const stopListening = useCallback(() => {
    const mic = micTrackRef.current;
    if (mic) { mic.setMuted(true).catch(() => {}); }
    if (speechRecRef.current) {
      speechRecRef.current.onend = null;
      try { speechRecRef.current.stop(); } catch { /* already stopped */ }
      speechRecRef.current.onend = () => { if (speechRecRef.current) speechRecRef.current.start(); };
    }
    setIsListening(false);
  }, []);

  const stop = useCallback(() => {
    isSpeakingRef.current = false;
    setIsSpeaking(false);
  }, []);

  const retryPlay = useCallback(() => {
    if (videoTrackRef.current && videoContainer) {
      videoTrackRef.current.play(videoContainer);
      const markPlaying = () => { setIsVideoPlaying(true); };
      waitForVideoAndMarkPlaying(videoContainer, markPlaying);
      console.log("[Akool] retryPlay: replayed video track");
    }
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.play(); } catch (e) { console.warn("[Akool] retryPlay audio failed:", e); }
    }
  }, []);

  const sendContextualUpdate = useCallback((text: string) => {
    speak(text);
  }, [speak]);

  return {
    mode, isReady, isVideoPlaying, videoTrackReady, loadingStatus, isConnected, isSpeaking, isListening, messages,
    videoRef, videoContainer, speak, stop, error, retryPlay, sendContextualUpdate,
    startListening, stopListening,
  };
}
