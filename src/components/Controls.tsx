import { Mic, MicOff, PhoneOff, Hand, Camera, CameraOff } from "lucide-react";
import { motion } from "framer-motion";

interface ControlsProps {
    isConnected: boolean;
    isMuted: boolean;
    isCameraOn: boolean;
    onStart: () => void;
    onEnd: () => void;
    onToggleMute: () => void;
    onInterrupt: () => void;
    onToggleCamera: () => void;
}

export const Controls = ({
    isConnected,
    isMuted,
    isCameraOn,
    onStart,
    onEnd,
    onToggleMute,
    onInterrupt,
    onToggleCamera
}: ControlsProps) => {
    return (
        <div className="glass-panel px-4 py-3 sm:px-8 sm:py-4 rounded-2xl neon-border flex items-center space-x-4 sm:space-x-8 transform transition-transform hover:-translate-y-1 duration-300">
            {/* Mute/Start Button */}
            <button
                onClick={!isConnected ? onStart : onToggleMute}
                className="group flex flex-col items-center gap-1 focus:outline-none"
            >
                <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_0_10px_rgba(0,238,255,0.1)] 
                ${!isConnected
                            ? "bg-primary text-background-dark shadow-[0_0_20px_rgba(0,238,255,0.6)]"
                            : isMuted
                                ? "bg-red-500/20 border border-red-500 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                                : "bg-background-dark border border-primary/30 text-primary hover:bg-primary hover:text-background-dark hover:shadow-[0_0_20px_rgba(0,238,255,0.6)]"}`}
                >
                    {isConnected ? (isMuted ? <MicOff size={20} /> : <Mic size={20} />) : <Mic size={24} className="animate-pulse" />}
                </motion.div>
                <span className={`text-[10px] font-mono tracking-wider uppercase ${isMuted ? "text-red-500" : "text-primary/50 group-hover:text-primary"}`}>
                    {!isConnected ? "Start" : (isMuted ? "Unmute" : "Mute")}
                </span>
            </button>

            {/* Interrupt Button */}
            {isConnected && (
                <button
                    onClick={onInterrupt}
                    className="group flex flex-col items-center gap-1 focus:outline-none"
                >
                    <motion.div
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="w-14 h-14 rounded-full bg-primary/10 border border-primary flex items-center justify-center text-primary shadow-[0_0_15px_rgba(0,238,255,0.3)] hover:bg-primary hover:text-background-dark transition-all duration-300"
                    >
                        <Hand size={28} />
                    </motion.div>
                    <span className="text-[10px] font-mono text-primary tracking-wider uppercase font-bold">Interrupt</span>
                </button>
            )}

            {/* Camera Toggle Button */}
            <button
                onClick={onToggleCamera}
                className="group flex flex-col items-center gap-1 focus:outline-none"
            >
                <motion.div
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-[0_0_10px_rgba(0,238,255,0.1)] 
                ${isCameraOn
                            ? "bg-primary/20 border border-primary text-primary shadow-[0_0_15px_rgba(0,238,255,0.4)]"
                            : "bg-background-dark border border-primary/30 text-primary/50 hover:bg-primary/10 hover:text-primary hover:border-primary/50"}`}
                >
                    {isCameraOn ? <Camera size={20} /> : <CameraOff size={20} />}
                </motion.div>
                <span className={`text-[10px] font-mono tracking-wider uppercase ${isCameraOn ? "text-primary" : "text-primary/50 group-hover:text-primary"}`}>
                    {isCameraOn ? "Cam On" : "Cam Off"}
                </span>
            </button>

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
