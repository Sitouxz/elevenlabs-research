import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, Loader2, Eye, AlertCircle } from "lucide-react";
import type { VisionResult } from "../hooks/useVision";

interface CameraFeedProps {
    isCameraOn: boolean;
    isAnalyzing: boolean;
    isReady: boolean;
    lastResult: VisionResult | null;
    error: string;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onToggleCamera: () => void;
}

export const CameraFeed = ({
    isCameraOn,
    isAnalyzing,
    isReady,
    lastResult,
    error,
    videoRef,
    onToggleCamera,
}: CameraFeedProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glass-panel rounded-xl overflow-hidden relative group"
            style={{ width: 280 }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-primary/10">
                <div className="flex items-center gap-2">
                    <Eye size={12} className="text-primary" />
                    <span className="text-[10px] font-mono text-primary/70 uppercase tracking-wider">
                        Vision Feed
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    {isCameraOn && isReady && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    )}
                    <span className="text-[9px] font-mono text-primary/40">
                        {!isReady
                            ? "NO API KEY"
                            : isCameraOn
                              ? "ACTIVE"
                              : "STANDBY"}
                    </span>
                </div>
            </div>

            {/* Video container */}
            <div className="relative aspect-[4/3] bg-black/50">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${isCameraOn ? "opacity-100" : "opacity-0"}`}
                />

                {/* Inactive state */}
                {!isCameraOn && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <CameraOff
                            size={32}
                            className="text-primary/20 mb-2"
                        />
                        <span className="text-[10px] font-mono text-primary/30 uppercase">
                            Camera Off
                        </span>
                    </div>
                )}

                {/* Scan line effect when analyzing */}
                <AnimatePresence>
                    {isAnalyzing && isCameraOn && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute left-0 right-0 h-0.5 bg-primary/60 shadow-[0_0_10px_#00eeff]"
                            style={{ top: "50%" }}
                        >
                            <motion.div
                                className="absolute left-0 right-0 h-0.5 bg-primary/60 shadow-[0_0_10px_#00eeff]"
                                animate={{ top: ["-200px", "200px"] }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    ease: "linear",
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Gemini badge */}
                {isCameraOn && (
                    <div className="absolute top-2 right-2 bg-primary/20 border border-primary/40 rounded-full px-2 py-0.5">
                        <span className="text-[9px] font-mono text-primary font-bold">
                            {isAnalyzing ? "ANALYZING..." : "GEMINI"}
                        </span>
                    </div>
                )}
            </div>

            {/* Description from Gemini */}
            {isCameraOn && lastResult && (
                <div className="px-3 py-2 border-t border-primary/10 max-h-24 overflow-y-auto scrollbar-hide">
                    <p className="text-[10px] font-mono text-gray-400 leading-relaxed">
                        {lastResult.description}
                    </p>
                    <span className="text-[8px] font-mono text-primary/30 mt-1 block">
                        {new Date(lastResult.timestamp).toLocaleTimeString()}
                    </span>
                </div>
            )}

            {/* Error display */}
            {error && (
                <div className="px-3 py-2 border-t border-red-500/20">
                    <div className="flex items-center gap-1">
                        <AlertCircle size={10} className="text-red-400" />
                        <span className="text-[9px] font-mono text-red-400">
                            {error}
                        </span>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-2 px-3 py-2 border-t border-primary/10">
                <button
                    onClick={onToggleCamera}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all duration-300 ${
                        isCameraOn
                            ? "bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20"
                            : "bg-primary/5 border border-primary/20 text-primary/50 hover:text-primary hover:border-primary/40"
                    }`}
                >
                    {isCameraOn ? (
                        <Camera size={12} />
                    ) : (
                        <CameraOff size={12} />
                    )}
                    {isCameraOn ? "On" : "Off"}
                </button>

                {isCameraOn && isAnalyzing && (
                    <Loader2 size={14} className="text-primary animate-spin" />
                )}
            </div>

            {/* Decorative corners */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-primary opacity-30 group-hover:opacity-70 transition-opacity" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-primary opacity-30 group-hover:opacity-70 transition-opacity" />
        </motion.div>
    );
};
