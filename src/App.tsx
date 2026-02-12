import { Visualizer } from "./components/Visualizer";
import { Controls } from "./components/Controls";
import { Transcript } from "./components/Transcript";
import { useElevenLabs } from "./hooks/useElevenLabs";
import { Activity, ShieldCheck } from "lucide-react";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "PASTE_YOUR_AGENT_ID_HERE";

function App() {
  const {
    isConnected,
    isSpeaking,
    isListening,
    isMuted,
    messages,
    stream,
    startConversation,
    endConversation,
    toggleMute,
    interrupt
  } = useElevenLabs(AGENT_ID);

  return (
    <div className="bg-midnight font-display text-gray-200 h-screen w-full overflow-hidden relative selection:bg-primary selection:text-black">
      {/* Background Grid Texture */}
      <div className="absolute inset-0 bg-grid pointer-events-none z-0"></div>

      {/* Ambient Glow Spots */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Main Container */}
      <div className="relative z-10 h-full flex flex-col justify-between p-6 md:p-10">
        {/* Top Header Area */}
        <header className="flex justify-between items-start">
          {/* System Monitor Widget */}
          <div className="glass-panel p-4 rounded-xl w-72 transition-all hover:border-primary/40 group relative">
            <div className="flex items-center space-x-2 mb-3 border-b border-primary/10 pb-2">
              <Activity className="text-primary animate-pulse" size={16} />
              <h2 className="text-xs font-mono font-bold tracking-widest text-primary/80">SYSTEM MONITOR</h2>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">STATUS</span>
                <span className={`font-bold flex items-center gap-1 ${isConnected ? "text-green-400" : "text-yellow-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`}></span>
                  {isConnected ? "ONLINE" : "STANDBY"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">LATENCY</span>
                <span className="text-primary">{isConnected ? "24ms" : "--"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">VOICE_ID</span>
                <span className="text-gray-300">JARVIS_V2</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-400">CPU LOAD</span>
                <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary shadow-[0_0_10px_rgba(0,238,255,0.8)] transition-all duration-500"
                    style={{ width: isConnected ? "45%" : "12%" }}
                  />
                </div>
              </div>
            </div>
            {/* Decorative corners */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t border-l border-primary opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b border-r border-primary opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>

          {/* Top Right: Connection Indicator */}
          <div className="glass-panel px-4 py-2 rounded-full flex items-center space-x-3">
            <div className="flex space-x-1 items-end h-4">
              <div className={`w-1 bg-primary/80 h-2 rounded-sm ${isConnected ? "animate-pulse" : ""}`} />
              <div className={`w-1 bg-primary/80 h-3 rounded-sm ${isConnected ? "animate-pulse" : ""}`} style={{ animationDelay: "0.1s" }} />
              <div className={`w-1 bg-primary/80 h-4 rounded-sm ${isConnected ? "animate-pulse" : ""}`} style={{ animationDelay: "0.2s" }} />
            </div>
            <span className="text-xs font-mono text-primary tracking-wider flex items-center gap-2">
              <ShieldCheck size={12} />
              {isConnected ? "SECURE CONNECTION" : "ENCRYPTED"}
            </span>
          </div>
        </header>

        {/* Center Stage: The AI Visualizer */}
        <main className="flex-grow flex flex-col items-center justify-center relative">
          <Visualizer
            isSpeaking={isSpeaking}
            isListening={isListening}
            audioStream={stream}
          />

          {/* AI Status Text */}
          <div className="mt-8 text-center">
            <h1 className="text-3xl md:text-4xl font-light tracking-tight text-white neon-text mb-2">JARVIS</h1>
            <p className="text-primary/60 font-mono text-sm tracking-[0.3em] uppercase animate-pulse">
              {isConnected ? (isSpeaking ? "Speaking..." : (isListening ? "Listening..." : "Processing...")) : "Ready"}
            </p>
          </div>
        </main>

        {/* Bottom Interface Layer */}
        <footer className="relative flex flex-col md:flex-row items-end justify-between w-full">
          {/* Space for layout balance */}
          <div className="hidden md:block w-1/4"></div>

          {/* Center Control Dock */}
          <div className="w-full md:w-auto flex justify-center mb-6 md:mb-0">
            <Controls
              isConnected={isConnected}
              isMuted={isMuted}
              onStart={startConversation}
              onEnd={endConversation}
              onToggleMute={toggleMute}
              onInterrupt={interrupt}
            />
          </div>

          {/* Right Transcript Panel */}
          <div className="w-full md:w-[30%] lg:w-1/4 flex justify-end">
            <Transcript messages={messages} />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
