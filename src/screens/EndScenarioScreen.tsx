import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { ChatLog } from "../components/ChatLog";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";
import type { AgentMessage } from "../hooks/useElevenLabsAgent";

const FIGMA_CITY_BG   = "https://www.figma.com/api/mcp/asset/7a68b531-6ff0-470c-8e18-13165d0da2e9";
const FIGMA_LUMI      = "https://www.figma.com/api/mcp/asset/b511859d-f8ad-4860-8663-33fbbfab42fa";

const FIGMA_VECTOR4   = "https://www.figma.com/api/mcp/asset/cccdb064-c502-46f2-b9dd-4c13699f4996";

interface EndScenarioScreenProps {
  avatar: UseAkoolAvatarReturn;
  title: string;
  message: string;
  messages?: AgentMessage[];
  onRestart?: () => void;
  onMainMenu?: () => void;
  isListening?: boolean;
}

export function EndScenarioScreen({ 
  avatar, 
  title: _title, 
  message,
  messages = [],
  onRestart: _onRestart,
  onMainMenu,
}: EndScenarioScreenProps) {

  const displayMessages = messages.length > 0
    ? messages
    : [{ role: "ai" as const, text: message, timestamp: Date.now() }];

  return (
    <div className="relative w-full h-full overflow-hidden">

      {/* Figma city background (image 9) with blur */}
      <img
        src={FIGMA_CITY_BG}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }}
      />
      {/* Dark overlay matching Figma rgba(0,0,0,0.4) */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi — Figma Ellipse 1: x=1563(40.7%), y=591(27.4%), w=872(22.7%), h=1466(67.9%) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "40.7%",
          top: "27.4%",
          width: "22.7vw",
          height: "67.9vh",
          background: "radial-gradient(ellipse, rgba(255,253,127,0.88) 0%, rgba(212,232,0,0.55) 35%, transparent 70%)",
          filter: "blur(32px)",
          opacity: 0.85,
        }}
      />

      {/* Lumi — centered, pinned to bottom above chatlog */}
      <motion.div
        className="absolute z-10 flex items-end justify-center"
        style={{ left: "50%", transform: "translateX(-50%)", bottom: "clamp(140px,22vh,260px)" }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        <LumiAvatar
          mode={avatar.mode}
          isReady={avatar.isReady}
          isSpeaking={avatar.isSpeaking}
          videoRef={avatar.videoRef}
          staticSrc={FIGMA_LUMI}
          className="object-contain h-[72vh] max-h-[820px]"
        />
      </motion.div>

      {/* START GAME button — bottom right, uses Figma Vector 4 as frame */}
      {onMainMenu && (
        <motion.button
          onClick={onMainMenu}
          className="absolute z-30 flex items-center justify-center"
          style={{
            bottom: "clamp(130px, 20vh, 200px)",
            right: "clamp(16px, 3vw, 80px)",
            cursor: "pointer",
            background: "none",
            border: "none",
            padding: 0,
          }}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.96 }}
        >
          {/* Figma Vector 4 — the button outline frame */}
          <img
            src={FIGMA_VECTOR4}
            alt=""
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ objectFit: "fill" }}
          />
          <span
            className="relative font-heading font-extrabold text-white tracking-widest"
            style={{
              padding: "clamp(8px,1.5vh,18px) clamp(16px,2.5vw,56px)",
              fontSize: "clamp(0.6rem, 1.3vw, 1.05rem)",
              textShadow: "0px 2px 4px rgba(0,0,0,0.2), 0px 2px 2px rgba(0,0,0,0.12)",
            }}
          >
            START GAME
          </span>
        </motion.button>
      )}

      {/* Chat Log — bottom strip */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 z-20"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <ChatLog messages={displayMessages} />
      </motion.div>

    </div>
  );
}
