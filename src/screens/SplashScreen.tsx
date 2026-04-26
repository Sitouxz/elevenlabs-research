import { motion } from "framer-motion";
import { LumiAvatar } from "../components/LumiAvatar";
import { MicIndicator } from "../components/MicIndicator";
import type { UseAkoolAvatarReturn } from "../hooks/useAkoolAvatar";

const FIGMA_CITY_BG = "/assets/splash-city-bg.png";
const FIGMA_LUMI_IMAGE = "/assets/splash-lumi.png";
const FIGMA_LEAF_TL = "/assets/splash-leaf-tl.png";

interface SplashScreenProps {
  avatar: UseAkoolAvatarReturn;
  isListening: boolean;
  onTap?: () => void;
}

export function SplashScreen({ avatar, isListening, onTap }: SplashScreenProps) {
  return (
    <div className="relative w-full h-full overflow-hidden cursor-pointer" onClick={onTap}>

      {/* Layer 1: City background photo (image 9) */}
      <img
        src={FIGMA_CITY_BG}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />

      {/* Layer 2: Subtle dark overlay to deepen contrast */}
      <div className="absolute inset-0 bg-black/15 pointer-events-none" />

      {/* Layer 3: Top white fade — "Rectangle 60" from Figma (gradient to white at top 35%) */}
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none"
        style={{
          height: "34.9%",
          background: "linear-gradient(to bottom, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.55) 40%, rgba(255,255,255,0) 100%)",
        }}
      />

      {/* Layer 4: Bottom teal-green wave glow — "Mask group / Rectangle 61" */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: "43.5%",
          background: "linear-gradient(to top, rgba(112,167,41,0.72) 0%, rgba(0,159,137,0.45) 45%, rgba(0,159,137,0) 100%)",
          mixBlendMode: "hard-light",
        }}
      />

      {/* Layer 5: Yellow radial glow ellipse behind Lumi (Ellipse 1) */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: "22.7vw",
          height: "67.9vh",
          background: "radial-gradient(ellipse, rgba(255,253,127,0.88) 0%, rgba(212,232,0,0.55) 35%, transparent 70%)",
          left: "50%",
          top: "65%",
          transform: "translate(-50%, -50%)",
          filter: "blur(32px)",
          opacity: 0.85,
        }}
      />

      {/* Decorative leaf — bottom left (image 69 / image 70) */}
      <motion.img
        src={FIGMA_LEAF_TL}
        alt=""
        className="absolute pointer-events-none select-none"
        style={{ left: "0.4%", bottom: "1%", width: "19.8vw", opacity: 0.9 }}
        animate={{ y: [-8, 8, -8], rotate: [-6, 6, -6] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Decorative leaf — top right */}
      <motion.img
        src={FIGMA_LEAF_TL}
        alt=""
        className="absolute pointer-events-none select-none"
        style={{ right: "0.4%", top: "1.1%", width: "11.5vw", opacity: 0.85, transform: "scaleX(-1) rotate(20deg)" }}
        animate={{ y: [-6, 6, -6], rotate: [14, 26, 14] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
      />

      {/* Content: title + avatar + subtitle */}
      <div className="relative z-10 w-full h-full flex flex-col">

        {/* Title block — z-20 to stay above avatar */}
        <motion.div
          className="absolute left-0 right-0 text-center z-20 px-4"
          style={{ top: "7.4vh" }}
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <p
            className="font-heading uppercase tracking-[0.1em] opacity-90 mb-1"
            style={{
              color: "#494949",
              fontSize: "clamp(0.75rem, 2.1vw, 1.75rem)",
            }}
          >
            Meet Lumi, Your Smart
          </p>
          <h1
            className="font-heading font-extrabold tracking-wider leading-none opacity-90"
            style={{
              fontSize: "clamp(2.2rem, 6.5vw, 8rem)",
              backgroundImage: "linear-gradient(93.6deg, #009f89 0.4%, #efcf43 99.6%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              filter: "drop-shadow(0px 4px 20px rgba(140,255,127,0.4)) drop-shadow(0px 2px 20px rgba(0,0,0,0.2))",
            }}
          >
            ENERGY GUIDE
          </h1>
        </motion.div>

        {/* Avatar area — full height, bottom-aligned */}
        <motion.div
          className="absolute inset-0 flex items-end justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          <LumiAvatar
            mode={avatar.mode}
            isReady={avatar.isReady}
            isSpeaking={avatar.isSpeaking}
            videoRef={avatar.videoRef}
            videoContainer={avatar.videoContainer}
            videoTrackReady={avatar.videoTrackReady}
            retryPlay={avatar.retryPlay}
            staticSrc={FIGMA_LUMI_IMAGE}
            className="h-[73vh] max-h-[820px] object-contain"
          />

        </motion.div>

        {/* Mic pulse ring — positioned to match Figma radar group */}
        <div className="absolute z-20" style={{ left: "60.4%", top: "33.6%" }}>
          <MicIndicator isListening={isListening} variant="splash" label="" />
        </div>

        {/* "Speak to start the experience" */}
        <motion.div
          className="absolute text-center w-full z-20"
          style={{ bottom: "8.2vh" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
        >
          <p
            className="italic opacity-90 tracking-widest"
            style={{
              fontFamily: "'Open Sans', sans-serif",
              fontSize: "clamp(0.7rem, 1.67vw, 1.5rem)",
              color: "#fff",
              textShadow: "0px 2px 4px rgba(0,0,0,0.2), 0px 2px 2px rgba(0,0,0,0.12), 0px 2px 4px rgba(0,0,0,0.14)",
            }}
          >
            Speak to start the experience
          </p>
        </motion.div>

      </div>
    </div>
  );
}



