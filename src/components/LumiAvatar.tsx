import { motion } from "framer-motion";
import type { AvatarMode } from "../hooks/useAkoolAvatar";

const DEFAULT_LUMI_STATIC = "https://www.figma.com/api/mcp/asset/6f7c3d2d-42d2-43b8-ac9a-66aeb2ce7ad4";

interface LumiAvatarProps {
  mode: AvatarMode;
  isReady: boolean;
  isSpeaking: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  className?: string;
  staticSrc?: string;
}

export function LumiAvatar({ mode, isReady, isSpeaking, videoRef, className = "", staticSrc }: LumiAvatarProps) {
  return (
    <div className={`relative flex items-end justify-center ${className}`}>
      {/* Speaking glow halo */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-full pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-energy-green/20 blur-3xl lumi-speaking-glow" />
        </div>
      )}

      {mode === "streaming" && isReady ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={false}
          className="relative z-10 h-full w-auto object-contain drop-shadow-2xl"
          style={{ maxHeight: "100%", maxWidth: "100%" }}
        />
      ) : (
        <motion.img
          src={staticSrc || DEFAULT_LUMI_STATIC}
          alt="Lumi AI Avatar"
          className="relative z-10 h-full w-auto object-contain drop-shadow-2xl select-none"
          style={{ maxHeight: "100%", maxWidth: "100%" }}
          animate={isSpeaking ? { scale: [1, 1.01, 1] } : { scale: 1 }}
          transition={{ duration: 0.6, repeat: isSpeaking ? Infinity : 0, ease: "easeInOut" }}
          onError={(e) => {
            (e.target as HTMLImageElement).src = "/lumi-static.svg";
          }}
        />
      )}
    </div>
  );
}
