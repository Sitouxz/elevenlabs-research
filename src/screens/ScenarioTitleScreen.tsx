import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { MicIndicator } from "../components/MicIndicator";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";

interface ScenarioTitleScreenProps {
  avatar: UseAkoolAvatarReturn;
  title: string;
  subtitle: string;
  onStart?: () => void;
  isListening?: boolean;
}

export function ScenarioTitleScreen({ 
  avatar, 
  title, 
  subtitle, 
  onStart,
  isListening = false 
}: ScenarioTitleScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Figma city background */}
      <img src="https://www.figma.com/api/mcp/asset/aa7a1e83-0252-4918-87a3-1e58fdcba520" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi — Figma Ellipse 1: x=492(12.8%), y=590(27.3%), w=800(20.8%), h=1344(62.2%) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "12.8%",
          top: "27.3%",
          width: "20.8vw",
          height: "62.2vh",
          background: "radial-gradient(ellipse, rgba(255,253,127,0.88) 0%, rgba(212,232,0,0.55) 35%, transparent 70%)",
          filter: "blur(32px)",
          opacity: 0.85,
        }}
      />

      {/* Content — absolute positioning to match Figma */}
      <div className="relative z-10 w-full h-full">

        {/* LEFT: Lumi avatar — centered at ~24% horizontally */}
        <motion.div
          className="absolute bottom-0 left-0 flex items-end justify-center"
          style={{ width: "48%", top: 0 }}
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

        {/* Mic indicator */}
        <motion.div
          className="absolute z-20"
          style={{ left: "14%", top: "63.8%" }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          <MicIndicator isListening={isListening} variant="badge" />
        </motion.div>

        {/* RIGHT: Title content — positioned at Figma coordinates */}
        <motion.div
          className="absolute"
          style={{ left: "48.8%", top: "33.4%", width: "48.7%" }}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          {/* Subtitle — Figma: y=920(42.6%) relative to panel top ~33.4% → ~9.2% offset */}
          <motion.p
            className="font-display text-white/90 text-xl leading-relaxed mb-4"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7 }}
          >
            {subtitle}
          </motion.p>

          {/* Title — Figma: y=993(46%) */}
          <motion.h1
            className="font-heading font-bold text-5xl md:text-6xl tracking-wider energy-gradient-text mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.7 }}
          >
            {title}
          </motion.h1>

          {/* Start button */}
          {onStart && (
            <motion.div
              className="flex items-center gap-4"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              <button
                onClick={onStart}
                className="relative w-16 h-16 bg-gradient-to-br from-energy-green to-energy-yellow rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
              >
                <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[8px] border-y-transparent ml-1" />
              </button>
              <span className="text-white/80 font-medium">Begin challenge</span>
            </motion.div>
          )}
        </motion.div>

      </div>
    </div>
  );
}



