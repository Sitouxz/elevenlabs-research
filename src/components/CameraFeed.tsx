import { useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, CameraOff, ScanText, Loader2, Eye } from "lucide-react";
import type { VisionResult } from "../hooks/useVision";

interface CameraFeedProps {
    isCameraOn: boolean;
    isModelLoading: boolean;
    isModelReady: boolean;
    isAnalyzing: boolean;
    isOcrRunning: boolean;
    lastResult: VisionResult | null;
    ocrText: string;
    objectCount: number;
    videoRef: React.RefObject<HTMLVideoElement | null>;
    onToggleCamera: () => void;
    onRequestOcr: () => void;
}

export const CameraFeed = ({
    isCameraOn,
    isModelLoading,
    isModelReady,
    isAnalyzing,
    isOcrRunning,
    lastResult,
    ocrText,
    objectCount,
    videoRef,
    onToggleCamera,
    onRequestOcr,
}: CameraFeedProps) => {
    const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number | null>(null);

    const drawOverlay = useCallback(() => {
        const canvas = overlayCanvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video || !lastResult) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;

        const scaleX = canvas.width / (video.videoWidth || 1);
        const scaleY = canvas.height / (video.videoHeight || 1);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (const det of lastResult.detections) {
            if (det.score < 0.5) continue;

            const [x, y, w, h] = det.bbox;
            const sx = x * scaleX;
            const sy = y * scaleY;
            const sw = w * scaleX;
            const sh = h * scaleY;

            // Bounding box
            ctx.strokeStyle = "rgba(0, 238, 255, 0.8)";
            ctx.lineWidth = 2;
            ctx.strokeRect(sx, sy, sw, sh);

            // Corner accents
            const cornerLen = Math.min(12, sw * 0.2, sh * 0.2);
            ctx.strokeStyle = "#00eeff";
            ctx.lineWidth = 3;

            // Top-left
            ctx.beginPath();
            ctx.moveTo(sx, sy + cornerLen);
            ctx.lineTo(sx, sy);
            ctx.lineTo(sx + cornerLen, sy);
            ctx.stroke();

            // Top-right
            ctx.beginPath();
            ctx.moveTo(sx + sw - cornerLen, sy);
            ctx.lineTo(sx + sw, sy);
            ctx.lineTo(sx + sw, sy + cornerLen);
            ctx.stroke();

            // Bottom-left
            ctx.beginPath();
            ctx.moveTo(sx, sy + sh - cornerLen);
            ctx.lineTo(sx, sy + sh);
            ctx.lineTo(sx + cornerLen, sy + sh);
            ctx.stroke();

            // Bottom-right
            ctx.beginPath();
            ctx.moveTo(sx + sw - cornerLen, sy + sh);
            ctx.lineTo(sx + sw, sy + sh);
            ctx.lineTo(sx + sw, sy + sh - cornerLen);
            ctx.stroke();

            // Label background
            const label = `${det.label} ${Math.round(det.score * 100)}%`;
            ctx.font = "bold 10px 'JetBrains Mono', monospace";
            const textWidth = ctx.measureText(label).width;
            ctx.fillStyle = "rgba(0, 238, 255, 0.15)";
            ctx.fillRect(sx, sy - 18, textWidth + 8, 18);

            // Label border
            ctx.strokeStyle = "rgba(0, 238, 255, 0.4)";
            ctx.lineWidth = 1;
            ctx.strokeRect(sx, sy - 18, textWidth + 8, 18);

            // Label text
            ctx.fillStyle = "#00eeff";
            ctx.fillText(label, sx + 4, sy - 5);
        }
    }, [lastResult, videoRef]);

    useEffect(() => {
        if (!isCameraOn || !lastResult) return;

        const render = () => {
            drawOverlay();
            animFrameRef.current = requestAnimationFrame(render);
        };
        render();

        return () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current);
            }
        };
    }, [isCameraOn, lastResult, drawOverlay]);

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
                    {isCameraOn && (
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    )}
                    <span className="text-[9px] font-mono text-primary/40">
                        {isModelLoading
                            ? "LOADING..."
                            : isModelReady
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
                <canvas
                    ref={overlayCanvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
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

                {/* Loading overlay */}
                <AnimatePresence>
                    {isModelLoading && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center"
                        >
                            <Loader2
                                size={24}
                                className="text-primary animate-spin mb-2"
                            />
                            <span className="text-[10px] font-mono text-primary">
                                Loading ML models...
                            </span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Scan line effect when analyzing */}
                {isAnalyzing && isCameraOn && (
                    <motion.div
                        className="absolute left-0 right-0 h-0.5 bg-primary/60 shadow-[0_0_10px_#00eeff]"
                        animate={{ top: ["0%", "100%", "0%"] }}
                        transition={{
                            duration: 2,
                            repeat: Infinity,
                            ease: "linear",
                        }}
                    />
                )}

                {/* Object count badge */}
                {isCameraOn && objectCount > 0 && (
                    <div className="absolute top-2 right-2 bg-primary/20 border border-primary/40 rounded-full px-2 py-0.5">
                        <span className="text-[9px] font-mono text-primary font-bold">
                            {objectCount} OBJ
                        </span>
                    </div>
                )}
            </div>

            {/* Detection summary */}
            {isCameraOn && lastResult && (
                <div className="px-3 py-2 border-t border-primary/10 max-h-16 overflow-y-auto scrollbar-hide">
                    <p className="text-[10px] font-mono text-gray-400 leading-relaxed">
                        {lastResult.description}
                    </p>
                </div>
            )}

            {/* OCR result */}
            {ocrText && (
                <div className="px-3 py-2 border-t border-primary/10 max-h-12 overflow-y-auto scrollbar-hide">
                    <span className="text-[9px] font-mono text-primary/50 uppercase">
                        OCR:{" "}
                    </span>
                    <span className="text-[10px] font-mono text-gray-300">
                        {ocrText.substring(0, 100)}
                    </span>
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

                {isCameraOn && isModelReady && (
                    <button
                        onClick={onRequestOcr}
                        disabled={isOcrRunning}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider bg-primary/5 border border-primary/20 text-primary/50 hover:text-primary hover:border-primary/40 transition-all duration-300 disabled:opacity-30"
                    >
                        {isOcrRunning ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <ScanText size={12} />
                        )}
                        OCR
                    </button>
                )}
            </div>

            {/* Decorative corners */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-primary opacity-30 group-hover:opacity-70 transition-opacity" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-primary opacity-30 group-hover:opacity-70 transition-opacity" />
        </motion.div>
    );
};
