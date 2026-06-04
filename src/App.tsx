import { useCallback, useEffect, useRef, useState } from "react";
import { Visualizer } from "./components/Visualizer";
import { Controls } from "./components/Controls";
import { Transcript } from "./components/Transcript";
import { CameraFeed } from "./components/CameraFeed";
import { ImageStudio } from "./components/ImageStudio";
import { ImageWindowManager } from "./components/ImageWindowManager";
import { useElevenLabs } from "./hooks/useElevenLabs";
import { useCamera } from "./hooks/useCamera";
import { useVision } from "./hooks/useVision";
import { useImageGeneration } from "./hooks/useImageGeneration";
import { Activity, ShieldCheck, Eye } from "lucide-react";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "PASTE_YOUR_AGENT_ID_HERE";

function App() {
  const camera = useCamera();
  const vision = useVision();
  // visionUpdateRef no longer needed for on-demand vision
  const isSpeakingRef = useRef(false);
  const processedMsgCountRef = useRef(0);
  const [hasSentFirstScan, setHasSentFirstScan] = useState(false);

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
    interrupt,
    sendContextualUpdate,
    registerClientTools,
  } = useElevenLabs(AGENT_ID);

  const imageGen = useImageGeneration();

  // Register the generate_image client tool ONCE at mount. The handler reads
  // the latest imageGen.generate from a ref so we don't need to re-register
  // (which would be a no-op anyway since startConversation snapshots tools).
  const generateRef = useRef(imageGen.generate);
  useEffect(() => {
    generateRef.current = imageGen.generate;
  }, [imageGen.generate]);


  const visionRef = useRef(vision);
  useEffect(() => {
    visionRef.current = vision;
  }, [vision]);
  useEffect(() => {
    registerClientTools({
      generate_image: ({ prompt }) => {
        console.log("[JARVIS tool] generate_image invoked with:", prompt);
        const promptStr = typeof prompt === "string" ? prompt.trim() : "";
        if (!promptStr) {
          return "I need a description of the image you'd like me to create.";
        }
        generateRef.current(promptStr, "image");
        return `Generating an image of ${promptStr}. It will appear on screen in a moment.`;
      },
      generate_video: ({ prompt }) => {
        console.log("[JARVIS tool] generate_video invoked with:", prompt);
        const promptStr = typeof prompt === "string" ? prompt.trim() : "";
        if (!promptStr) {
          return "I need a description of the video you'd like me to create.";
        }
        generateRef.current(promptStr, "video");
        return `Rendering a video of ${promptStr}. This usually takes 30 to 60 seconds — it will appear on screen when ready.`;
      },
      scan_camera: async () => {
        console.log("[JARVIS tool] scan_camera invoked");
        if (!camera.isCameraOn) {
          return "The camera is currently off. Ask the user to turn on the camera first, then try again.";
        }
        if (!camera.videoRef.current) {
          return "Camera not available right now.";
        }
        const result = await visionRef.current.analyzeOnce(camera.videoRef.current);
        if (!result) {
          return "I couldn't scan the camera frame. Please try again.";
        }
        return `Here is what the camera sees right now: ${result.description}`;
      },
    });
    console.log(
      "[JARVIS] Client tools registered: generate_image, generate_video, scan_camera. " +
      "NOTE: For voice triggers to work, all tools must ALSO be declared " +
      "on the agent dashboard. See README for instructions."
    );
  }, [registerClientTools, camera]);

  // Keep isSpeakingRef in sync for use inside callbacks
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Reset first-scan flag when disconnected
  useEffect(() => {
    if (!isConnected) {
      setHasSentFirstScan(false);
      processedMsgCountRef.current = 0;
    }
  }, [isConnected]);

  // Send system prompt about vision capability when connected. Vision is
  // triggered by the agent calling the scan_camera client tool (declared on
  // the ElevenLabs dashboard) whenever the user asks about the camera/screen.
  useEffect(() => {
    if (isConnected && !hasSentFirstScan) {
      sendContextualUpdate(
        `[SYSTEM] You have live camera vision. You CAN see through the user's camera. ` +
        `Whenever the user asks what's on their screen, what you can see, or to look at ` +
        `something, call the scan_camera tool to capture and read the current frame, then ` +
        `answer from its result. Never say you don't have access to the camera.`
      );
      setHasSentFirstScan(true);
      console.log("Vision capability notification sent to JARVIS.");
    }
  }, [isConnected, hasSentFirstScan, sendContextualUpdate]);

  const handleToggleCamera = useCallback(async () => {
    await camera.toggleCamera();
  }, [camera]);

  return (
    <div className="bg-midnight font-display text-gray-200 min-h-screen md:h-screen w-full overflow-x-hidden overflow-y-auto md:overflow-hidden relative selection:bg-primary selection:text-black">
      {/* Background Grid Texture */}
      <div className="absolute inset-0 bg-grid pointer-events-none z-0"></div>

      {/* Ambient Glow Spots */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Main Container */}
      <div className="relative z-10 min-h-screen md:h-full flex flex-col p-4 md:p-10 pb-48 md:pb-10">
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
              <div className="flex justify-between items-center">
                <span className="text-gray-400 flex items-center gap-1"><Eye size={10} />CAMERA</span>
                <span className={`font-bold flex items-center gap-1 ${camera.isCameraOn ? "text-green-400" : "text-gray-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${camera.isCameraOn ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}></span>
                  {camera.isCameraOn ? "ACTIVE" : "OFF"}
                </span>
              </div>
              {camera.isCameraOn && vision.isAnalyzing && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">VISION</span>
                  <span className="text-primary">Analyzing...</span>
                </div>
              )}
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
        <footer className="fixed bottom-0 left-0 w-full z-20 flex flex-col md:flex-row items-end justify-between p-4 md:p-10 pointer-events-none">
          {/* Bottom-left: Image Studio dock (mirrors top-left System Monitor) */}
          <div className="w-full md:w-auto flex justify-start mb-4 md:mb-0 pointer-events-auto">
            <ImageStudio
              history={imageGen.history}
              activeCount={imageGen.windows.length}
              imageModel={imageGen.imageModel}
              videoModel={imageGen.videoModel}
              onGenerate={imageGen.generate}
              onReopen={imageGen.reopenFromHistory}
              onClearHistory={imageGen.clearHistory}
            />
          </div>
          <div className="w-full md:w-auto flex justify-center mb-4 md:mb-0 pointer-events-auto">
            <Controls
              isConnected={isConnected}
              isMuted={isMuted}
              isCameraOn={camera.isCameraOn}
              onStart={startConversation}
              onEnd={endConversation}
              onToggleMute={toggleMute}
              onInterrupt={interrupt}
              onToggleCamera={handleToggleCamera}
            />
          </div>
          <div className="w-full md:w-[30%] lg:w-1/4 flex justify-end pointer-events-auto">
            <Transcript messages={messages} />
          </div>
        </footer>

        {/* Floating draggable Vision Feed window (hidden on mobile) */}
        <div className="hidden md:block">
          <CameraFeed
            isCameraOn={camera.isCameraOn}
            isAnalyzing={vision.isAnalyzing}
            isReady={vision.isReady}
            lastResult={vision.lastResult}
            error={vision.error}
            videoRef={camera.videoRef}
            onToggleCamera={handleToggleCamera}
          />
        </div>

        {/* Floating image popup windows (Windows-style draggable) */}
        <ImageWindowManager
          windows={imageGen.windows}
          onClose={imageGen.closeWindow}
          onFocus={imageGen.focusWindow}
          onPositionChange={imageGen.updateWindowPosition}
        />
      </div>

      {/* Version badge */}
      <div className="fixed bottom-2 right-3 z-50 font-mono text-[10px] text-primary/30 select-none pointer-events-none tracking-widest">
        v{__APP_VERSION__}
      </div>
    </div>
  );
}

export default App;
