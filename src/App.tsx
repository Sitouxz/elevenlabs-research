import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAkoolAvatar } from "./hooks/useAkoolAvatar";
import { useVoiceNav } from "./hooks/useVoiceNav";
import { SplashScreen } from "./screens/SplashScreen";
import { MainMenuScreen } from "./screens/MainMenuScreen";
import { TopicSelectScreen } from "./screens/TopicSelectScreen";
import { TopicDetailScreen } from "./screens/TopicDetailScreen";
import { AskQuestionsScreen } from "./screens/AskQuestionsScreen";
import { ScenarioTitleScreen } from "./screens/ScenarioTitleScreen";
import { DecisionScreen } from "./screens/DecisionScreen";
import { ScoreScreen } from "./screens/ScoreScreen";
import { EndScenarioScreen } from "./screens/EndScenarioScreen";
import { NarationScreen } from "./screens/NarationScreen";
import { SummaryScreen } from "./screens/SummaryScreen";
import type { AppScreen, TopicId } from "./types";

const PRELOAD_IMAGES = [
  "https://www.figma.com/api/mcp/asset/9a630a07-f746-4336-b0e0-f602fd417f12", // Splash city bg
  "https://www.figma.com/api/mcp/asset/9580eb4b-f9a9-405a-83a8-83370a432bc5", // Splash Lumi
  "https://www.figma.com/api/mcp/asset/aa7a1e83-0252-4918-87a3-1e58fdcba520", // Menu city bg
  "https://www.figma.com/api/mcp/asset/6f7c3d2d-42d2-43b8-ac9a-66aeb2ce7ad4", // Menu Lumi
  "https://www.figma.com/api/mcp/asset/97f59666-1c43-4cbf-ae58-cc9798e5287a", // Leaf
];


const SCREEN_TRANSITIONS = {
  initial: { opacity: 0, scale: 1.02 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};

function App() {
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [screen, setScreen] = useState<AppScreen>("splash");
  const [activeTopic, setActiveTopic] = useState<TopicId>("solar");
  const [activeMenuBtn, setActiveMenuBtn] = useState<AppScreen | null>(null);


  const preloadImages = useCallback(() => {
    let loaded = 0;
    const total = PRELOAD_IMAGES.length;

    PRELOAD_IMAGES.forEach((src) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        loaded++;
        setLoadProgress(Math.round((loaded / total) * 100));
        if (loaded >= total) setAssetsLoaded(true);
      };
      img.src = src;
    });

    // Fallback: force-show after 8s even if images fail
    setTimeout(() => setAssetsLoaded(true), 8000);
  }, []);

  useEffect(() => {
    preloadImages();
  }, [preloadImages]);

  const avatar = useAkoolAvatar();
  const { parseIntent } = useVoiceNav();

  // Parse user messages for voice-driven screen transitions
  useEffect(() => {
    if (avatar.messages.length === 0) return;
    const last = avatar.messages[avatar.messages.length - 1];
    if (last.role !== "user") return;

    const action = parseIntent(last.text);

    // go back / main-menu: works from any screen
    if (action.screen === "main-menu") {
      setScreen("main-menu");
      return;
    }

    // ask-questions: works from main-menu and topic screens
    if (action.screen === "ask-questions" && screen !== "ask-questions") {
      setActiveMenuBtn("ask-questions");
      setTimeout(() => { setScreen("ask-questions"); setActiveMenuBtn(null); }, 600);
      return;
    }

    // topic-select / topic-detail: only navigate when on menu/select screens, not mid-conversation
    const canNavigateToContent = screen === "main-menu" || screen === "topic-select" || screen === "topic-detail";
    if (!canNavigateToContent) return;

    if (action.screen === "topic-select") {
      setActiveMenuBtn("topic-select");
      setTimeout(() => { setScreen("topic-select"); setActiveMenuBtn(null); }, 600);
    } else if (action.screen === "topic-detail" && action.topic) {
      setActiveTopic(action.topic);
      setScreen("topic-detail");
    }
  }, [avatar.messages, parseIntent, screen]);

  // No auto-transition - user must click on splash screen to proceed

  const handleNavigate = (target: AppScreen) => {
    setActiveMenuBtn(target);
    setTimeout(() => { setScreen(target); setActiveMenuBtn(null); }, 400);
  };

  const handleSplashClick = () => {
    if (screen === "splash") setScreen("main-menu");
  };

  const handleSelectTopic = (id: TopicId) => {
    setActiveTopic(id);
    setScreen("topic-detail");
    const topicNames: Record<TopicId, string> = {
      solar: "Solar Energy",
      ev: "EV Charging",
      battery: "Battery Storage",
      ai: "AI in Energy",
    };
    avatar.sendContextualUpdate(
      `User selected topic: ${topicNames[id]}. Please introduce and narrate about ${topicNames[id]} in the context of smart energy and Singapore's green city vision.`
    );
  };

  const handleBack = () => {
    if (screen === "topic-detail") setScreen("topic-select");
    else setScreen("main-menu");
  };

  const currentMessages = avatar.messages;
  const isListening = avatar.isListening;

  const avatarLoadStatus = !avatar.isReady ? avatar.loadingStatus : null;

  if (!assetsLoaded || avatarLoadStatus !== null) {
    return (
      <div className="w-full h-full bg-midnight flex flex-col items-center justify-center gap-6">
        {/* Spinner */}
        <div className="relative w-20 h-20">
          <div
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{
              borderTopColor: "#7FE040",
              borderRightColor: "#D4E800",
              animation: "spin 1s linear infinite",
            }}
          />
          <div
            className="absolute inset-2 rounded-full border-2 border-transparent"
            style={{
              borderBottomColor: "#00D4B8",
              borderLeftColor: "#009f89",
              animation: "spin 1.5s linear infinite reverse",
            }}
          />
        </div>
        {/* Text */}
        <div className="text-center">
          <p className="font-heading text-white/60 text-sm tracking-[0.3em] uppercase mb-2">
            {avatarLoadStatus || "Loading Experience"}
          </p>
          {!avatar.isReady && (
            <p className="font-heading text-energy-green text-lg font-bold">{loadProgress}%</p>
          )}
        </div>
        {/* Progress bar */}
        {!avatar.isReady && (
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg, #7FE040, #D4E800)" }}
              initial={{ width: 0 }}
              animate={{ width: `${loadProgress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-midnight overflow-hidden relative">
      <AnimatePresence mode="wait">
        {screen === "splash" && (
          <motion.div key="splash" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <SplashScreen avatar={avatar} isListening={isListening} onTap={handleSplashClick} />
          </motion.div>
        )}

        {screen === "main-menu" && (
          <motion.div key="main-menu" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <MainMenuScreen
              avatar={avatar}
              messages={currentMessages}
              activeButton={activeMenuBtn}
              onNavigate={handleNavigate}
            />
          </motion.div>
        )}

        {screen === "topic-select" && (
          <motion.div key="topic-select" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <TopicSelectScreen
              avatar={avatar}
              messages={currentMessages}
              isListening={isListening}
              onSelectTopic={handleSelectTopic}
            />
          </motion.div>
        )}

        {screen === "topic-detail" && (
          <motion.div key={`topic-${activeTopic}`} className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <TopicDetailScreen
              avatar={avatar}
              messages={currentMessages}
              topicId={activeTopic}
              onBack={handleBack}
              onNext={() => setScreen("naration")}
              isListening={isListening}
            />
          </motion.div>
        )}

        {screen === "ask-questions" && (
          <motion.div key="ask-questions" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <AskQuestionsScreen
              avatar={avatar}
              messages={currentMessages}
              isListening={isListening}
              isSpeaking={avatar.isSpeaking}
              onBack={handleBack}
            />
          </motion.div>
        )}

        {screen === "scenario-title" && (
          <motion.div key="scenario-title" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <ScenarioTitleScreen
              avatar={avatar}
              title="Solar Challenge"
              subtitle="Now that you're familiar with solar energy, let's begin with a quick fun challenge!"
              onStart={() => setScreen("decision")}
              isListening={isListening}
            />
          </motion.div>
        )}

        {screen === "decision" && (
          <motion.div key="decision" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <DecisionScreen
              avatar={avatar}
              messages={currentMessages}
              isListening={isListening}
              question="What should we do to keep the lights on and emissions low?"
              options={[
                "Install more solar panels",
                "Use battery storage systems", 
                "Implement smart grid technology",
                "Combine all approaches"
              ]}
              onSelectOption={(option) => {
                console.log("Selected option:", option);
                setScreen("score");
              }}
              onBack={handleBack}
            />
          </motion.div>
        )}

        {screen === "score" && (
          <motion.div key="score" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <ScoreScreen
              avatar={avatar}
              score={85}
              maxScore={100}
              title="Great Job!"
              message="You made excellent choices for sustainable energy management."
              onNext={() => setScreen("summary")}
              isListening={isListening}
            />
          </motion.div>
        )}

        {screen === "end-scenario" && (
          <motion.div key="end-scenario" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <EndScenarioScreen
              avatar={avatar}
              title="Scenario Complete"
              message="Congratulations! You've successfully completed the solar energy challenge and learned about sustainable energy solutions."
              onRestart={() => setScreen("scenario-title")}
              onMainMenu={() => setScreen("main-menu")}
              isListening={isListening}
            />
          </motion.div>
        )}

        {screen === "naration" && (
          <motion.div key="naration" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <NarationScreen
              avatar={avatar}
              narration="Solar energy is one of the most promising renewable energy sources for Singapore's future. By harnessing the power of the sun, we can reduce our carbon footprint and create a more sustainable energy ecosystem."
              onNext={() => setScreen("scenario-title")}
              isListening={isListening}
            />
          </motion.div>
        )}

        {screen === "summary" && (
          <motion.div key="summary" className="absolute inset-0" {...SCREEN_TRANSITIONS} transition={{ duration: 0.5 }}>
            <SummaryScreen
              avatar={avatar}
              title="Journey Summary"
              items={[
                {
                  category: "Energy Knowledge",
                  value: "Expert",
                  description: "You've mastered the fundamentals of solar energy systems"
                },
                {
                  category: "Decision Making",
                  value: "85%",
                  description: "Your choices aligned with sustainable energy best practices"
                },
                {
                  category: "Learning Progress",
                  value: "Complete",
                  description: "You've successfully completed the solar energy module"
                }
              ]}
              onComplete={() => setScreen("main-menu")}
              isListening={isListening}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dev HUD — remove in production */}
      {import.meta.env.DEV && (
        <div className="absolute top-3 right-3 z-50 glass-panel rounded-lg p-2 text-xs font-mono text-white/50 space-y-0.5 pointer-events-none">
          <div>screen: <span className="text-energy-green">{screen}</span></div>
          <div>avatar: <span className="text-energy-green">{avatar.mode}</span></div>
          <div>akool: <span className={avatar.isConnected ? "text-energy-green" : "text-white/30"}>{avatar.isConnected ? "connected" : "offline"}</span></div>
          {isListening && <div className="text-energy-yellow animate-pulse">● LISTENING</div>}
        </div>
      )}
    </div>
  );
}

export default App;
