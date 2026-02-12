import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface Message {
    role: string;
    text: string;
}

interface TranscriptProps {
    messages: Message[];
}

export const Transcript = ({ messages }: TranscriptProps) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    return (
        <div className="glass-panel w-full rounded-tl-xl rounded-tr-xl md:rounded-xl p-5 relative overflow-hidden flex flex-col min-h-[250px] border-b-0 md:border-b">
            {/* Fade out gradient at top */}
            <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-background-dark/90 to-transparent z-10 pointer-events-none" />

            {/* Header */}
            <div className="absolute top-0 right-0 p-3 z-20">
                <div className="text-[10px] font-mono text-primary/40 border border-primary/20 px-2 py-0.5 rounded uppercase">
                    Transcript
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="space-y-4 relative z-0 mt-8 overflow-y-auto max-h-[200px] scrollbar-hide flex-grow pb-4"
            >
                <AnimatePresence>
                    {messages.length === 0 && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 0.4 }}
                            className="flex flex-col items-start"
                        >
                            <div className="flex items-center gap-2 mb-1">
                                <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
                                <span className="text-[10px] font-mono text-primary/70 uppercase">Jarvis</span>
                            </div>
                            <p className="text-sm text-gray-300 font-light leading-relaxed pl-3.5 border-l border-primary/10">
                                System initialized. I am ready to process your request.
                            </p>
                        </motion.div>
                    )}
                    {messages.map((msg, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: i === messages.length - 1 ? 1 : 0.6, y: 0 }}
                            className={cn(
                                "flex flex-col",
                                msg.role === "ai" ? "items-start" : "items-end"
                            )}
                        >
                            <div className="flex items-center gap-2 mb-1">
                                {msg.role === "ai" && (
                                    <span className={cn(
                                        "w-1.5 h-1.5 bg-primary rounded-full",
                                        i === messages.length - 1 && "shadow-[0_0_5px_#00eeff]"
                                    )} />
                                )}
                                <span className={cn(
                                    "text-[10px] font-mono uppercase",
                                    msg.role === "ai" ? "text-primary" : "text-white"
                                )}>
                                    {msg.role === "ai" ? "Jarvis" : "You"}
                                </span>
                            </div>
                            <p
                                className={cn(
                                    "text-sm font-light leading-relaxed px-3.5",
                                    msg.role === "ai"
                                        ? "text-gray-100 border-l border-primary/20 ml-0.5"
                                        : "text-white border-r border-white/20 text-right mr-0.5",
                                    i === messages.length - 1 && msg.role === "ai" && "border-l-2 border-primary font-normal"
                                )}
                            >
                                {msg.text}
                            </p>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </div>
    );
};
