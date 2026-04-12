import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { MicIndicator } from "../components/MicIndicator";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";

interface SummaryItem {
  category: string;
  value: string;
  description: string;
}

interface SummaryScreenProps {
  avatar: UseAkoolAvatarReturn;
  title: string;
  items: SummaryItem[];
  onComplete?: () => void;
  isListening?: boolean;
}

export function SummaryScreen({ 
  avatar, 
  title, 
  items, 
  onComplete,
  isListening = false 
}: SummaryScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Figma city background */}
      <img src="https://www.figma.com/api/mcp/asset/aa7a1e83-0252-4918-87a3-1e58fdcba520" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi — Figma Ellipse 1: x=1625(42.3%), y=595(27.5%), w=872(22.7%), h=1466(67.9%) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "42.3%",
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

        {/* CENTER: Lumi avatar — centered at ~50% horizontally */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 flex items-end justify-center"
          style={{ top: 0 }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
        >
          <LumiAvatar
            mode={avatar.mode}
            isReady={avatar.isReady}
            isSpeaking={avatar.isSpeaking}
            videoRef={avatar.videoRef}
            className="h-[85vh] max-h-[820px]"
          />
        </motion.div>

        {/* Mic indicator */}
        <motion.div
          className="absolute z-20"
          style={{ left: "44%", top: "63.8%" }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
        >
          <MicIndicator isListening={isListening} variant="badge" />
        </motion.div>

        {/* Summary content overlay — positioned on the right side */}
        <motion.div
          className="absolute flex flex-col"
          style={{ right: "4%", top: "10%", width: "35%" }}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          {/* Title */}
          <motion.h1
            className="font-heading font-bold text-4xl md:text-5xl tracking-wider energy-gradient-text mb-6"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7 }}
          >
            {title}
          </motion.h1>

          {/* Summary items */}
          <div className="space-y-4">
            {items.map((item, index) => (
              <motion.div
                key={index}
                className="glass-panel rounded-2xl p-5"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
              >
                <div className="flex items-start gap-4">
                  <div className="w-3 h-3 bg-energy-green rounded-full mt-2 flex-shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-heading text-white text-lg font-semibold mb-1">
                      {item.category}
                    </h3>
                    <p className="text-energy-green text-xl font-bold mb-1">
                      {item.value}
                    </p>
                    <p className="text-white/70 text-sm">
                      {item.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Complete button */}
          {onComplete && (
            <motion.div
              className="flex items-center gap-4 mt-6"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6, duration: 0.5 }}
            >
              <button
                onClick={onComplete}
                className="relative w-16 h-16 bg-gradient-to-br from-energy-green to-energy-yellow rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110"
              >
                <div className="w-0 h-0 border-l-[12px] border-l-white border-y-[8px] border-y-transparent ml-1" />
              </button>
              <span className="text-white/80 font-medium">Complete Journey</span>
            </motion.div>
          )}
        </motion.div>

      </div>
    </div>
  );
}
