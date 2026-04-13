import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { ChatLog } from "../components/ChatLog";
import { MicIndicator } from "../components/MicIndicator";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";
import type { AvatarMessage as AgentMessage } from "../hooks/useAkoolAvatar";

interface AskQuestionsScreenProps {
  avatar: UseAkoolAvatarReturn;
  messages: AgentMessage[];
  isListening: boolean;
  isSpeaking: boolean;
  onBack: () => void;
}

export function AskQuestionsScreen({ avatar, messages, isListening, isSpeaking, onBack }: AskQuestionsScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Figma city background */}
      <img src="https://www.figma.com/api/mcp/asset/aa7a1e83-0252-4918-87a3-1e58fdcba520" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Back button */}
      <motion.button
        className="absolute top-6 left-6 z-30 glass-panel px-4 py-2 rounded-lg font-heading text-xs tracking-widest text-white/80 hover:text-white border border-white/30 hover:border-white/60 transition-colors"
        onClick={onBack}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
      >
        ← BACK
      </motion.button>

      {/* Title */}
      <motion.div
        className="absolute top-8 left-1/2 -translate-x-1/2 z-20 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        <p className="font-heading text-white/70 text-sm tracking-[0.3em] uppercase mb-1">
          Ask Me Anything About
        </p>
        <h1 className="font-heading font-bold text-4xl tracking-wider energy-gradient-text">
          SMART ENERGY
        </h1>
      </motion.div>

      {/* Content */}
      <div className="relative z-10 w-full h-full flex">
        {/* Avatar */}
        <motion.div
          className="w-[45%] h-full flex items-end justify-center pb-32 relative"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
        >
          <LumiAvatar
            mode={avatar.mode}
            isReady={avatar.isReady}
            isSpeaking={isSpeaking}
            videoRef={avatar.videoRef}
            videoContainer={avatar.videoContainer}
            videoTrackReady={avatar.videoTrackReady}
            retryPlay={avatar.retryPlay}
            className="h-[85vh] max-h-[820px]"
          />

          {/* Mic badge */}
          <div className="absolute bottom-28 left-1/2 -translate-x-1/2">
            <MicIndicator
              isListening={isListening}
              label={isSpeaking ? "Lumi is speaking..." : "Ask your question"}
              variant="badge"
            />
          </div>
        </motion.div>

        {/* Right: Status panel */}
        <div className="flex-1 flex flex-col items-center justify-center pr-10 gap-6">
          <motion.div
            className="glass-panel rounded-2xl p-6 w-64 text-center border border-white/20"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center border-2 ${isListening ? "border-energy-green bg-energy-green/10 mic-pulse" : "border-white/30 bg-white/5"}`}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isListening ? "text-energy-green" : "text-white/50"}>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
              </svg>
            </div>
            <p className="font-heading text-xs tracking-widest text-white/60 uppercase mb-1">Status</p>
            <p className={`font-heading text-sm font-bold tracking-wide ${isSpeaking ? "text-energy-yellow" : isListening ? "text-energy-green" : "text-white/40"}`}>
              {isSpeaking ? "LUMI SPEAKING" : isListening ? "LISTENING..." : "READY"}
            </p>
          </motion.div>

          <p className="font-display text-white/40 text-xs text-center max-w-[200px] leading-relaxed">
            Ask any question about smart energy, solar power, EV charging, or AI in energy.
          </p>
        </div>
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
    </div>
  );
}



