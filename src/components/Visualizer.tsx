import { motion } from "framer-motion";
import { useEffect, useState, useRef } from "react";

interface VisualizerProps {
  isSpeaking: boolean;
  isListening: boolean;
  audioStream?: MediaStream | null;
}

export const Visualizer = ({ isSpeaking, isListening, audioStream }: VisualizerProps) => {
  const [audioLevel, setAudioLevel] = useState(0);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioStream) {
      setAudioLevel(0);
      return;
    }

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analyzer = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioStream);

    source.connect(analyzer);
    analyzer.fftSize = 256;
    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    analyzerRef.current = analyzer;
    dataArrayRef.current = dataArray;

    const updateLevel = () => {
      if (!analyzerRef.current || !dataArrayRef.current) return;

      // @ts-ignore
      analyzerRef.current.getByteFrequencyData(dataArrayRef.current);

      // Calculate average volume
      const sum = dataArrayRef.current.reduce((a, b) => a + b, 0);
      const average = sum / dataArrayRef.current.length;

      // Normalize level between 0 and 1
      setAudioLevel(average / 128);

      animationFrameRef.current = requestAnimationFrame(updateLevel);
    };

    updateLevel();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      audioContext.close();
    };
  }, [audioStream]);

  // If not providing a real stream yet, use dummy pulse when speaking
  const activeLevel = audioLevel || (isSpeaking ? 0.4 + Math.sin(Date.now() / 200) * 0.2 : 0);

  return (
    <div className="relative w-80 h-80 md:w-96 md:h-96 flex items-center justify-center">
      {/* Outer Ring */}
      <motion.div
        className="absolute inset-0 border border-primary/20 rounded-full border-dashed"
        animate={{ rotate: 360 }}
        transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
      />

      {/* Middle Ring */}
      <motion.div
        className="absolute inset-8 border border-primary/30 rounded-full border-t-transparent border-l-transparent"
        animate={{ rotate: -360 }}
        transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
      />

      {/* Inner Ring */}
      <div className="absolute inset-16 border-2 border-primary/10 rounded-full" />

      {/* Core Glow */}
      <motion.div
        className="absolute inset-0 rounded-full orb-core"
        animate={{
          scale: isSpeaking ? 1.05 + activeLevel * 0.2 : 1,
          opacity: isSpeaking ? 0.8 + activeLevel * 0.5 : 0.6
        }}
        transition={{ duration: 0.1 }}
      />

      {/* Waveform Visualization */}
      <div className="relative z-10 flex items-center justify-center space-x-1 h-32">
        {[...Array(5)].map((_, i) => (
          <motion.div
            key={i}
            className="w-1.5 bg-primary rounded-full shadow-[0_0_10px_#00eeff]"
            animate={{
              height: isSpeaking ? [20, 60 + activeLevel * 100, 20] : (isListening ? [10, 30, 10] : 8)
            }}
            transition={{
              duration: 0.5 + i * 0.1,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>

      {/* Floating Particles */}
      <motion.div
        className="absolute inset-0 w-full h-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
      >
        <div className="absolute top-0 left-1/2 w-1 h-1 bg-primary rounded-full shadow-[0_0_5px_#00eeff]" />
        <div className="absolute bottom-10 right-10 w-1.5 h-1.5 bg-primary/50 rounded-full" />
      </motion.div>
    </div>
  );
};
