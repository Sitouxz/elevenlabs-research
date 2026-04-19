import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { ChatLog } from "../components/ChatLog";
import { TopicOrb } from "../components/TopicOrb";
import { MicIndicator } from "../components/MicIndicator";
import { TOPICS } from "../types";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";
import type { AvatarMessage as AgentMessage } from "../hooks/useAkoolAvatar";
import type { TopicId } from "../types";

interface TopicSelectScreenProps {
  avatar: UseAkoolAvatarReturn;
  messages: AgentMessage[];
  isListening: boolean;
  onSelectTopic: (id: TopicId) => void;
  onBack?: () => void;
}

export function TopicSelectScreen({ avatar, messages, isListening, onSelectTopic, onBack }: TopicSelectScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Figma city background */}
      <img src="https://www.figma.com/api/mcp/asset/aa7a1e83-0252-4918-87a3-1e58fdcba520" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi — Figma Ellipse 1: x=423(11%), y=594(27.5%), w=872(22.7%), h=1466(67.9%) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "11%",
          top: "27.5%",
          width: "22.7vw",
          height: "67.9vh",
          background: "radial-gradient(ellipse, rgba(255,253,127,0.88) 0%, rgba(212,232,0,0.55) 35%, transparent 70%)",
          filter: "blur(32px)",
          opacity: 0.85,
        }}
      />

      {/* Content — absolute positioning to match Figma */}
      <div className="relative z-10 w-full h-full">

        {/* Lumi avatar — centered at ~23% horizontally */}
        <motion.div
          className="absolute bottom-0 left-0 flex items-end justify-center"
          style={{ width: "46%", top: 0 }}
          initial={{ opacity: 0, x: -40 }}
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

        {/* Mic badge — Figma: x=539(14%), y=1378(63.8%) */}
        <motion.div
          className="absolute z-20"
          style={{ left: "14%", top: "63.8%" }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          <MicIndicator isListening={isListening} variant="badge" />
        </motion.div>

        {/* Topic orbs — absolute positions from Figma Discovery option frame */}
        {/* SOLAR ENERGY — Figma: x=1469(38.3%), y=534(24.7%) */}
        <motion.div
          className="absolute"
          style={{ left: "38.3%", top: "24.7%" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0 }}
        >
          <TopicOrb
            topic={TOPICS[0]}
            onClick={() => onSelectTopic(TOPICS[0].id)}
            delay={0}
          />
        </motion.div>

        {/* EV CHARGING — Figma: x=2041(53.2%), y=823(38.1%) */}
        <motion.div
          className="absolute"
          style={{ left: "53.2%", top: "38.1%" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <TopicOrb
            topic={TOPICS[1]}
            onClick={() => onSelectTopic(TOPICS[1].id)}
            delay={0.1}
          />
        </motion.div>

        {/* BATTERY STORAGE — Figma: x=2613(68%), y=534(24.7%) */}
        <motion.div
          className="absolute"
          style={{ left: "68%", top: "24.7%" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <TopicOrb
            topic={TOPICS[2]}
            onClick={() => onSelectTopic(TOPICS[2].id)}
            delay={0.2}
          />
        </motion.div>

        {/* AI IN ENERGY — Figma: x=3185(82.9%), y=823(38.1%) */}
        <motion.div
          className="absolute"
          style={{ left: "82.9%", top: "38.1%" }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <TopicOrb
            topic={TOPICS[3]}
            onClick={() => onSelectTopic(TOPICS[3].id)}
            delay={0.3}
          />
        </motion.div>

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
      {onBack && (
        <motion.button
          onClick={onBack}
          className="absolute top-8 left-8 z-30 glass-panel px-4 py-2 rounded-lg text-white/80 hover:text-white transition-colors"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          ← Back
        </motion.button>
      )}
    </div>
  );
}



