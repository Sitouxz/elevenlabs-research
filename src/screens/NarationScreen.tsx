import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { MicIndicator } from "../components/MicIndicator";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";

interface NarationScreenProps {
  avatar: UseAkoolAvatarReturn;
  narration: string;
  onNext?: () => void;
  isListening?: boolean;
  autoAdvance?: boolean;
}

export function NarationScreen({ 
  avatar, 
  narration, 
  onNext,
  isListening = false,
  autoAdvance = false 
}: NarationScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Figma city background */}
      <img src="https://www.figma.com/api/mcp/asset/aa7a1e83-0252-4918-87a3-1e58fdcba520" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi — Figma Ellipse 1: x=370(9.6%), y=639(29.6%), w=872(22.7%), h=1466(67.9%) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "9.6%",
          top: "29.6%",
          width: "22.7vw",
          height: "67.9vh",
          background: "radial-gradient(ellipse, rgba(255,253,127,0.88) 0%, rgba(212,232,0,0.55) 35%, transparent 70%)",
          filter: "blur(32px)",
          opacity: 0.85,
        }}
      />

      {/* Content — absolute positioning to match Figma */}
      <div className="relative z-10 w-full h-full">

        {/* LEFT: Lumi avatar — centered at ~21% horizontally */}
        <motion.div
          className="absolute bottom-0 left-0 flex items-end justify-center"
          style={{ width: "42%", top: 0 }}
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

        {/* RIGHT: Narration content — Figma: content starts at ~50% from left */}
        <motion.div
          className="absolute flex flex-col justify-center"
          style={{ left: "50%", top: "6%", width: "46%", height: "70%" }}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          {/* Narration text */}
          <motion.div
            className="glass-panel rounded-lg p-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7 }}
          >
            <p className="text-white/90 text-xl leading-relaxed">
              {narration}
            </p>
          </motion.div>

          {/* Continue indicator */}
          {onNext && !autoAdvance && (
            <motion.div
              className="flex items-center gap-4 justify-center mt-8"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <button
                onClick={onNext}
                className="relative w-12 h-12 bg-gradient-to-br from-energy-green to-energy-yellow rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
              >
                <div className="w-0 h-0 border-l-[8px] border-l-white border-y-[6px] border-y-transparent ml-1" />
              </button>
              <span className="text-white/60 text-sm">Continue</span>
            </motion.div>
          )}

          {/* Auto-advance indicator */}
          {autoAdvance && (
            <motion.div
              className="flex items-center gap-4 justify-center mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <div className="w-2 h-2 bg-energy-green rounded-full animate-pulse" />
              <span className="text-white/60 text-sm">Continuing automatically...</span>
            </motion.div>
          )}
        </motion.div>

      </div>
    </div>
  );
}



