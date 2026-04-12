import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AgentMessage } from "../hooks/useElevenLabsAgent";

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

  const recent = messages.slice(-6);

  return (
    <div className={`relative w-full ${className}`} style={{ height: "clamp(80px, 12vh, 140px)" }}>

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
              background: "linear-gradient(90deg, #7FE040, #D4E800)",
              clipPath: "polygon(0 0, 100% 0, 92% 100%, 0 100%)",
              minWidth: "clamp(100px, 12vw, 200px)",
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
                fontSize: "clamp(0.45rem, 0.8vw, 0.7rem)",
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
          className="flex-1 overflow-hidden px-[clamp(10px,2vw,48px)] pb-[clamp(2px,0.5vh,8px)]"
          ref={scrollRef}
        >
          <div className="overflow-y-auto h-full space-y-[2px] scrollbar-hide">
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
                    className="leading-snug"
                    style={{
                      fontFamily: "'Open Sans', sans-serif",
                      fontSize: "clamp(0.55rem, 0.9vw, 0.85rem)",
                      color: msg.role === "ai" ? "rgba(255,255,255,0.7)" : "#00D4B8",
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
                  fontSize: "clamp(0.55rem, 0.9vw, 0.85rem)",
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
