import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { ChatLog } from "../components/ChatLog";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";
import type { AvatarMessage as AgentMessage } from "../hooks/useAkoolAvatar";
import type { AppScreen } from "../types";

const FIGMA_CITY_BG      = "/assets/menu-city-bg.png";
const FIGMA_LUMI         = "/assets/menu-lumi.png";

interface MainMenuScreenProps {
  avatar: UseAkoolAvatarReturn;
  messages: AgentMessage[];
  activeButton: AppScreen | null;
  onNavigate: (screen: AppScreen) => void;
}

export function MainMenuScreen({ avatar, messages, onNavigate }: MainMenuScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* Figma city background (image 9) with blur */}
      <img
        src={FIGMA_CITY_BG}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }}
      />
      {/* Dark overlay rgba(0,0,0,0.4) */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "19.3%",
          top: "27.9%",
          width: "22.7vw",
          height: "67.9vh",
          background: "radial-gradient(ellipse, rgba(255,253,127,0.88) 0%, rgba(212,232,0,0.55) 35%, transparent 70%)",
          filter: "blur(32px)",
          opacity: 0.85,
        }}
      />

      {/* Content — absolute positioning to match Figma overlay layout */}
      <div className="relative z-10 w-full h-full">

        {/* Lumi avatar — centered at ~30.6% horizontally, extends to bottom */}
        <motion.div
          className="absolute bottom-0 left-0 flex items-end justify-center"
          style={{ width: "61%", top: 0 }}
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
            staticSrc={FIGMA_LUMI}
            className="h-[78vh] max-h-[820px] object-contain"
          />
        </motion.div>

        {/* START DISCOVERY button */}
        <motion.button
          onClick={() => onNavigate("topic-select")}
          className="absolute z-10 flex flex-col items-center justify-center rounded-2xl border-2 border-white/40 hover:border-energy-green/80 transition-all duration-300"
          style={{
            left: "48.6%",
            top: "28.8%",
            width: "18.9%",
            height: "25.5%",
            background: "rgba(20, 25, 40, 0.6)",
            backdropFilter: "blur(16px)",
            cursor: "pointer",
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(127,224,64,0.3)" }}
          whileTap={{ scale: 0.96 }}
        >
          {/* Magnify icon */}
          <svg width="clamp(36px,5vw,72px)" height="clamp(36px,5vw,72px)" viewBox="0 0 64 64" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-90">
            <circle cx="28" cy="28" r="16" />
            <line x1="40" y1="40" x2="54" y2="54" />
          </svg>
          <span
            className="font-heading font-extrabold text-center text-white tracking-widest leading-tight opacity-90"
            style={{
              fontSize: "clamp(0.55rem, 1.25vw, 1rem)",
              textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            START<br />DISCOVERY
          </span>
          {/* Corner accents */}
          <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white/50 rounded-tl" />
          <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white/50 rounded-tr" />
          <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white/50 rounded-bl" />
          <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white/50 rounded-br" />
        </motion.button>

        {/* ASK QUESTIONS button */}
        <motion.button
          onClick={() => onNavigate("ask-questions")}
          className="absolute z-10 flex flex-col items-center justify-center rounded-2xl border-2 border-white/40 hover:border-energy-green/80 transition-all duration-300"
          style={{
            left: "70.5%",
            top: "28.8%",
            width: "18.9%",
            height: "25.5%",
            background: "rgba(20, 25, 40, 0.6)",
            backdropFilter: "blur(16px)",
            cursor: "pointer",
          }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          whileHover={{ scale: 1.05, boxShadow: "0 0 30px rgba(127,224,64,0.3)" }}
          whileTap={{ scale: 0.96 }}
        >
          {/* Question icon */}
          <svg width="clamp(36px,5vw,72px)" height="clamp(36px,5vw,72px)" viewBox="0 0 64 64" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mb-3 opacity-90">
            <path d="M24 22C24 18 28 14 34 14C40 14 44 18 44 22C44 28 36 28 36 34" />
            <circle cx="36" cy="42" r="2" fill="white" />
            <path d="M18 48C12 44 8 38 8 30C8 18 18 8 32 8C46 8 56 18 56 30C56 42 46 52 32 52" />
          </svg>
          <span
            className="font-heading font-extrabold text-center text-white tracking-widest leading-tight opacity-90"
            style={{
              fontSize: "clamp(0.55rem, 1.25vw, 1rem)",
              textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            ASK<br />QUESTIONS
          </span>
          {/* Corner accents */}
          <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-white/50 rounded-tl" />
          <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-white/50 rounded-tr" />
          <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-white/50 rounded-bl" />
          <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-white/50 rounded-br" />
        </motion.button>

      </div>

      {/* Chat Log — full-width bottom strip */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <ChatLog messages={messages} />
      </motion.div>

    </div>
  );
}



