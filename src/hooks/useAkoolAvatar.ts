import { useState, useCallback, useRef, useEffect } from "react";
import AgoraRTC, {
  type IAgoraRTCClient,
  type ILocalAudioTrack,
  type IRemoteAudioTrack,
  type IRemoteVideoTrack,
} from "agora-rtc-sdk-ng";
import { chatWithFx, isFxConfigured, type FxChatTurn } from "../lib/fxChat";

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
const ELEVENLABS_VOICE_ID = (import.meta.env.VITE_ELEVENLABS_VOICE_ID as string | undefined) || "SDNKIYEpTz0h56jQX8rA"; // default female voice
const SYSTEM_PROMPT = (import.meta.env.VITE_AKOOL_SYSTEM_PROMPT as string | undefined) ||
`You are Lumi, a friendly and knowledgeable AI guide for an interactive smart energy education experience set in Singapore. You only speak English.
Your role is to teach users about renewable energy topics: solar energy, EV charging, battery storage, and AI in energy management.
You are upbeat, encouraging, and speak in clear, concise sentences suitable for a general audience.

IMPORTANT RULES:
- Stay on topic. Only discuss smart energy, sustainability, and Singapore's green city vision.
- When a user picks a topic (Solar Energy, EV Charging, Battery Storage, or AI in Energy), give a brief engaging introduction (2-3 sentences), then invite them to continue exploring or ask questions.
- Keep responses SHORT (1-3 sentences). Do not ramble or repeat yourself.
- Never act as a therapist or life coach. If the user says something off-topic, gently redirect to smart energy topics.
- You are speaking out loud (text-to-speech), so avoid markdown, bullet points, or special formatting.
- When you receive this system context, reply only with "Ready." and say nothing else. Do not greet or list topics yet.
- When a user first speaks to you on the main menu, greet them warmly and ask: would they like to "Start Discovery" to explore one of the energy topics, or "Ask a General Question" about smart energy? Do not list the four topics yet.
- Only list the four topics (Solar Energy, EV Charging, Battery Storage, AI in Energy) when the user chooses to Start Discovery.`;

const MAX_ENCODED_SIZE = 950;
const BYTES_PER_SECOND = 6000;

// When FX LLM is configured we run Akool in retelling mode (mode_type:1) and
// drive the avatar's speech from FX. Otherwise we use Akool's built-in LLM
// (mode_type:2 / fast_dialogue) as before.
const FX_LLM_ENABLED = isFxConfigured();
const AKOOL_MODE_TYPE = FX_LLM_ENABLED ? 1 : 2;
const FX_HISTORY_MAX_TURNS = 12;
// Primed opening greeting spoken on avatar init, then seeded into FX history as a
// completed exchange so FX never re-greets. FX treats any message with no prior
// USER turn as "first contact" and always greets — the fake user ack breaks that.
const FX_OPENING_GREETING = "Hello and welcome to the interactive smart energy education experience in Singapore! Would you like to Start Discovery and explore one of our energy topics, or Ask a General Question about smart energy?";
// Full fake exchange added to fxHistoryRef on init: ai greeting + user ack + ai ready.
// This tells FX the intro is done so it responds to content directly.
const FX_PRIMED_HISTORY = [
  { ai: FX_OPENING_GREETING },
  { user: "let's start" },
  { ai: "Great! Ask me anything about Solar Energy, EV Charging, Battery Storage, or AI in Energy Management — or say 'Start Discovery' to explore a topic." },
];


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

async function muteMic(client: RTCClient | null, mic: ILocalAudioTrack | null): Promise<void> {
  if (!mic) return;
  console.log("[Akool] MUTING MIC - unpublishing from Agora");
  try { await mic.setEnabled(false); } catch { /* ignore */ }
  if (client) try { await client.unpublish(mic); } catch { /* already unpublished */ }
}

async function unmuteMic(client: RTCClient | null, mic: ILocalAudioTrack | null): Promise<void> {
  if (!mic) return;
  console.log("[Akool] UNMUTING MIC - publishing to Agora");
  try { await mic.setEnabled(true); } catch { /* ignore */ }
  if (client) try { await client.publish(mic); } catch { /* already published */ }
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
  // In FX mode, gate the remote audio at volume 0 until our first FX-driven speak()
  // so Akool's hardcoded avatar greeting ("Hello") plays silently and only the
  // FX reply is heard. Cleared on the first speak().
  const audioGatedRef = useRef<boolean>(FX_LLM_ENABLED);
  const micTrackRef = useRef<ILocalAudioTrack | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isSpeakingRef = useRef(false);
  const speakingMuteRef = useRef(false);
  const unmutePendingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingGenerationRef = useRef(0); // Incremented each time TTS starts, prevents stale timeouts from unmuting
  const partialBotRef = useRef<string>("");
  const speechRecRef = useRef<any>(null);
  // FX LLM chat history (alternating user/ai turns, oldest first)
  const fxHistoryRef = useRef<FxChatTurn[]>([]);
  // Guard against double-dispatching FX for the same transcript (browser STT + Akool ASR can both fire)
  const fxInFlightRef = useRef<boolean>(false);
  const fxLastPromptRef = useRef<string>("");
  // Queue: if a dispatch arrives while one is in flight, store the latest prompt here
  const fxQueuedPromptRef = useRef<string | null>(null);
  // Forward-reference to speak() so the FX dispatcher (created inside initStreamingSession) can call it.
  const speakRef = useRef<(text: string) => Promise<void>>(async () => { /* set after speak is defined */ });
  const lastTtsEndRef = useRef<number>(0);
  const recentBotTextsRef = useRef<string[]>([]);
  const suppressFirstResponseRef = useRef<boolean>(false);
  const systemPromptUnmutePendingRef = useRef<boolean>(false); // Track if system prompt unmute was blocked by speaking

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

  // Dispatch a user transcript to FX LLM, then have the avatar speak the reply.
  // Idempotent for duplicate transcripts — browser STT, Akool ASR, and Akool's
  // chat-from-user event can all fire for the same utterance with different
  // casing / punctuation, so we normalize before comparing.
  const fxLastDispatchAtRef = useRef<number>(0);

  // Normalize a transcript for dedupe (lowercase, collapse ws, strip terminal punctuation).
  const normalizeTranscript = useCallback((s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?,;:]+$/g, ""), []);

  // Append a user transcript to the chat log, deduping against the last few user
  // messages (handles the case where browser STT, Akool ASR, and Akool's
  // chat-from-user event all surface the same utterance with different casing).
  const appendUserMessage = useCallback((text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    const norm = normalizeTranscript(trimmed);
    let appended = false;
    setMessages((prev) => {
      // Check the last 3 messages for a normalized match within 8 seconds
      const cutoff = Date.now() - 8000;
      for (let i = prev.length - 1, checked = 0; i >= 0 && checked < 3; i--, checked++) {
        const m = prev[i];
        if (m.role !== "user") continue;
        if (m.timestamp < cutoff) break;
        if (normalizeTranscript(m.text) === norm) return prev;
      }
      appended = true;
      return [...prev, { role: "user", text: trimmed, timestamp: Date.now() }];
    });
    return appended;
  }, [normalizeTranscript]);
  const dispatchFxRef = useRef<(userText: string) => Promise<void>>(async () => {});
  const dispatchFx = useCallback(async (userText: string) => {
    if (!FX_LLM_ENABLED) return;
    const trimmed = userText.trim();
    if (!trimmed) return;
    const norm = trimmed.toLowerCase().replace(/\s+/g, " ").replace(/[.!?,;:]+$/g, "");
    const now = Date.now();
    // Drop exact duplicate within 5s (multi-source dedup: browser STT + Akool ASR).
    if (fxLastPromptRef.current === norm && now - fxLastDispatchAtRef.current < 5000) return;
    // Serialize: if one is in flight, queue this prompt (replacing any previous queued).
    // This prevents concurrent speak() calls which cause Akool to drop one response.
    if (fxInFlightRef.current) {
      fxQueuedPromptRef.current = trimmed;
      return;
    }
    fxLastPromptRef.current = norm;
    fxLastDispatchAtRef.current = now;
    fxInFlightRef.current = true;
    try {
      const history = fxHistoryRef.current.slice(-FX_HISTORY_MAX_TURNS);
      const res = await chatWithFx(trimmed, history);
      fxHistoryRef.current.push({ user: trimmed });
      fxHistoryRef.current.push({ ai: res.text });
      if (fxHistoryRef.current.length > FX_HISTORY_MAX_TURNS * 2) {
        fxHistoryRef.current = fxHistoryRef.current.slice(-FX_HISTORY_MAX_TURNS * 2);
      }
      setMessages((prev) => [...prev, { role: "ai", text: res.text, timestamp: Date.now() }]);
      recentBotTextsRef.current.push(res.text.toLowerCase());
      if (recentBotTextsRef.current.length > 10) recentBotTextsRef.current.shift();
      await speakRef.current(res.text);
    } catch (e) {
      console.error("[FX] dispatch failed:", e);
    } finally {
      fxInFlightRef.current = false;
      // Drain queue: replay the latest buffered prompt (if any) after current finishes.
      const queued = fxQueuedPromptRef.current;
      if (queued) {
        fxQueuedPromptRef.current = null;
        dispatchFxRef.current(queued);
      }
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
            mode_type: AKOOL_MODE_TYPE,
            language: LANGUAGE,
            // scene_mode is only meaningful in dialogue mode (mode_type:2)
            ...(AKOOL_MODE_TYPE === 2 ? { scene_mode: "fast_dialogue" } : {}),
            // In retelling mode (FX owns the LLM) we MUST NOT forward knowledge_id /
            // llm_provider — otherwise Akool runs its own brain alongside ours and
            // the avatar double-speaks (one reply from Akool, one from FX).
            ...(!FX_LLM_ENABLED && KNOWLEDGE_ID ? { knowledge_id: KNOWLEDGE_ID } : {}),
            ...(!FX_LLM_ENABLED && LLM_PROVIDER ? { llm_provider: LLM_PROVIDER } : {}),
            ...(!ELEVENLABS_API_KEY && VOICE_ID ? { voice_id: VOICE_ID } : {}),
            stream_type: "agora",
            voice_params: {
              stt_language: LANGUAGE,
              stt_type: "openai_realtime",
              voice: "shimmer",
              turn_detection: {
                type: "server_vad",
                threshold: 0.85,
                prefix_padding_ms: 300,
                silence_duration_ms: 1200,
                interrupt_response: false,
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
              } : {}),
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
            // Mute Akool's hardcoded avatar greeting in FX mode — only un-gate
            // when our first FX-driven speak() runs.
            if (audioGatedRef.current) {
              try { (track as IRemoteAudioTrack).setVolume(0); } catch { /* setVolume not supported */ }
              console.log("[Akool] Remote audio gated (volume=0) until first FX reply");
            }
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
            // Suppress TTS for first response after system prompt
            if (suppressFirstResponseRef.current) {
              if (import.meta.env.DEV) console.log("[Akool] TTS suppressed (first response)");
              return;
            }
            const status = msg?.pld?.status ?? msg?.status;
            if (status === "start" || status === "speaking") {
              isSpeakingRef.current = true;
              setIsSpeaking(true);
              // Increment generation to invalidate any pending unmute timeouts
              speakingGenerationRef.current++;
              const currentGen = speakingGenerationRef.current;
              // Cancel any pending unmute timeout
              if (unmutePendingRef.current) {
                clearTimeout(unmutePendingRef.current);
                unmutePendingRef.current = null;
              }
              // Unpublish mic + stop browser STT so avatar audio can't trigger STT
              speakingMuteRef.current = true;
              setIsListening(false);
              // AGGRESSIVE: Always mute immediately, even if already muted
              if (micTrackRef.current && agoraClientRef.current) {
                muteMic(agoraClientRef.current, micTrackRef.current);
              }
              if (speechRecRef.current) {
                speechRecRef.current.onend = null;
                try { speechRecRef.current.stop(); } catch { /* already stopped */ }
              }
              // Log for debugging
              console.log(`[Akool] TTS started - generation ${currentGen}, mic muted`);
            } else if (status === "end" || status === "done") {
              isSpeakingRef.current = false;
              setIsSpeaking(false);
              speakingMuteRef.current = false;
              lastTtsEndRef.current = Date.now();
              if (unmutePendingRef.current) clearTimeout(unmutePendingRef.current);
              const generationAtEnd = speakingGenerationRef.current;
              unmutePendingRef.current = setTimeout(() => {
                unmutePendingRef.current = null;
                if (isSpeakingRef.current) {
                  console.log("[Akool] Post-TTS unmute blocked - avatar is speaking again");
                  return;
                }
                if (speakingGenerationRef.current !== generationAtEnd) {
                  console.log(`[Akool] Post-TTS unmute blocked - generation mismatch (${generationAtEnd} vs ${speakingGenerationRef.current})`);
                  return;
                }
                unmuteMic(agoraClientRef.current, micTrackRef.current);
                if (speechRecRef.current) {
                  speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
                  try { speechRecRef.current.start(); } catch { /* already running */ }
                }
                setIsListening(true);
              }, 800);
            }
          }

          // Audio events — fallback for when TTS events aren't sent by server
          if (msg?.type === "event") {
            const eventType = msg?.pld?.event ?? msg?.event;
            if (eventType === "audio_start") {
              // Silence remote audio during system prompt response so user never hears it
              if (suppressFirstResponseRef.current) {
                try { remoteAudioRef.current?.setVolume(0); } catch { /* ignore */ }
              }
              // Only trigger if not already speaking
              if (!isSpeakingRef.current) {
                console.log("[Akool] Audio start detected (TTS fallback) - muting mic");
                isSpeakingRef.current = true;
                setIsSpeaking(true);
                speakingGenerationRef.current++;
                if (unmutePendingRef.current) {
                  clearTimeout(unmutePendingRef.current);
                  unmutePendingRef.current = null;
                }
                speakingMuteRef.current = true;
                setIsListening(false);
                if (micTrackRef.current && agoraClientRef.current) {
                  muteMic(agoraClientRef.current, micTrackRef.current);
                }
                if (speechRecRef.current) {
                  speechRecRef.current.onend = null;
                  try { speechRecRef.current.stop(); } catch { /* already stopped */ }
                }
              }
            } else if (eventType === "audio_end") {
              // Restore volume if we silenced it for the system prompt response
              try { remoteAudioRef.current?.setVolume(100); } catch { /* ignore */ }
              // Always reset + schedule unmute — do NOT gate on isSpeakingRef.
              // The 15s safety timeout can reset isSpeakingRef=false while audio is still
              // playing (when it fires between two back-to-back responses), causing audio_end
              // to see isSpeakingRef=false and skip the unmute entirely. The generation check
              // inside the timer is the real guard against a premature unmute.
              console.log("[Akool] Audio end detected (TTS fallback) - will unmute shortly");
              isSpeakingRef.current = false;
              setIsSpeaking(false);
              speakingMuteRef.current = false;
              lastTtsEndRef.current = Date.now();
              systemPromptUnmutePendingRef.current = false;
              if (unmutePendingRef.current) clearTimeout(unmutePendingRef.current);
              const generationAtEnd = speakingGenerationRef.current;
              unmutePendingRef.current = setTimeout(() => {
                unmutePendingRef.current = null;
                if (isSpeakingRef.current) {
                  console.log("[Akool] Post-audio unmute blocked - avatar is speaking again");
                  return;
                }
                if (speakingGenerationRef.current !== generationAtEnd) {
                  console.log(`[Akool] Post-audio unmute blocked - generation mismatch`);
                  return;
                }
                unmuteMic(agoraClientRef.current, micTrackRef.current);
                if (speechRecRef.current) {
                  speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
                  try { speechRecRef.current.start(); } catch { /* already running */ }
                }
                setIsListening(true);
              }, 800);
            }
          }

          // ASR events — user speech transcript from Akool STT
          if (msg?.type === "asr") {
            const text = msg?.pld?.text ?? msg?.text ?? "";
            if (!text.trim()) return;
            if (msg?.pld?.is_final === false) return;

            const trimmed = text.trim();
            const tLower = trimmed.toLowerCase();

            // DEBUG: Always log ASR events
            console.log(`[Akool] ASR received: "${trimmed}" | isSpeaking: ${isSpeakingRef.current} | isListening: ${isListening}`);

            // ECHO SUPPRESSION: Skip if avatar is currently speaking or recently finished
            if (isSpeakingRef.current) {
              console.log(`[Akool] ASR BLOCKED - avatar is speaking: "${trimmed}"`);
              // AGGRESSIVE: Re-mute mic immediately to ensure server STT stops receiving audio
              if (micTrackRef.current && agoraClientRef.current) {
                muteMic(agoraClientRef.current, micTrackRef.current);
              }
              return;
            }

            // Skip if within 1.5s of TTS ending (audio decay buffer) - reduced from 3s
            if (Date.now() - lastTtsEndRef.current < 1500) {
              if (import.meta.env.DEV) console.log("[Akool] ASR suppressed - TTS cooldown:", trimmed);
              return;
            }

            // Skip very short transcripts (likely noise)
            if (trimmed.length < 2) return;

            // ECHO SUPPRESSION: Check against recent bot messages
            const isEcho = recentBotTextsRef.current.some((botText) => {
              // Direct substring match (only if substantial length)
              if (tLower.length > 10 && (botText.includes(tLower) || tLower.includes(botText))) return true;
              // Word overlap check (>40% overlap = likely echo) - reduced from 50%
              const tWords = new Set(tLower.split(/\s+/));
              const bWords = botText.split(/\s+/);
              if (bWords.length === 0) return false;
              const overlap = bWords.filter((w) => tWords.has(w)).length;
              return overlap / Math.max(tWords.size, bWords.length) > 0.4;
            });

            if (isEcho) {
              if (import.meta.env.DEV) console.log("[Akool] ASR echo suppressed:", trimmed);
              return;
            }

            if (import.meta.env.DEV) console.log("[Akool] ASR accepted:", trimmed);
            const asrAdded = appendUserMessage(trimmed);
            // In retelling mode, forward the transcript to FX LLM and have the avatar speak its reply.
            // Only dispatch if this transcript wasn't already handled (dedupe across intake paths).
            if (asrAdded && FX_LLM_ENABLED) dispatchFx(trimmed);
          }

          // Chat events — bot response text and user transcript for chat log
          if (msg?.type === "chat") {
            const pld = msg.pld;
            if (pld?.from === "bot") {
              // In FX mode, Akool's brain is NOT the source of truth. Some avatar
              // profiles emit spontaneous greetings ("Hello") with TTS audio even in
              // retelling mode — we must NOT add those to the chat log or the echo
              // filter, otherwise the user's next utterance gets falsely suppressed.
              // FX-generated replies are tracked separately inside dispatchFx().
              if (FX_LLM_ENABLED) {
                if (import.meta.env.DEV) console.log("[Akool] Ignoring spontaneous bot chat (FX mode):", (pld.text ?? "").slice(0, 60));
                return;
              }
              // Suppress first bot response after system prompt (prevents double-speaking on init)
              if (suppressFirstResponseRef.current) {
                if (msg.fin) {
                  suppressFirstResponseRef.current = false;
                  partialBotRef.current = "";
                  // Restore audio volume in case audio_end didn't fire before fin
                  try { remoteAudioRef.current?.setVolume(100); } catch { /* ignore */ }
                  if (import.meta.env.DEV) console.log("[Akool] First bot response suppressed (system prompt response)");
                  // Republish mic now that the system prompt response is fully done
                  if (speakingMuteRef.current) {
                    speakingMuteRef.current = false;
                    if (unmutePendingRef.current) clearTimeout(unmutePendingRef.current);
                    const generationAtEnd = speakingGenerationRef.current;
                    systemPromptUnmutePendingRef.current = true;
                    unmutePendingRef.current = setTimeout(() => {
                      unmutePendingRef.current = null;
                      // BLOCK: Do not unmute if avatar is speaking
                      if (isSpeakingRef.current) {
                        console.log("[Akool] System prompt unmute blocked - avatar is speaking, will retry on audio_end");
                        return;
                      }
                      // BLOCK: Do not unmute if generation changed
                      if (speakingGenerationRef.current !== generationAtEnd) {
                        console.log(`[Akool] System prompt unmute blocked - generation mismatch`);
                        return;
                      }
                      // Clear the pending flag since we're unmuting now
                      systemPromptUnmutePendingRef.current = false;
                      unmuteMic(agoraClientRef.current, micTrackRef.current);
                      if (speechRecRef.current) {
                        speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
                        try { speechRecRef.current.start(); } catch { /* already running */ }
                      }
                      setIsListening(true);
                    }, 800);
                  }
                }
                return;
              }
              if (!msg.fin) {
                partialBotRef.current += pld.text ?? "";
                isSpeakingRef.current = true;
                setIsSpeaking(true);
                // Track partial bot text for echo suppression as it accumulates
                const partial = partialBotRef.current.trim().toLowerCase();
                if (partial.length > 5) {
                  recentBotTextsRef.current.push(partial);
                  if (recentBotTextsRef.current.length > 10) recentBotTextsRef.current.shift();
                }
              } else {
                const full = partialBotRef.current + (pld.text ?? "");
                partialBotRef.current = "";
                if (full.trim()) {
                  setMessages((prev) => [...prev, { role: "ai", text: full.trim(), timestamp: Date.now() }]);
                  // Track recent bot text for echo suppression in browser STT
                  recentBotTextsRef.current.push(full.trim().toLowerCase());
                  if (recentBotTextsRef.current.length > 10) recentBotTextsRef.current.shift();
                }
                // Do NOT reset isSpeakingRef here — TTS audio is still playing
                // Only the TTS end/done event should clear speaking state
                // Safety: if TTS end event never arrives, force-reset after 15s
                const generationAtChatEnd = speakingGenerationRef.current;
                setTimeout(() => {
                  // If generation moved on, a new TTS is playing — don't interfere
                  if (speakingGenerationRef.current !== generationAtChatEnd) {
                    console.log("[Akool] Safety timeout skipped - new generation active");
                    return;
                  }
                  if (isSpeakingRef.current) {
                    console.warn("[Akool] TTS end event not received — force-resetting speaking state");
                    isSpeakingRef.current = false;
                    setIsSpeaking(false);
                    lastTtsEndRef.current = Date.now();
                    if (speakingMuteRef.current) {
                      speakingMuteRef.current = false;
                      if (unmutePendingRef.current) clearTimeout(unmutePendingRef.current);
                      unmutePendingRef.current = setTimeout(() => {
                        unmutePendingRef.current = null;
                        // BLOCK: Do not unmute if avatar is speaking
                        if (isSpeakingRef.current) {
                          console.log("[Akool] Safety timeout unmute blocked - avatar is speaking");
                          return;
                        }
                        // BLOCK: Do not unmute if generation changed
                        if (speakingGenerationRef.current !== generationAtChatEnd) {
                          console.log(`[Akool] Safety timeout unmute blocked - generation mismatch`);
                          return;
                        }
                        // Use unmuteMic for proper Agora publish flow
                        unmuteMic(agoraClientRef.current, micTrackRef.current);
                        if (speechRecRef.current) {
                          speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
                          try { speechRecRef.current.start(); } catch { /* already running */ }
                        }
                        setIsListening(true);
                      }, 800);
                    }
                  }
                }, 15000);
              }
            } else if (pld?.from === "user" && pld?.text?.trim()) {
              const trimmed = pld.text.trim();
              const tLower = trimmed.toLowerCase();

              // ECHO SUPPRESSION for chat user messages (same logic as ASR)
              if (isSpeakingRef.current) {
                if (import.meta.env.DEV) console.log("[Akool] Chat user msg suppressed - avatar speaking:", trimmed);
                // AGGRESSIVE: Re-mute mic immediately to ensure server STT stops receiving audio
                if (micTrackRef.current && agoraClientRef.current) {
                  muteMic(agoraClientRef.current, micTrackRef.current);
                }
                return;
              }
              if (Date.now() - lastTtsEndRef.current < 1500) {
                if (import.meta.env.DEV) console.log("[Akool] Chat user msg suppressed - TTS cooldown:", trimmed);
                return;
              }
              // Check against recent bot messages
              const isEcho = recentBotTextsRef.current.some((botText) => {
                if (tLower.length > 10 && (botText.includes(tLower) || tLower.includes(botText))) return true;
                const tWords = new Set(tLower.split(/\s+/));
                const bWords = botText.split(/\s+/);
                if (bWords.length === 0) return false;
                const overlap = bWords.filter((w) => tWords.has(w)).length;
                return overlap / Math.max(tWords.size, bWords.length) > 0.4;
              });
              if (isEcho) {
                if (import.meta.env.DEV) console.log("[Akool] Chat user msg echo suppressed:", trimmed);
                return;
              }

              if (import.meta.env.DEV) console.log("[Akool] Chat user msg accepted:", trimmed);
              const chatAdded = appendUserMessage(trimmed);
              if (chatAdded && FX_LLM_ENABLED) dispatchFx(trimmed);
            }
          }
        } catch {
          // ignore parse errors
        }
      });

      await client.join(creds.agora_app_id, creds.agora_channel, creds.agora_token, creds.agora_uid);

      // Create mic track unless we're in FX mode. In FX mode the user's voice is
      // captured by the browser's Web Speech API for STT only — we MUST NOT publish
      // mic audio to Akool's Agora channel, otherwise Akool's retelling mode (mode_type:1)
      // makes the avatar parrot every utterance back through the avatar's mouth.
      if (!FX_LLM_ENABLED) {
        try {
          const mic = await AgoraRTC.createMicrophoneAudioTrack({
            encoderConfig: { sampleRate: 16000, bitrate: 24, stereo: false },
            AEC: true,
            ANS: true,
            AGC: true,
          });
          micTrackRef.current = mic;
          speakingMuteRef.current = true;
          setIsListening(false);
          console.log("[Akool] Mic created (unpublished) — will publish after system prompt response");
        } catch (micErr) {
          console.warn("[Akool] Mic create failed (no mic or permission denied):", micErr);
        }
      } else {
        // FX mode: no Akool mic publication. Browser STT will use the system mic directly.
        speakingMuteRef.current = false;
        setIsListening(true);
        console.log("[Akool] FX mode — Akool mic NOT created (browser STT only)");
      }

      // Send system prompt only when using Akool's built-in LLM. In retelling mode
      // (FX backend), the FX config already owns the persona/system prompt, so skip.
      if (!FX_LLM_ENABLED) {
        // Suppress the bot's response to the system prompt (LLM often hallucinates a topic selection)
        suppressFirstResponseRef.current = true;
        try {
          await sendChunked(client, SYSTEM_PROMPT, "chat");
          console.log("[Akool] System prompt sent via chat message");
        } catch (e) {
          console.warn("[Akool] Failed to send system prompt:", e);
        }
      } else {
        // FX mode: prime history with opening greeting so FX never re-greets on
        // the first real user message. The FX backend treats empty history as
        // "first interaction" and always responds with a welcome, regardless of
        // what the user says. Seeding one AI turn breaks that pattern.
        fxHistoryRef.current = [...FX_PRIMED_HISTORY];
        setMessages([{ role: "ai", text: FX_OPENING_GREETING, timestamp: Date.now() }]);
        suppressFirstResponseRef.current = false;
        speakingMuteRef.current = false;
        setIsListening(false);
        // Seed echo suppression with the opening greeting text.
        recentBotTextsRef.current.push(FX_OPENING_GREETING.toLowerCase());
        // Speak the primed greeting so the user hears a welcome on load.
        // Use a timeout to let Agora audio track stabilize first.
        setTimeout(() => {
          speakRef.current(FX_OPENING_GREETING).then(() => {
            setIsListening(true);
          });
        }, 1500);
        console.log("[Akool] Retelling mode active — FX LLM will drive avatar speech");
      }
      // Safety: if system prompt chat fin never arrives, publish mic after 12s
      const generationAtInit = speakingGenerationRef.current;
      setTimeout(() => {
        if (suppressFirstResponseRef.current) {
          suppressFirstResponseRef.current = false;
          partialBotRef.current = "";
          console.warn("[Akool] System prompt response timeout — force-publishing mic");
        }
        if (speakingMuteRef.current) {
          speakingMuteRef.current = false;
          // BLOCK: Do not unmute if avatar is speaking
          if (isSpeakingRef.current) {
            console.log("[Akool] System prompt timeout unmute blocked - avatar is speaking");
            return;
          }
          // BLOCK: Do not unmute if generation changed
          if (speakingGenerationRef.current !== generationAtInit) {
            console.log(`[Akool] System prompt timeout unmute blocked - generation mismatch`);
            return;
          }
          unmuteMic(agoraClientRef.current, micTrackRef.current);
          if (speechRecRef.current) {
            speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
            try { speechRecRef.current.start(); } catch { /* already running */ }
          }
          setIsListening(true);
        }
      }, 12000);

      // Browser STT — populates messages[] for chat log & voice navigation
      const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionCtor) {
        const rec = new SpeechRecognitionCtor();
        rec.lang = LANGUAGE.startsWith("zh") ? "zh-CN" : "en-US";
        rec.interimResults = false;
        rec.continuous = true;
        rec.onresult = (event: any) => {
          const result = event.results[event.resultIndex];
          if (!result?.isFinal) return;
          if (isSpeakingRef.current) return;
          if (Date.now() - lastTtsEndRef.current < 1500) return;
          const confidence = result[0].confidence ?? 1;
          if (confidence < 0.6) return;
          const transcript = result[0].transcript.trim();
          if (transcript.length < 2) return;
          if (import.meta.env.DEV) console.log("[Akool] Browser STT accepted:", transcript);
          const sttAdded = appendUserMessage(transcript);
          if (sttAdded && FX_LLM_ENABLED) dispatchFx(transcript);
        };
        rec.onerror = (e: any) => {
          if (e.error !== "no-speech" && e.error !== "aborted") {
            console.warn("[Akool] Browser STT error:", e.error);
          }
        };
        rec.onend = () => {
          if (!speechRecRef.current) return;
          setTimeout(() => {
            if (!speechRecRef.current) return;
            try { rec.start(); } catch { /* already started */ }
          }, 200);
        };
        speechRecRef.current = rec;
        rec.start();
        console.log("[Akool] Browser STT started");
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
    // Increment generation and cancel any pending unmutes
    speakingGenerationRef.current++;
    const speakGeneration = speakingGenerationRef.current;
    if (unmutePendingRef.current) {
      clearTimeout(unmutePendingRef.current);
      unmutePendingRef.current = null;
    }
    console.log(`[Akool] speak() started - generation ${speakGeneration}`);
    // First FX-driven speak: lift the audio gate so the avatar is actually audible.
    // (Akool's hardcoded greeting played silently before this point in FX mode.)
    if (audioGatedRef.current) {
      audioGatedRef.current = false;
      try { remoteAudioRef.current?.setVolume(100); } catch { /* setVolume not supported */ }
      console.log("[Akool] Remote audio un-gated (volume=100)");
    }
    // Unpublish mic immediately — republish happens when TTS end event arrives
    speakingMuteRef.current = true;
    setIsListening(false);
    // AGGRESSIVE: Ensure mic is fully unpublished before sending TTS
    await muteMic(agoraClientRef.current, micTrackRef.current);
    // Small delay to ensure mute propagates to server
    await new Promise(r => setTimeout(r, 100));
    console.log(`[Akool] Mic muted, sending TTS...`);
    if (speechRecRef.current) {
      speechRecRef.current.onend = null;
      try { speechRecRef.current.stop(); } catch { /* already stopped */ }
    }
    try {
      // In retelling mode (mode_type:1) Akool expects type:"chat" for the text the
      // avatar should speak. Using type:"tts" works in dialogue mode but only
      // synthesizes the first segment in retelling mode (cut-off behaviour).
      await sendChunked(client, text, FX_LLM_ENABLED ? "chat" : "tts");
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
            // BLOCK: Do not unmute if avatar is speaking
            if (isSpeakingRef.current) {
              console.log("[Akool] Speak timeout unmute blocked - avatar is speaking");
              return;
            }
            // BLOCK: Do not unmute if generation changed
            if (speakingGenerationRef.current !== speakGeneration) {
              console.log(`[Akool] Speak timeout unmute blocked - generation mismatch`);
              return;
            }
            unmuteMic(agoraClientRef.current, micTrackRef.current);
            if (speechRecRef.current) {
              speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
              try { speechRecRef.current.start(); } catch { /* already running */ }
            }
            setIsListening(true);
          }, 800);
        }
      }, 30000);
    } catch (e) {
      console.error("[Akool] Speak failed:", e);
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      speakingMuteRef.current = false;
      // CRITICAL: Check generation before unmuting - new TTS may have started during error handling
      if (speakingGenerationRef.current !== speakGeneration) {
        console.log("[Akool] Speak catch blocked - new generation started during error");
        return;
      }
      // Only unmute if not speaking again
      if (!isSpeakingRef.current) {
        unmuteMic(agoraClientRef.current, micTrackRef.current);
        if (speechRecRef.current) {
          speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
          try { speechRecRef.current.start(); } catch { /* already running */ }
        }
        setIsListening(true);
      }
    }
  }, [mode]);

  // Keep speakRef in sync so the FX dispatcher can invoke the latest speak() closure.
  useEffect(() => { speakRef.current = speak; }, [speak]);
  useEffect(() => { dispatchFxRef.current = dispatchFx; }, [dispatchFx]);

  // startListening: republish mic so Akool STT picks up the user, resume browser STT shadow
  const startListening = useCallback(async () => {
    // BLOCK: Do not enable listening if avatar is currently speaking
    if (isSpeakingRef.current) {
      console.log("[Akool] startListening blocked - avatar is speaking");
      return;
    }
    const mic = micTrackRef.current;
    if (mic) {
      try { await unmuteMic(agoraClientRef.current, mic); } catch (e) { console.warn("[Akool] republish mic failed:", e); }
    }
    if (speechRecRef.current) {
      try { speechRecRef.current.start(); } catch { /* already running */ }
    }
    // CRITICAL: Double-check speaking state before setting isListening
    if (isSpeakingRef.current) {
      console.log("[Akool] startListening: BLOCKED at end - avatar started speaking during unmute");
      return;
    }
    setIsListening(true);
  }, []);

  // stopListening: unpublish mic and pause browser STT shadow
  const stopListening = useCallback(() => {
    const mic = micTrackRef.current;
    if (mic) { muteMic(agoraClientRef.current, mic); }
    if (speechRecRef.current) {
      speechRecRef.current.onend = null;
      try { speechRecRef.current.stop(); } catch { /* already stopped */ }
      // NEVER auto-restart if avatar is speaking - check isSpeakingRef
      speechRecRef.current.onend = () => { if (!speechRecRef.current) return; setTimeout(() => { if (!speechRecRef.current) return; try { speechRecRef.current!.start(); } catch { /* already started or destroyed */ } }, 200); };
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
    const client = agoraClientRef.current;
    if (mode !== "streaming" || !client) return;
    // Send as a chat message (processed by the LLM) rather than TTS (spoken verbatim).
    // This lets the LLM generate a natural response instead of reading the raw context string.
    sendChunked(client, text, "chat").catch((e) => console.warn("[Akool] sendContextualUpdate failed:", e));
  }, [mode]);

  return {
    mode, isReady, isVideoPlaying, videoTrackReady, loadingStatus, isConnected, isSpeaking, isListening, messages,
    videoRef, videoContainer, speak, stop, error, retryPlay, sendContextualUpdate,
    startListening, stopListening,
  };
}
