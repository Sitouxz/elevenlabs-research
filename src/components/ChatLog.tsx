import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AvatarMessage as AgentMessage } from "../hooks/useAkoolAvatar";

interface ChatLogProps {
  messages: AgentMessage[];
  className?: string;
}

export function ChatLog({ messages, className = "" }: ChatLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const recent = messages.slice(-3);

  return (
    <div className={`relative w-full ${className}`} style={{ height: "clamp(120px, 18vh, 220px)" }}>

      {/* Dark glass background */}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(to bottom, rgba(10,14,26,0.92) 0%, rgba(10,14,26,0.96) 100%)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      />

      {/* Teal accent line at top */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{
          height: "2px",
          background: "linear-gradient(90deg, #00D4B8 0%, rgba(127,224,64,0.6) 50%, transparent 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 w-full h-full flex flex-col">

        {/* CHAT LOG tab */}
        <div className="flex items-center" style={{ height: "clamp(24px, 3.5vh, 36px)" }}>
          <div
            className="flex items-center gap-2 px-4 h-full"
            style={{
              minWidth: "fit-content",
              background: "linear-gradient(90deg, #7FE040, #D4E800)",
              clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)",
            }}
          >
            {/* Triangle arrow */}
            <div
              style={{
                width: 0,
                height: 0,
                borderTop: "5px solid transparent",
                borderBottom: "5px solid transparent",
                borderLeft: "8px solid #1a1e2e",
              }}
            />
            <span
              className="font-heading font-extrabold"
              style={{
                fontSize: "clamp(0.6rem, 0.85vw, 0.75rem)",
                letterSpacing: "0.15em",
                color: "#1a1e2e",
              }}
            >
              CHAT LOG
            </span>
          </div>
        </div>

        {/* Message area */}
        <div
          className="flex-1 overflow-hidden px-[clamp(12px,2.5vw,48px)] pb-[clamp(4px,0.8vh,12px)] pt-[clamp(2px,0.4vh,6px)]"
          ref={scrollRef}
        >
          <div className="overflow-y-auto h-full space-y-[clamp(4px,0.6vh,8px)] scrollbar-hide">
            <AnimatePresence initial={false}>
              {recent.map((msg, i) => (
                <motion.div
                  key={msg.timestamp + i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <p
                    className="leading-relaxed"
                    style={{
                      fontFamily: "'Open Sans', sans-serif",
                      fontSize: "clamp(0.72rem, 1.05vw, 1rem)",
                      color: msg.role === "ai" ? "rgba(255,255,255,0.82)" : "#00D4B8",
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.role === "user" && <span style={{ color: "#7FE040", marginRight: 6 }}>●</span>}
                    {msg.text}
                  </p>
                </motion.div>
              ))}
            </AnimatePresence>

            {recent.length === 0 && (
              <p
                style={{
                  fontFamily: "'Open Sans', sans-serif",
                  fontSize: "clamp(0.72rem, 1.05vw, 1rem)",
                  color: "rgba(255,255,255,0.3)",
                }}
              >
                Waiting for conversation...
              </p>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

