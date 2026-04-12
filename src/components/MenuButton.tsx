import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface MenuButtonProps {
  icon: ReactNode;
  label: string;
  sublabel?: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
}

export function MenuButton({ icon, label, sublabel, active = false, onClick, className = "" }: MenuButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      className={`relative flex flex-col items-center justify-center gap-3 cursor-pointer select-none rounded-xl transition-all duration-300 ${className}`}
      style={{
        width: "clamp(140px, 18vw, 220px)",
        height: "clamp(140px, 18vw, 220px)",
        background: active
          ? "linear-gradient(135deg, rgba(0,159,137,0.85) 0%, rgba(212,232,0,0.85) 100%)"
          : "rgba(30, 35, 55, 0.55)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: active ? "2px solid rgba(0,212,184,0.9)" : "2px solid rgba(255,255,255,0.65)",
        boxShadow: active
          ? "0 0 32px rgba(0,212,184,0.5), 0 0 64px rgba(0,159,137,0.25), inset 0 2px 2px rgba(255,255,255,0.5), inset 0 -2px 4px rgba(0,0,0,0.25)"
          : "inset 0 2px 2px rgba(255,255,255,0.12), inset 0 -2px 4px rgba(0,0,0,0.25)",
      }}
    >
      {/* Corner tick marks — top-left */}
      <span
        className="absolute"
        style={{
          top: "-6px", left: "-6px",
          width: "18px", height: "18px",
          borderTop: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
          borderLeft: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
        }}
      />
      {/* top-right */}
      <span
        className="absolute"
        style={{
          top: "-6px", right: "-6px",
          width: "18px", height: "18px",
          borderTop: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
          borderRight: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
        }}
      />
      {/* bottom-left */}
      <span
        className="absolute"
        style={{
          bottom: "-6px", left: "-6px",
          width: "18px", height: "18px",
          borderBottom: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
          borderLeft: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
        }}
      />
      {/* bottom-right */}
      <span
        className="absolute"
        style={{
          bottom: "-6px", right: "-6px",
          width: "18px", height: "18px",
          borderBottom: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
          borderRight: `3px solid ${active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.9)"}`,
        }}
      />

      {/* Icon */}
      <div className="text-white opacity-90" style={{ fontSize: "clamp(1.8rem, 3.5vw, 3rem)" }}>
        {icon}
      </div>

      {/* Label */}
      <div className="text-center leading-tight">
        <p
          className="font-heading font-extrabold tracking-widest text-white"
          style={{
            fontSize: "clamp(0.6rem, 1.35vw, 1.1rem)",
            textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          {label}
        </p>
        {sublabel && (
          <p
            className="font-heading font-extrabold tracking-widest text-white"
            style={{
              fontSize: "clamp(0.6rem, 1.35vw, 1.1rem)",
              textShadow: "0px 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            {sublabel}
          </p>
        )}
      </div>
    </motion.button>
  );
}
