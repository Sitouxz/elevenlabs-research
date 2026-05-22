import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { ChatLog } from "../components/ChatLog";
import { MicIndicator } from "../components/MicIndicator";
import { TOPICS } from "../types";

const BASE = import.meta.env.BASE_URL;
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";
import type { AvatarMessage as AgentMessage } from "../hooks/useAkoolAvatar";
import type { TopicId } from "../types";

interface TopicDetailScreenProps {
  avatar: UseAkoolAvatarReturn;
  messages: AgentMessage[];
  topicId: TopicId;
  onBack: () => void;
  onNext?: () => void;
  isListening?: boolean;
}

const SOLAR_LOW_KEYWORDS = [
  "production is low", "production low", "production are low",
  "low production", "solar low", "low solar",
  "solar is low", "solar are low",
  "not enough sun", "cloudy", "overcast", "less sunlight", "less sun",
  "solar panel low", "panel is low", "when it rain", "rainy", "no sun",
  "when solar low", "when the solar",
];

const EV_CHARGING_KEYWORDS = [
  "decide how to charge", "how ev charging decide", "how does ev charging decide",
  "charging decide", "charge the vehicle", "how to charge the vehicle",
  "decide to charge", "ev decide", "how it decides",
];

function detectVideo(text: string, topicId: TopicId): string | null {
  const lower = text.toLowerCase();
  if (topicId === "solar") {
    const keywordMatch = SOLAR_LOW_KEYWORDS.some(k => lower.includes(k));
    const comboMatch = (lower.includes("solar") || lower.includes("production") || lower.includes("panel")) && lower.includes("low");
    if (keywordMatch || comboMatch) return `${BASE}assets/solar-low.webm`;
  }
  if (topicId === "ev" && EV_CHARGING_KEYWORDS.some(k => lower.includes(k))) {
    return `${BASE}assets/ev-charging.webm`;
  }
  return null;
}

export function TopicDetailScreen({
  avatar,
  messages,
  topicId,
  onBack,
  onNext,
  isListening = false
}: TopicDetailScreenProps) {
  const topic = TOPICS.find((t) => t.id === topicId) ?? TOPICS[0];

  const defaultVideo = topicId === "solar" ? `${BASE}assets/explain-solar.webm` : null;
  const [activeVideo, setActiveVideo] = useState<string | null>(defaultVideo);

  useEffect(() => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role !== "user") return;
    const detected = detectVideo(last.text, topicId);
    if (detected) setActiveVideo(detected);
  }, [messages, topicId]);

  const showVideo = activeVideo !== null;
  const showMic = !showVideo;

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Figma city background */}
      <img src={`${BASE}assets/topic-detail-city-bg.png`} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi (RIGHT) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "67.7%",
          top: "27.5%",
          width: "22.7vw",
          height: "67.9vh",
          background: "radial-gradient(ellipse, rgba(255,253,127,0.88) 0%, rgba(212,232,0,0.55) 35%, transparent 70%)",
          filter: "blur(32px)",
          opacity: 0.85,
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full h-full">

        {/* LEFT: Topic panel */}
        <motion.div
          className="absolute flex flex-col justify-end rounded-2xl overflow-hidden"
          style={{ left: "4%", top: "12%", width: "53.8%", height: "55.1%" }}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7 }}
        >
          <AnimatePresence mode="wait">
            {showVideo ? (
              <motion.video
                key={activeVideo}
                src={activeVideo!}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                autoPlay
                loop
                muted
                playsInline
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              />
            ) : (
              <motion.div
                key="fallback"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4 }}
              >
                {/* Themed gradient background */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: topic.id === "ev"
                      ? "linear-gradient(135deg, #1a2a3a 0%, #2a4a3a 40%, #3a6a50 100%)"
                      : topic.id === "battery"
                      ? "linear-gradient(135deg, #1a2040 0%, #2a3050 40%, #3a4a6a 100%)"
                      : "linear-gradient(135deg, #1a3030 0%, #2a4a40 40%, #3a7a50 100%)",
                  }}
                />
                {/* Large topic icon centered */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-15">
                  <img
                    src={topic.icon}
                    alt=""
                    className="w-[60%] h-[60%] object-contain"
                    style={{ filter: "brightness(0) invert(1)" }}
                  />
                </div>
                {/* Glass overlay at bottom */}
                <div
                  className="absolute bottom-0 left-0 right-0 pointer-events-none"
                  style={{
                    height: "50%",
                    background: "linear-gradient(to top, rgba(10,14,26,0.8) 0%, transparent 100%)",
                  }}
                />
                {/* Title overlay */}
                <div className="absolute bottom-0 left-0 right-0 z-10 p-8">
                  <p className="font-heading text-white/70 text-lg tracking-[0.25em] uppercase mb-2">
                    {topic.titlePrefix}
                  </p>
                  <h1 className="font-heading font-bold text-5xl md:text-6xl tracking-wider energy-gradient-text">
                    {topic.titleMain}
                  </h1>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Play button — below illustration area */}
        {onNext && (
          <motion.div
            className="absolute flex items-center gap-4 z-10"
            style={{ left: "4%", top: "70%" }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            <button
              onClick={onNext}
              className="relative w-16 h-16 bg-gradient-to-br from-energy-green to-energy-yellow rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
            >
              <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[8px] border-y-transparent ml-1" />
            </button>
            <span className="text-white/80 font-medium">Start exploration</span>
          </motion.div>
        )}

        {/* RIGHT: Lumi avatar */}
        <motion.div
          className="absolute bottom-0 flex items-end justify-center"
          style={{ left: "50%", width: "50%", top: 0 }}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <LumiAvatar
            mode={avatar.mode}
            isReady={avatar.isReady}
            isSpeaking={avatar.isSpeaking}
            videoRef={avatar.videoRef}
            videoContainer={avatar.videoContainer}
            videoTrackReady={avatar.videoTrackReady}
            retryPlay={avatar.retryPlay}
            className="h-[85vh] max-h-[820px]"
          />
        </motion.div>

        {/* Mic indicator — hidden when video is playing */}
        {showMic && (
          <motion.div
            className="absolute z-20"
            style={{ left: "14%", top: "63.8%" }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 }}
          >
            <MicIndicator isListening={isListening} variant="badge" />
          </motion.div>
        )}

      </div>

      {/* Chat Log */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <ChatLog messages={messages} />
      </motion.div>

      {/* Back button */}
      <motion.button
        onClick={onBack}
        className="absolute top-8 left-8 z-30 glass-panel px-4 py-2 rounded-lg text-white/80 hover:text-white transition-colors"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        ← Back
      </motion.button>
    </div>
  );
}
