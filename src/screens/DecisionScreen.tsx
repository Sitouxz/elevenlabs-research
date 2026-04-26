import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { ChatLog } from "../components/ChatLog";
import { MicIndicator } from "../components/MicIndicator";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";
import type { AvatarMessage as AgentMessage } from "../hooks/useAkoolAvatar";

interface DecisionScreenProps {
  avatar: UseAkoolAvatarReturn;
  messages: AgentMessage[];
  isListening: boolean;
  question: string;
  options: string[];
  onSelectOption: (option: string) => void;
  onBack?: () => void;
}

export function DecisionScreen({ 
  avatar, 
  messages, 
  isListening, 
  question, 
  options, 
  onSelectOption,
  onBack 
}: DecisionScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* Figma city background */}
      <img src="/assets/menu-city-bg.png" alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" style={{ filter: "blur(10px) brightness(0.8)", transform: "scale(1.05)" }} />
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Glow ellipse behind Lumi — Figma Ellipse 1: x=507(13.2%), y=595(27.5%), w=872(22.7%), h=1466(67.9%) */}
      <div
        className="absolute pointer-events-none"
        style={{
          left: "13.2%",
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

        {/* LEFT: Lumi avatar — centered at ~25% horizontally */}
        <motion.div
          className="absolute bottom-0 left-0 flex items-end justify-center"
          style={{ width: "50%", top: 0 }}
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

        {/* RIGHT: Decision content — positioned at Figma coordinates */}
        <motion.div
          className="absolute"
          style={{ left: "40.6%", top: "20%", width: "53.3%" }}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <h2 className="font-heading text-white text-2xl md:text-3xl font-bold leading-tight mb-6">
            {question}
          </h2>
          <div className="grid grid-cols-2 gap-x-[4vw] gap-y-[3vh]">
          {options.slice(0, 4).map((option, index) => {
            const letter = String.fromCharCode(65 + index);
            return (
              <motion.button
                key={index}
                onClick={() => onSelectOption(option)}
                className="flex items-center gap-4 glass-panel rounded-xl p-4 text-white/90 hover:text-white hover:bg-white/10 transition-all duration-300 border border-white/20 hover:border-white/40"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                {/* Letter badge */}
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-energy-green to-energy-yellow flex items-center justify-center">
                  <span className="font-heading font-bold text-black text-lg">{letter}</span>
                </div>
                <span className="font-medium text-lg text-left">{option}</span>
              </motion.button>
            );
          })}
          </div>
        </motion.div>

        {/* "Select the options below" — Figma: x=2213(57.6%), y=1381(63.9%) */}
        <motion.p
          className="absolute text-white/60 text-sm"
          style={{ left: "57.6%", top: "63.9%" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Select the options below
        </motion.p>

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



