import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useState, type KeyboardEvent } from "react";
import {
    Sparkles,
    Send,
    ImageIcon,
    Film,
    History,
    Trash2,
    Play,
} from "lucide-react";
import type {
    ImageHistoryItem,
    MediaType,
} from "../hooks/useImageGeneration";

interface ImageStudioProps {
    history: ImageHistoryItem[];
    activeCount: number;
    imageModel: string;
    videoModel: string;
    onGenerate: (prompt: string, mediaType: MediaType) => void;
    onReopen: (item: ImageHistoryItem) => void;
    onClearHistory: () => void;
}

export const ImageStudio = ({
    history,
    activeCount,
    imageModel,
    videoModel,
    onGenerate,
    onReopen,
    onClearHistory,
}: ImageStudioProps) => {
    const [prompt, setPrompt] = useState("");
    const [isExpanded, setIsExpanded] = useState(true);
    const [mediaType, setMediaType] = useState<MediaType>("image");

    const submit = useCallback(() => {
        const trimmed = prompt.trim();
        if (!trimmed) return;
        onGenerate(trimmed, mediaType);
        setPrompt("");
    }, [prompt, mediaType, onGenerate]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter submits, Shift+Enter inserts a newline
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
        }
    };

    const activeModel = mediaType === "video" ? videoModel : imageModel;
    const modelShort = activeModel.split("/").pop() || activeModel;
    const isVideoMode = mediaType === "video";

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-panel rounded-xl w-80 group relative pointer-events-auto"
        >
            {/* Header */}
            <button
                onClick={() => setIsExpanded((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 border-b border-primary/10 hover:bg-primary/5 transition-colors rounded-t-xl"
            >
                <div className="flex items-center gap-2">
                    <Sparkles
                        size={14}
                        className="text-primary animate-pulse"
                    />
                    <h2 className="text-xs font-mono font-bold tracking-widest text-primary/80">
                        MEDIA STUDIO
                    </h2>
                    {activeCount > 0 && (
                        <span className="text-[9px] font-mono text-primary bg-primary/10 border border-primary/30 rounded px-1.5 py-0.5">
                            {activeCount} OPEN
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    <span className="text-[9px] font-mono text-primary/40">
                        {isExpanded ? "READY" : "MIN"}
                    </span>
                </div>
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        key="body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                    >
                        {/* Prompt input */}
                        <div className="p-4 space-y-3">
                            {/* Image / Video segmented toggle */}
                            <div className="flex bg-background-dark/60 border border-primary/20 rounded-lg p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setMediaType("image")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all ${
                                        !isVideoMode
                                            ? "bg-primary/15 text-primary shadow-[0_0_10px_rgba(0,238,255,0.3)]"
                                            : "text-primary/40 hover:text-primary/70"
                                    }`}
                                >
                                    <ImageIcon size={11} />
                                    Image
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMediaType("video")}
                                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-wider transition-all ${
                                        isVideoMode
                                            ? "bg-primary/15 text-primary shadow-[0_0_10px_rgba(0,238,255,0.3)]"
                                            : "text-primary/40 hover:text-primary/70"
                                    }`}
                                >
                                    <Film size={11} />
                                    Video
                                </button>
                            </div>

                            <div className="relative">
                                <textarea
                                    value={prompt}
                                    onChange={(e) =>
                                        setPrompt(e.target.value)
                                    }
                                    onKeyDown={handleKeyDown}
                                    placeholder={
                                        isVideoMode
                                            ? "Describe a video to generate…"
                                            : "Describe an image to generate…"
                                    }
                                    rows={3}
                                    className="w-full bg-background-dark/60 border border-primary/20 focus:border-primary/60 focus:shadow-[0_0_15px_rgba(0,238,255,0.2)] rounded-lg px-3 py-2 text-sm text-gray-100 font-light placeholder-primary/30 resize-none outline-none transition-all"
                                />
                                <div className="absolute bottom-2 right-2 text-[8px] font-mono text-primary/30 pointer-events-none">
                                    ⏎ to send
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                    {isVideoMode ? (
                                        <Film
                                            size={10}
                                            className="text-primary/40 flex-shrink-0"
                                        />
                                    ) : (
                                        <ImageIcon
                                            size={10}
                                            className="text-primary/40 flex-shrink-0"
                                        />
                                    )}
                                    <span className="text-[9px] font-mono text-primary/40 uppercase truncate">
                                        {modelShort}
                                    </span>
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.04 }}
                                    whileTap={{ scale: 0.96 }}
                                    onClick={submit}
                                    disabled={!prompt.trim()}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-wider transition-all ${
                                        prompt.trim()
                                            ? "bg-primary text-background-dark shadow-[0_0_15px_rgba(0,238,255,0.5)] hover:shadow-[0_0_22px_rgba(0,238,255,0.7)]"
                                            : "bg-primary/5 border border-primary/20 text-primary/30 cursor-not-allowed"
                                    }`}
                                >
                                    <Send size={11} />
                                    {isVideoMode ? "Render" : "Generate"}
                                </motion.button>
                            </div>
                        </div>

                        {/* History strip */}
                        <div className="border-t border-primary/10 px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5">
                                    <History
                                        size={10}
                                        className="text-primary/50"
                                    />
                                    <span className="text-[9px] font-mono text-primary/50 uppercase tracking-wider">
                                        History
                                    </span>
                                    {history.length > 0 && (
                                        <span className="text-[9px] font-mono text-primary/30">
                                            ({history.length})
                                        </span>
                                    )}
                                </div>
                                {history.length > 0 && (
                                    <button
                                        onClick={onClearHistory}
                                        title="Clear history"
                                        className="text-primary/30 hover:text-red-400 transition-colors"
                                    >
                                        <Trash2 size={10} />
                                    </button>
                                )}
                            </div>

                            {history.length === 0 ? (
                                <div className="text-[10px] font-mono text-primary/20 italic py-2 text-center">
                                    Nothing generated yet
                                </div>
                            ) : (
                                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1 -mx-1 px-1">
                                    {history.map((item) => {
                                        const itemIsVideo =
                                            item.mediaType === "video";
                                        return (
                                            <motion.button
                                                key={item.id}
                                                initial={{
                                                    opacity: 0,
                                                    scale: 0.8,
                                                }}
                                                animate={{
                                                    opacity: 1,
                                                    scale: 1,
                                                }}
                                                whileHover={{ scale: 1.05 }}
                                                onClick={() => onReopen(item)}
                                                title={item.prompt}
                                                className="relative flex-shrink-0 w-14 h-14 rounded-md overflow-hidden border border-primary/20 hover:border-primary hover:shadow-[0_0_12px_rgba(0,238,255,0.5)] transition-all group/thumb"
                                            >
                                                {itemIsVideo ? (
                                                    <video
                                                        src={item.imageUrl}
                                                        className="w-full h-full object-cover"
                                                        muted
                                                        autoPlay
                                                        loop
                                                        playsInline
                                                    />
                                                ) : (
                                                    <img
                                                        src={item.imageUrl}
                                                        alt={item.prompt}
                                                        className="w-full h-full object-cover"
                                                        draggable={false}
                                                    />
                                                )}
                                                {itemIsVideo && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover/thumb:bg-black/10 transition-colors">
                                                        <Play
                                                            size={14}
                                                            className="text-primary drop-shadow-[0_0_4px_#00eeff]"
                                                            fill="currentColor"
                                                        />
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
                                            </motion.button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Decorative corners (match SystemMonitor) */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-primary opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-primary opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none" />
        </motion.div>
    );
};
