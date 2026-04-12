import { motion } from "framer-motion";
import type { Topic } from "../types";

interface TopicOrbProps {
  topic: Topic;
  selected?: boolean;
  onClick: () => void;
  delay?: number;
}

const FALLBACK_ICONS: Record<string, string> = {
  solar: "☀️",
  ev: "🚗",
  battery: "🔋",
  ai: "🤖",
};

export function TopicOrb({ topic, selected = false, onClick, delay = 0 }: TopicOrbProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-4 cursor-pointer"
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: "backOut" }}
      onClick={onClick}
    >
      {/* Orb */}
      <motion.div
        className={`topic-orb w-28 h-28 flex items-center justify-center ${selected ? "selected" : ""}`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        animate={selected ? { boxShadow: "0 0 40px rgba(127,224,64,0.7)" } : {}}
      >
        {/* Radar rings */}
        <div className="absolute inset-0 rounded-full border border-white/20" style={{ animation: "radar 2.5s linear infinite" }} />
        <div className="absolute inset-0 rounded-full border border-white/10" style={{ animation: "radar 2.5s linear infinite 0.8s" }} />

        {/* Icon */}
        <img
          src={topic.icon}
          alt={topic.label}
          className="w-14 h-14 object-contain relative z-10"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = "none";
            const parent = target.parentElement;
            if (parent) {
              const span = document.createElement("span");
              span.textContent = FALLBACK_ICONS[topic.id] || "⚡";
              span.style.fontSize = "2.5rem";
              span.style.position = "relative";
              span.style.zIndex = "10";
              parent.appendChild(span);
            }
          }}
        />
      </motion.div>

      {/* Label */}
      <div className="text-center">
        <p className="font-heading text-white font-bold text-xs tracking-widest leading-tight">
          {topic.label}
        </p>
        <p className="font-heading text-white font-bold text-xs tracking-widest leading-tight">
          {topic.sublabel}
        </p>
      </div>
    </motion.div>
  );
}
