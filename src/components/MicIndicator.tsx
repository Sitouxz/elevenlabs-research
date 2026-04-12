import { motion, AnimatePresence } from "framer-motion";

interface MicIndicatorProps {
  isListening: boolean;
  label?: string;
  variant?: "badge" | "splash";
}

export function MicIndicator({ isListening, label = "Speak to answer", variant = "badge" }: MicIndicatorProps) {
  if (variant === "splash") {
    return (
      <div className="flex flex-col items-center gap-3">
        {/* Ripple rings */}
        <div className="relative flex items-center justify-center w-20 h-20">
          <AnimatePresence>
            {isListening && (
              <>
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full border-2 border-white/50"
                    initial={{ width: 40, height: 40, opacity: 0.8 }}
                    animate={{ width: 80 + i * 24, height: 80 + i * 24, opacity: 0 }}
                    transition={{ duration: 1.8, delay: i * 0.4, repeat: Infinity, ease: "easeOut" }}
                  />
                ))}
              </>
            )}
          </AnimatePresence>
          {/* Mic icon */}
          <div className={`relative z-10 w-12 h-12 rounded-full flex items-center justify-center ${isListening ? "bg-white/20 mic-pulse" : "bg-white/10"}`}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <line x1="8" y1="23" x2="16" y2="23" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
        <p className="text-white/80 text-base font-display italic tracking-wide">
          {isListening ? "Speak to start the experience" : "Tap to continue"}
        </p>
      </div>
    );
  }

  return (
    <motion.div
      className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border border-white/30"
      animate={isListening ? { opacity: [0.7, 1, 0.7] } : { opacity: 0.5 }}
      transition={{ duration: 1.5, repeat: Infinity }}
    >
      <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isListening ? "bg-energy-green/30 mic-pulse" : "bg-white/10"}`}>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="white">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/>
        </svg>
      </div>
      <span className="font-display text-white/80 text-xs tracking-wide italic">{label}</span>
    </motion.div>
  );
}
