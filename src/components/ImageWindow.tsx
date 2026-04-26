import { motion, useDragControls, type PanInfo } from "framer-motion";
import { useRef } from "react";
import {
    X,
    Loader2,
    Download,
    Copy,
    AlertCircle,
    Sparkles,
    GripVertical,
} from "lucide-react";
import type { ImageWindow as ImageWindowType } from "../hooks/useImageGeneration";

interface ImageWindowProps {
    window: ImageWindowType;
    onClose: (id: string) => void;
    onFocus: (id: string) => void;
    onPositionChange: (
        id: string,
        position: { x: number; y: number }
    ) => void;
}

const WINDOW_WIDTH = 512;

export const ImageWindow = ({
    window: w,
    onClose,
    onFocus,
    onPositionChange,
}: ImageWindowProps) => {
    const dragControls = useDragControls();
    const startPosRef = useRef(w.position);

    const handleDragStart = () => {
        startPosRef.current = w.position;
        onFocus(w.id);
    };

    const handleDragEnd = (
        _e: MouseEvent | TouchEvent | PointerEvent,
        info: PanInfo
    ) => {
        onPositionChange(w.id, {
            x: startPosRef.current.x + info.offset.x,
            y: startPosRef.current.y + info.offset.y,
        });
    };

    const handleDownload = async () => {
        if (!w.imageUrl) return;
        try {
            const res = await fetch(w.imageUrl);
            const blob = await res.blob();
            const objUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = objUrl;
            a.download = `jarvis-${w.id.slice(0, 8)}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(objUrl);
        } catch (err) {
            console.error("Download failed:", err);
        }
    };

    const handleCopyUrl = async () => {
        if (!w.imageUrl) return;
        try {
            await navigator.clipboard.writeText(w.imageUrl);
        } catch (err) {
            console.error("Copy failed:", err);
        }
    };

    const truncatedPrompt =
        w.prompt.length > 60 ? `${w.prompt.slice(0, 60)}…` : w.prompt;

    return (
        <motion.div
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            initial={{
                opacity: 0,
                scale: 0.85,
                x: w.position.x,
                y: w.position.y,
            }}
            animate={{
                opacity: 1,
                scale: 1,
                x: w.position.x,
                y: w.position.y,
            }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
            transition={{
                type: "spring",
                damping: 22,
                stiffness: 240,
                opacity: { duration: 0.18 },
            }}
            onMouseDown={() => onFocus(w.id)}
            style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: WINDOW_WIDTH,
                zIndex: w.zIndex,
            }}
            className="glass-panel rounded-xl overflow-hidden neon-border shadow-[0_20px_60px_rgba(0,0,0,0.6)] pointer-events-auto"
        >
            {/* Title bar (drag handle) */}
            <div
                onPointerDown={(e) => dragControls.start(e)}
                className="flex items-center justify-between px-3 py-2 border-b border-primary/20 bg-background-dark/60 cursor-grab active:cursor-grabbing select-none"
            >
                <div className="flex items-center gap-2 min-w-0">
                    <GripVertical
                        size={12}
                        className="text-primary/40 flex-shrink-0"
                    />
                    <Sparkles
                        size={12}
                        className="text-primary flex-shrink-0"
                    />
                    <span className="text-[10px] font-mono text-primary/80 uppercase tracking-wider truncate">
                        {truncatedPrompt}
                    </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {w.status === "succeeded" && w.imageUrl && (
                        <>
                            <button
                                onClick={handleCopyUrl}
                                title="Copy image URL"
                                className="w-6 h-6 rounded flex items-center justify-center text-primary/60 hover:text-primary hover:bg-primary/10 transition"
                            >
                                <Copy size={12} />
                            </button>
                            <button
                                onClick={handleDownload}
                                title="Download image"
                                className="w-6 h-6 rounded flex items-center justify-center text-primary/60 hover:text-primary hover:bg-primary/10 transition"
                            >
                                <Download size={12} />
                            </button>
                        </>
                    )}
                    <button
                        onClick={() => onClose(w.id)}
                        title="Close"
                        className="w-6 h-6 rounded flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition ml-1"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="relative aspect-square bg-black/70 overflow-hidden">
                {/* Loading state */}
                {w.status === "loading" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {/* Animated grid */}
                        <div className="absolute inset-0 bg-grid opacity-30" />

                        {/* Scan line */}
                        <motion.div
                            className="absolute left-0 right-0 h-0.5 bg-primary shadow-[0_0_20px_#00eeff]"
                            animate={{ top: ["0%", "100%", "0%"] }}
                            transition={{
                                duration: 2.4,
                                repeat: Infinity,
                                ease: "linear",
                            }}
                        />

                        {/* Pulsing core */}
                        <motion.div
                            className="relative z-10 w-20 h-20 rounded-full orb-core flex items-center justify-center"
                            animate={{
                                scale: [1, 1.15, 1],
                                opacity: [0.7, 1, 0.7],
                            }}
                            transition={{
                                duration: 1.6,
                                repeat: Infinity,
                                ease: "easeInOut",
                            }}
                        >
                            <Loader2
                                size={36}
                                className="text-primary animate-spin"
                            />
                        </motion.div>

                        {/* Caption */}
                        <div className="relative z-10 mt-6 text-center px-6">
                            <p className="text-[10px] font-mono text-primary tracking-[0.3em] uppercase animate-pulse">
                                Generating
                            </p>
                            <p className="text-xs font-mono text-primary/40 mt-1">
                                via Replicate
                            </p>
                            <p className="text-sm text-gray-300 font-light mt-3 leading-relaxed line-clamp-3">
                                "{w.prompt}"
                            </p>
                        </div>
                    </div>
                )}

                {/* Success state */}
                {w.status === "succeeded" && w.imageUrl && (
                    <motion.img
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.4 }}
                        src={w.imageUrl}
                        alt={w.prompt}
                        className="w-full h-full object-cover"
                        draggable={false}
                    />
                )}

                {/* Failure state */}
                {(w.status === "failed" || w.status === "canceled") && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                        <div className="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/40 flex items-center justify-center mb-3">
                            <AlertCircle
                                size={26}
                                className="text-red-400"
                            />
                        </div>
                        <p className="text-[10px] font-mono text-red-400 uppercase tracking-wider mb-2">
                            {w.status === "canceled"
                                ? "Canceled"
                                : "Generation Failed"}
                        </p>
                        <p className="text-xs font-mono text-red-400/60 max-w-sm break-words">
                            {w.error || "Unknown error"}
                        </p>
                    </div>
                )}
            </div>

            {/* Footer / status bar */}
            <div className="flex items-center justify-between px-3 py-1.5 border-t border-primary/20 bg-background-dark/60 text-[9px] font-mono">
                <span
                    className={
                        w.status === "loading"
                            ? "text-primary/60"
                            : w.status === "succeeded"
                              ? "text-green-400/80"
                              : "text-red-400/80"
                    }
                >
                    {w.status === "loading"
                        ? "PROCESSING…"
                        : w.status === "succeeded"
                          ? "READY"
                          : w.status.toUpperCase()}
                </span>
                <span className="text-primary/30">
                    {new Date(w.createdAt).toLocaleTimeString()}
                </span>
            </div>

            {/* Decorative corners */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-primary opacity-50 pointer-events-none" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-primary opacity-50 pointer-events-none" />
        </motion.div>
    );
};
