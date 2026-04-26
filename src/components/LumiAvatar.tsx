import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { AvatarMode } from "../hooks/useAkoolAvatar";

const DEFAULT_LUMI_STATIC = "/assets/menu-lumi.png";

// Pixels where R,G,B all above this AND saturation is low are keyed out
const WHITE_THRESHOLD = 225;
// Feather range above threshold (higher = softer edge)
const FEATHER_RANGE = 25;
// Temporal smoothing: how much to blend new alpha with previous (0=no smoothing, 1=full smoothing)
const ALPHA_SMOOTH = 0.55;

interface LumiAvatarProps {
  mode: AvatarMode;
  isReady: boolean;
  isSpeaking: boolean;
  videoTrackReady: boolean;
  videoRef: React.Ref<HTMLDivElement>;
  videoContainer: HTMLDivElement | null;
  retryPlay: () => void;
  className?: string;
  staticSrc?: string;
}

export function LumiAvatar({ mode, isReady, isSpeaking, videoTrackReady, videoRef, videoContainer, retryPlay, className = "", staticSrc }: LumiAvatarProps) {
  const hasCalledRetry = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Call retryPlay whenever the container mounts OR the video track becomes ready
  useEffect(() => {
    if (mode === "streaming" && isReady && videoTrackReady && videoContainer) {
      hasCalledRetry.current = true;
      retryPlay();
    }
  }, [mode, isReady, videoTrackReady, retryPlay, videoContainer]);

  // Canvas chroma-key loop: hides Agora video, draws keyed frames onto canvas
  useEffect(() => {
    if (mode !== "streaming" || !isReady) return;
    if (!videoContainer) return;

    let video: HTMLVideoElement | null = null;
    let observer: MutationObserver | null = null;

    const startLoop = (v: HTMLVideoElement) => {
      video = v;
      // Hide the original video element
      v.style.display = "none";

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      let prevAlpha: Uint8ClampedArray | null = null;

      const draw = () => {
        if (!video || video.readyState < 2) {
          rafRef.current = requestAnimationFrame(draw);
          return;
        }
        const vw = video.videoWidth || 1080;
        const vh = video.videoHeight || 1920;
        // Show top 72% of video height to include head + full shoulders
        const cropH = Math.floor(vh * 0.72);
        const cropW = vw;
        if (canvas.width !== cropW || canvas.height !== cropH) {
          canvas.width = cropW;
          canvas.height = cropH;
          prevAlpha = null;
        }
        ctx.clearRect(0, 0, cropW, cropH);
        ctx.drawImage(video, 0, 0, cropW, cropH, 0, 0, cropW, cropH);
        const frame = ctx.getImageData(0, 0, cropW, cropH);
        const d = frame.data;
        const pixelCount = cropW * cropH;
        if (!prevAlpha || prevAlpha.length !== pixelCount) {
          prevAlpha = new Uint8ClampedArray(pixelCount).fill(255);
        }
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const minC = Math.min(r, g, b);
          const maxC = Math.max(r, g, b);
          const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
          const pi = i >> 2;
          let targetAlpha: number;
          // Key out: bright AND low-saturation (white/grey/offwhite background)
          if (minC > WHITE_THRESHOLD && saturation < 0.2) {
            const excess = minC - WHITE_THRESHOLD;
            targetAlpha = Math.max(0, 255 - Math.round((excess / FEATHER_RANGE) * 255));
          } else {
            targetAlpha = 255;
          }
          // Temporal smoothing: blend toward target to kill flicker
          const smoothed = Math.round(prevAlpha[pi] * ALPHA_SMOOTH + targetAlpha * (1 - ALPHA_SMOOTH));
          d[i + 3] = smoothed;
          prevAlpha[pi] = smoothed;
        }
        ctx.putImageData(frame, 0, 0);
        rafRef.current = requestAnimationFrame(draw);
      };
      rafRef.current = requestAnimationFrame(draw);
    };

    const tryAttach = () => {
      const v = videoContainer.querySelector("video") as HTMLVideoElement | null;
      if (v && v !== video) startLoop(v);
    };

    observer = new MutationObserver(tryAttach);
    observer.observe(videoContainer, { childList: true, subtree: true });
    tryAttach();

    return () => {
      observer?.disconnect();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      video = null;
    };
  }, [mode, isReady, videoContainer]);

  return (
    <div className={`relative flex items-end justify-center ${className}`}>
      {/* Speaking glow halo */}
      {isSpeaking && (
        <div className="absolute inset-0 rounded-full pointer-events-none">
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-48 h-48 rounded-full bg-energy-green/20 blur-3xl lumi-speaking-glow" />
        </div>
      )}

      {mode === "streaming" && isReady ? (
        <div
          className="relative z-10"
          style={{
            height: "100%",
            width: "auto",
            maxHeight: "100%",
            minWidth: "160px",
            background: "transparent",
            border: "none",
            outline: "none",
          }}
        >
          {/* Hidden Agora video container — positioned off-screen so video can play */}
          <div
            ref={videoRef}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              opacity: 0,
              pointerEvents: "none",
              zIndex: -1
            }}
          />
          {/* Chroma-keyed canvas output */}
          <canvas
            ref={canvasRef}
            style={{
              display: "block",
              height: "100%",
              width: "auto",
              maxHeight: "100%",
              background: "transparent",
              position: "relative",
              zIndex: 2,
            }}
          />
        </div>
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
