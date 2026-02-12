import { Mic, PhoneOff, Hand } from "lucide-react";
import { motion } from "framer-motion";

interface ControlsProps {
    isConnected: boolean;
    onStart: () => void;
    onEnd: () => void;
    onMute?: () => void;
}

export const Controls = ({ isConnected, onStart, onEnd }: ControlsProps) => {
    return (
        <div className="glass-panel px-8 py-4 rounded-2xl neon-border flex items-center space-x-8 transform transition-transform hover:-translate-y-1 duration-300">
            {/* Mute/Start Button */}
            <button
                onClick={!isConnected ? onStart : undefined}
                className="group flex flex-col items-center gap-1 focus:outline-none"
            >
                <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_0_10px_rgba(0,238,255,0.1)] 
                ${!isConnected
                            ? "bg-primary text-background-dark shadow-[0_0_20px_rgba(0,238,255,0.6)]"
                            : "bg-background-dark border border-primary/30 text-primary hover:bg-primary hover:text-background-dark hover:shadow-[0_0_20px_rgba(0,238,255,0.6)]"}`}
                >
                    {isConnected ? <Mic size={20} /> : <Mic size={24} className="animate-pulse" />}
                </motion.div>
                <span className="text-[10px] font-mono text-primary/50 group-hover:text-primary tracking-wider uppercase">
                    {!isConnected ? "Start" : "Mute"}
                </span>
            </button>

            {/* Interrupt Button */}
            {isConnected && (
                <button className="group flex flex-col items-center gap-1 focus:outline-none cursor-not-allowed opacity-50">
                    <motion.div
                        className="w-14 h-14 rounded-full bg-primary/10 border border-primary flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,238,255,0.3)]"
                    >
                        <Hand size={28} />
                    </motion.div>
                    <span className="text-[10px] font-mono text-primary tracking-wider uppercase font-bold">Interrupt</span>
                </button>
            )}

            {/* End Call Button */}
            <button
                onClick={onEnd}
                disabled={!isConnected}
                className={`group flex flex-col items-center gap-1 focus:outline-none ${!isConnected ? "opacity-30 cursor-not-allowed" : ""}`}
            >
                <motion.div
                    whileHover={isConnected ? { scale: 1.1 } : {}}
                    whileTap={isConnected ? { scale: 0.9 } : {}}
                    className="w-12 h-12 rounded-full bg-background-dark border border-red-500/30 flex items-center justify-center text-red-500 transition-all duration-300 shadow-[0_0_10px_rgba(239,68,68,0.1)] hover:bg-red-500 hover:text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]"
                >
                    <PhoneOff size={20} />
                </motion.div>
                <span className="text-[10px] font-mono text-red-500/50 group-hover:text-red-500 tracking-wider uppercase">End</span>
            </button>
        </div>
    );
};
