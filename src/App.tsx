import { useCallback, useEffect, useRef, useState } from "react";
import { IntroVideo } from "./components/IntroVideo";
import { Visualizer } from "./components/Visualizer";
import { Controls } from "./components/Controls";
import { Transcript } from "./components/Transcript";
import { CameraFeed } from "./components/CameraFeed";
// import { ImageStudio } from "./components/ImageStudio";
import { ImageWindowManager } from "./components/ImageWindowManager";
import { ObjectViewerManager } from "./components/ObjectViewerManager";
import { MapPopup } from "./components/MapPopup";
import { SettingsSidebar } from "./components/SettingsSidebar";
import { FaceAnalysisPopup } from "./components/FaceAnalysisPopup";
import { useElevenLabs } from "./hooks/useElevenLabs";
import { useCamera } from "./hooks/useCamera";
import { useVision } from "./hooks/useVision";
import { useImageGeneration } from "./hooks/useImageGeneration";
import { useObjectScan } from "./hooks/useObjectScan";
import { useSketchToReal } from "./hooks/useSketchToReal";
import { useFaceAnalysis } from "./hooks/useFaceAnalysis";
import { useMapPopup } from "./hooks/useMapPopup";


import { useNetworkStatus } from "./hooks/useNetworkStatus";
import {
  checkPromptSafety,
  getModerationRefusalMessage,
} from "./utils/contentModeration";
import { compute as runCompute, type ComputeOperation } from "./utils/compute";
import { getCurrentWeather } from "./utils/weather";
import { Activity, ShieldCheck, Eye, Hand, Wifi, WifiOff, Settings } from "lucide-react";


const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "PASTE_YOUR_AGENT_ID_HERE";

// ponytail: flip to switch the "must say Flare/Flair to get a response" gate
// on or off — Vite HMR picks it up immediately, no other code to touch.
const REQUIRE_WAKE_WORD = true;

// How long to keep the mic gated waiting for the agent to START responding
// after the user's turn. This is only a safety net for a *missed* turn (the
// agent never speaks and never emits a "." gate reply) — the gate is normally
// released the instant the agent starts→stops speaking or the "." arrives. Kept
// short so a dropped turn recovers quickly instead of locking the user out.
// Once the agent actually starts speaking, this timer is cancelled so a long
// reply is never cut off mid-sentence.
const NO_RESPONSE_TIMEOUT_MS = 6_000;

function App() {
  const camera = useCamera();
  const vision = useVision();
  // visionUpdateRef no longer needed for on-demand vision
  const isSpeakingRef = useRef(false);
  const processedMsgCountRef = useRef(0);
  const hasSentFirstScanRef = useRef(false);
  const [isUiHidden, setIsUiHidden] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [interruptEnabled, setInterruptEnabled] = useState(true);

  // Space key toggles all overlaid UI (transcript, image windows, media studio,
  // vision feed, controls). Suppressed while the user is typing in a text field.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // Skip if focus is inside a text-input element
      const tag = target.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target.isContentEditable ||
        target.getAttribute("contenteditable") === "true" ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }
      e.preventDefault(); // prevent page scroll
      setIsUiHidden((prev) => !prev);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const {
    isConnected,
    isConnecting,
    isSpeaking,
    isListening,
    isMuted,
    isMutedRef,
    messages,
    stream,
    startConversation,
    endConversation,
    toggleMute,
    muteMic,
    unmuteMic,
    setGateMuted,
    interrupt,
    sendContextualUpdate,
    sendUserMessage,
    registerClientTools,
  } = useElevenLabs(AGENT_ID);


  const imageGen = useImageGeneration();
  const objectScan = useObjectScan();

  // Sketch → Realism: listen for the Unity "image" event (base64 drawing),
  // upload it to Cloudinary, then generate a photoreal version using the
  // uploaded sketch as the reference. generate() opens a display window AND
  // pushes the result URL back to Unity over the socket (sendToXR).
  useSketchToReal({
    generate: imageGen.generate,
    onSpeak: useCallback((message: string) => {
      // Trigger the agent to actually voice the acknowledgement. Reads from a
      // ref so this callback identity is stable and the socket never reconnects.
      sendUserMessageRef.current?.(message);
    }, []),
  });
  const mapPopup = useMapPopup();

  // Settings sidebar (multi-camera config). Toggled with the "A" key or the
  // gear icon at bottom-left of the screen.
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Face-analysis flow ("scan my face and analyze"). Reads the user-assigned
  // face camera (falling back to the object camera's stream) via refs so the
  // hook's callbacks never need to re-create when the selection changes.
  const faceCameraIdRef = useRef(camera.faceCameraId);
  useEffect(() => {
    faceCameraIdRef.current = camera.faceCameraId;
  }, [camera.faceCameraId]);
  const cameraStreamRef = useRef(camera.cameraStream);
  useEffect(() => {
    cameraStreamRef.current = camera.cameraStream;
  }, [camera.cameraStream]);

  const faceAnalysis = useFaceAnalysis(
    camera.openStreamForDevice,
    useCallback(() => faceCameraIdRef.current, []),
    useCallback(() => cameraStreamRef.current, []),
  );
  const faceAnalysisRef = useRef(faceAnalysis);
  useEffect(() => {
    faceAnalysisRef.current = faceAnalysis;
  }, [faceAnalysis]);

  // sendContextualUpdate / sendUserMessage read from refs so the face-analysis
  // tool (registered once at mount) can push the final summary to the agent
  // when the slow n8n analysis eventually resolves — without re-registering
  // tools. sendContextualUpdate only injects silent background context (agent
  // won't speak on its own); sendUserMessage injects a turn that TRIGGERS the
  // agent to actually speak, so that's what we use to voice the result.
  const sendContextualUpdateRef = useRef(sendContextualUpdate);
  useEffect(() => {
    sendContextualUpdateRef.current = sendContextualUpdate;
  }, [sendContextualUpdate]);
  const sendUserMessageRef = useRef(sendUserMessage);
  useEffect(() => {
    sendUserMessageRef.current = sendUserMessage;
  }, [sendUserMessage]);





  // Real network telemetry (round-trip latency + connection strength) for the
  // System Monitor widget. Only probe while connected to avoid needless
  // background requests when the assistant is idle.
  const network = useNetworkStatus(isConnected);

  // Map the qualitative strength to a Tailwind color + label + signal-bar count
  // so the widget can render a live indicator instead of the old fake "24ms".
  const STRENGTH_META: Record<
    typeof network.strength,
    { label: string; color: string; bars: number }
  > = {
    excellent: { label: "EXCELLENT", color: "text-green-400", bars: 4 },
    good: { label: "GOOD", color: "text-green-400", bars: 3 },
    fair: { label: "FAIR", color: "text-yellow-400", bars: 2 },
    poor: { label: "POOR", color: "text-red-400", bars: 1 },
    offline: { label: "OFFLINE", color: "text-red-500", bars: 0 },
    unknown: { label: "—", color: "text-gray-400", bars: 0 },
  };
  const strengthMeta = STRENGTH_META[network.strength];

  // Register the generate_image client tool ONCE at mount. The handler reads
  // the latest imageGen.generate from a ref so we don't need to re-register
  // (which would be a no-op anyway since startConversation snapshots tools).
  const generateRef = useRef(imageGen.generate);
  useEffect(() => {
    generateRef.current = imageGen.generate;
  }, [imageGen.generate]);

  // Refs for mute/unmute so client-tool handlers always read the latest values
  // without re-registering tools.
  const muteMicRef = useRef(muteMic);
  useEffect(() => {
    muteMicRef.current = muteMic;
  }, [muteMic]);

  const unmuteMicRef = useRef(unmuteMic);
  useEffect(() => {
    unmuteMicRef.current = unmuteMic;
  }, [unmuteMic]);

  const visionRef = useRef(vision);
  useEffect(() => {
    visionRef.current = vision;
  }, [vision]);

  // 3D object scan hook — read the latest scanToObject from a ref so the
  // client-tool handler doesn't need to re-register when the hook updates.
  const objectScanRef = useRef(objectScan);
  useEffect(() => {
    objectScanRef.current = objectScan;
  }, [objectScan]);


  // Last should_respond decision, used to interrupt the agent if it starts
  // speaking despite a SILENT gate result. No-op when REQUIRE_WAKE_WORD is off,
  // since the gate always returns RESPOND then.
  const lastGateDecisionRef = useRef<"RESPOND" | "SILENT">("RESPOND");
  const wasSpeakingForGateRef = useRef(false);
  useEffect(() => {
    if (!isConnected) return;
    if (!wasSpeakingForGateRef.current && isSpeaking) {
      if (lastGateDecisionRef.current === "SILENT") {
        console.log("[FLARE gate] Agent speaking despite SILENT — interrupting");
        interrupt();
      }
    }
    wasSpeakingForGateRef.current = isSpeaking;
  }, [isSpeaking, isConnected]);

  // ---------------------------------------------------------------------------
  // Edit-intent detection for image generation.
  //
  // The ElevenLabs agent often REPHRASES the user's prompt (e.g.
  // "make the controller white" → "a white Xbox controller"), which strips
  // edit-indicating words. Text-pattern matching against edit verbs alone is
  // unreliable against rewritten prompts, and pure time-proximity is too
  // aggressive — it kept reusing the previous image even when the user asked
  // for something totally unrelated right afterward.
  //
  // So auto-detection combines two signals:
  //   1. Recency  — was the last image generated within the edit window?
  //   2. Subject  — does the new prompt share keywords with the prompt that
  //                 produced the last image? ("Xbox controller" → "white Xbox
  //                 controller" shares "xbox"/"controller"; "Xbox controller"
  //                 → "a dragon flying over mountains" shares nothing.)
  // Both must hold for the previous image to be auto-attached as a reference.
  // The agent can still force either behavior with use_last_image: true/false.
  // ---------------------------------------------------------------------------
  const EDIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

  const PROMPT_STOPWORDS = new Set([
    "a", "an", "the", "of", "in", "on", "at", "to", "for", "with", "and",
    "or", "is", "are", "be", "it", "its", "this", "that", "image", "picture",
    "photo", "generate", "create", "make", "render", "draw", "show", "me",
    "please", "can", "could", "you", "now", "i", "want", "would", "like",
    "some", "into", "by", "colored", "color", "version",
  ]);

  const extractKeywords = (text: string): Set<string> =>
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !PROMPT_STOPWORDS.has(w)),
    );

  const shareSubject = (promptA: string, promptB: string): boolean => {
    if (!promptA || !promptB) return false;
    const a = extractKeywords(promptA);
    const b = extractKeywords(promptB);
    if (a.size === 0 || b.size === 0) return false;
    for (const word of a) {
      if (b.has(word)) return true;
    }
    return false;
  };

  // Edits like "change the color of the pillow to white" or "make it darker"
  // usually describe a part of the picture (e.g. "pillow") that was never
  // mentioned in the original text prompt, so shareSubject() alone can't
  // catch them. Detect the instruction shape instead: a change-style verb
  // paired with a definite reference to something already on screen.
  const EDIT_VERB_PATTERN =
    /\b(change|turn|paint|recolor|re-color|colour|color|add|remove|replace|swap|adjust)\b/i;
  const EDIT_REFERENT_PATTERN = /\b(the|it|its|him|her|them|this|that)\b/i;
  const soundsLikeEditInstruction = (prompt: string): boolean =>
    EDIT_VERB_PATTERN.test(prompt) && EDIT_REFERENT_PATTERN.test(prompt);

  // Explicit "I want something new/unrelated" cues override auto-detection
  // entirely, even if the request comes seconds after the last image and
  // happens to share a keyword.
  const FRESH_INTENT_PATTERNS = [
    /\bnew image\b/i,
    /\bdifferent image\b/i,
    /\banother image\b/i,
    /\bfrom scratch\b/i,
    /\bstart over\b/i,
    /\bforget (that|it|the previous|the last)\b/i,
    /\bunrelated\b/i,
    /\bcompletely different\b/i,
    /\bnot (related|connected)\b/i,
    /\bnothing to do with\b/i,
  ];
  const soundsLikeFreshRequest = (prompt: string): boolean =>
    FRESH_INTENT_PATTERNS.some((p) => p.test(prompt));

  useEffect(() => {
    registerClientTools({
      generate_image: ({ prompt, reference_image, use_last_image }) => {
        console.log(
          "[FLARE tool] generate_image invoked with:",
          prompt,
          reference_image ? `ref: ${reference_image}` : "",
          use_last_image !== undefined
            ? `use_last_image: ${use_last_image}`
            : "",
        );
        const promptStr = typeof prompt === "string" ? prompt.trim() : "";
        if (!promptStr) {
          return "I need a description of the image you'd like me to create.";
        }

        const moderation = checkPromptSafety(promptStr);
        if (moderation.blocked) {
          console.log(
            "[FLARE tool] generate_image blocked by moderation:",
            moderation.category,
          );
          return getModerationRefusalMessage(moderation);
        }

        // Resolve the reference image. Priority order:
        //   1. Explicit reference_image URL passed by the agent
        //   2. use_last_image: true  → force use of previous image
        //   3. use_last_image: false → force fresh generation
        //   4. Explicit "new/unrelated" phrasing → force fresh generation
        //   5. Auto-detect → only when the last image is recent AND the new
        //      prompt shares a subject keyword with it
        let refImage: string | undefined;
        const lastUrl = imageGen.lastImageUrlRef.current;
        const lastTime = imageGen.lastImageTimeRef.current;
        const lastPrompt = imageGen.lastPromptRef.current;

        if (
          typeof reference_image === "string" &&
          reference_image.length > 0
        ) {
          refImage = reference_image;
          console.log("[FLARE tool] Using explicit reference_image from agent");
        } else if (use_last_image === true) {
          refImage = lastUrl ?? undefined;
          console.log("[FLARE tool] use_last_image=true, ref:", refImage);
        } else if (use_last_image === false) {
          // Explicitly disabled — bypass auto-detect entirely
          console.log("[FLARE tool] use_last_image=false, fresh generation");
        } else if (soundsLikeFreshRequest(promptStr)) {
          console.log(
            "[FLARE tool] Detected explicit fresh-image phrasing, skipping reference",
          );
        } else if (
          lastUrl &&
          lastTime > 0 &&
          Date.now() - lastTime < EDIT_WINDOW_MS &&
          (shareSubject(promptStr, lastPrompt) ||
            soundsLikeEditInstruction(promptStr))
        ) {
          refImage = lastUrl;
          console.log(
            "[FLARE tool] Auto-detected edit (recent + shared subject or edit phrasing vs:",
            `"${lastPrompt}"), using previous image:`,
            lastUrl,
          );
        }

        generateRef.current(promptStr, "image", refImage);

        const refNote = refImage
          ? " (using previous image as reference)"
          : "";
        return `Generating an image of "${promptStr}"${refNote}. It will be ready in about 5 to 10 seconds — it will appear on screen when ready.`;
      },
      generate_video: ({ prompt }) => {
        console.log("[FLARE tool] generate_video invoked with:", prompt);
        const promptStr = typeof prompt === "string" ? prompt.trim() : "";
        if (!promptStr) {
          return "I need a description of the video you'd like me to create.";
        }

        const moderation = checkPromptSafety(promptStr);
        if (moderation.blocked) {
          console.log(
            "[FLARE tool] generate_video blocked by moderation:",
            moderation.category,
          );
          return getModerationRefusalMessage(moderation);
        }

        generateRef.current(promptStr, "video");
        return `Rendering a video of ${promptStr}. This usually takes 30 to 60 seconds — it will appear on screen when ready.`;
      },
      scan_camera: async () => {
        console.log("[FLARE tool] scan_camera invoked");
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
      scan_to_3d: async ({ object_name }) => {
        console.log("[FLARE tool] scan_to_3d invoked", object_name ?? "");

        // Auto-enable the camera if it's off so the user doesn't have to
        // turn it on manually before asking to scan an object into 3D.
        if (!camera.isCameraOn) {
          console.log("[FLARE tool] scan_to_3d: camera off, turning it on");
          await camera.startCamera();
        }

        // Wait for the <video> element to have a decoded frame ready
        // (readyState >= 2). getUserMedia + play() resolve before the first
        // frame is actually paintable, so capturing immediately can yield a
        // blank canvas. Poll briefly for up to ~4s.
        const waitForFrame = async (): Promise<HTMLVideoElement | null> => {
          const start = Date.now();
          while (Date.now() - start < 4000) {
            const v = camera.videoRef.current;
            if (v && v.readyState >= 2 && v.videoWidth > 0) return v;
            await new Promise((r) => setTimeout(r, 120));
          }
          return camera.videoRef.current;
        };

        const video = await waitForFrame();
        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          return "I couldn't get a clear camera frame to scan. Please make sure the camera is on and the object is visible, then try again.";
        }

        const label =
          typeof object_name === "string" && object_name.trim()
            ? object_name.trim()
            : "Scanned object";

        const result = await objectScanRef.current.scanToObject(video, label);
        return result.message;
      },
      generate_3d: ({ prompt, object_name }) => {
        console.log("[FLARE tool] generate_3d invoked with:", prompt);
        const promptStr = typeof prompt === "string" ? prompt.trim() : "";
        if (!promptStr) {
          return "I need a description of the object you'd like me to build in 3D.";
        }

        const moderation = checkPromptSafety(promptStr);
        if (moderation.blocked) {
          console.log(
            "[FLARE tool] generate_3d blocked by moderation:",
            moderation.category,
          );
          return getModerationRefusalMessage(moderation);
        }

        const label =
          typeof object_name === "string" && object_name.trim()
            ? object_name.trim()
            : undefined;

        const result = objectScanRef.current.generateFromText(promptStr, label);
        return result.message;
      },
      scan_face_analyze: () => {
        console.log("[FLARE tool] scan_face_analyze invoked");
        // The analysis backend (n8n → a slow "thinking" vision model) can take
        // much longer than ElevenLabs' client-tool response window, which made
        // the agent give up and improvise an error even though the popup filled
        // in fine. So mirror the 3D-scan pattern: kick the analysis off in the
        // BACKGROUND, return IMMEDIATELY with a status message, and push the
        // real spoken summary via a contextual update when it resolves.
        faceAnalysisRef.current
          .analyzeFace()
          .then((summary) => {
            console.log("[FLARE tool] scan_face_analyze done, pushing summary");
            // sendUserMessage (not sendContextualUpdate) so the agent actually
            // SPEAKS — contextual updates are silent background context the
            // agent won't voice on its own. The message is phrased as an
            // instruction and includes the wake word "Flare" so the
            // should_respond gate returns RESPOND instead of silencing it.
            sendUserMessageRef.current(
              `[SYSTEM to Flare] The face analysis just finished. Flare, say this ` +
              `result to the user now, out loud and naturally, framing age and gender ` +
              `as friendly best-effort visual estimates: "${summary}"`
            );
          })
          .catch((err) => {
            console.error("[FLARE tool] scan_face_analyze failed:", err);
            sendUserMessageRef.current(
              `[SYSTEM to Flare] The face analysis failed: ${
                err?.message || "unknown error"
              }. Flare, briefly apologize to the user and ask them to try again.`
            );
          });

        return (
          "Scanning the user's face now and analyzing it — the result appears in a " +
          "popup and takes a few seconds. Tell the user you're analyzing their face and " +
          "will share the results in a moment. Do NOT make up any result yet; the real " +
          "summary will arrive as a follow-up system message."
        );
      },


      mute_microphone: () => {


        console.log("[FLARE tool] mute_microphone invoked");
        if (isMutedRef.current) {
          return "The microphone is already muted.";
        }
        muteMicRef.current();
        return "Microphone muted. I can no longer hear you. Press the unmute button or tap the M key on your keyboard when you want me to listen again.";
      },
      unmute_microphone: () => {
        console.log("[FLARE tool] unmute_microphone invoked");
        if (!isMutedRef.current) {
          return "The microphone is already active and listening.";
        }
        unmuteMicRef.current();
        return "Microphone unmuted. I can hear you again.";
      },
      should_respond: async ({ user_message }) => {
        if (!REQUIRE_WAKE_WORD) {
          lastGateDecisionRef.current = "RESPOND";
          return "RESPOND";
        }

        const msg = typeof user_message === "string" ? user_message.trim() : "";
        if (!msg) {
          lastGateDecisionRef.current = "SILENT";
          return "SILENT";
        }

        console.log(`[FLARE gate] Checking: "${msg.slice(0, 80)}${msg.length > 80 ? "..." : ""}"`);

        // Only respond when the user explicitly calls the AI by name
        if (/\b(flare|flair)\b/i.test(msg)) {
          console.log("[FLARE gate] Name detected → RESPOND");
          lastGateDecisionRef.current = "RESPOND";
          return "RESPOND";
        }

        console.log("[FLARE gate] No name → SILENT");
        lastGateDecisionRef.current = "SILENT";
        return "SILENT";
      },
      compute: ({ task, text, substring, n, birth_year, target_year, expression, case_sensitive, char_a, char_b, from, offset_days }) => {
        console.log("[FLARE tool] compute invoked:", task);
        const opTask = typeof task === "string" ? task : "";
        const opText = typeof text === "string" ? text : "";
        const opSub = typeof substring === "string" ? substring : "";
        const opN = typeof n === "number" ? n : Number(n || 0);
        const opBirthYear = typeof birth_year === "number" ? birth_year : Number(birth_year || 0);
        const opTargetYear = typeof target_year === "number" ? target_year : Number(target_year || 0);
        const opExpr = typeof expression === "string" ? expression : "";
        const opCaseSensitive = case_sensitive === true;
        const opCharA = typeof char_a === "string" ? char_a : "";
        const opCharB = typeof char_b === "string" ? char_b : "";
        // Default the base date to today (LOCAL date, not UTC — toISOString()
        // would roll a day forward/back in timezones like UTC+7) so the agent
        // can pass just offset_days.
        const localToday = (() => {
          const d = new Date();
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        })();
        const opFrom = typeof from === "string" && from ? from : localToday;
        const opOffsetDays = typeof offset_days === "number" ? offset_days : Number(offset_days || 0);

        const opMap: Record<string, ComputeOperation | null> = {
          age: { task: "age", birthYear: opBirthYear, targetYear: opTargetYear },
          count_occurrences: { task: "count_occurrences", text: opText, substring: opSub, caseSensitive: opCaseSensitive },
          count_words: { task: "count_words", text: opText },
          nth_word: { task: "nth_word", text: opText, n: opN },
          reverse: { task: "reverse", text: opText },
          reverse_without_vowels: { task: "reverse_without_vowels", text: opText },
          scramble: { task: "scramble", text: opText },
          swap_chars: { task: "swap_chars", text: opText, charA: opCharA, charB: opCharB },
          arithmetic: { task: "arithmetic", expression: opExpr },
          date_offset: { task: "date_offset", from: opFrom, offsetDays: opOffsetDays },
          current_date: { task: "current_date" },
        };

        const operation = opMap[opTask];
        if (!operation) {
          return `Unknown compute task "${opTask}". Available tasks: age, count_occurrences, count_words, nth_word, reverse, reverse_without_vowels, scramble, swap_chars, arithmetic, date_offset, current_date.`;
        }
        return runCompute(operation);
      },
      check_weather: async () => {
        console.log("[FLARE tool] check_weather invoked");
        try {
          return await getCurrentWeather();
        } catch (err) {
          console.error("[FLARE tool] check_weather failed:", err);
          if (err instanceof GeolocationPositionError && err.code === err.PERMISSION_DENIED) {
            return "I couldn't check the weather because location access was denied. Please allow location permissions and try again.";
          }
          return "I couldn't check the weather right now. Please try again in a moment.";
        }
      },
      show_map: async ({ location, destination }) => {
        console.log("[FLARE tool] show_map invoked with:", location, destination);
        const locationStr = typeof location === "string" ? location.trim() : "";
        const destinationStr = typeof destination === "string" ? destination.trim() : "";
        if (!locationStr) {
          return "I need a location to show on the map.";
        }
        if (destinationStr) {
          return mapPopup.showDistance(locationStr, destinationStr);
        }
        return mapPopup.showLocation(locationStr);
      },
    });
    console.log(
      "[FLARE] Client tools registered: generate_image, generate_video, scan_camera, " +
      "scan_to_3d, generate_3d, scan_face_analyze, mute_microphone, unmute_microphone, should_respond, compute, check_weather, " +

      "show_map. NOTE: For voice triggers to work, all tools must ALSO be declared " +
      "on the agent dashboard. See README for instructions."
    );


    // mapPopup.showLocation/showDistance are stable (useCallback with no deps),
    // so referencing them here doesn't need to be in the effect's deps array.
  }, [registerClientTools, camera, isMutedRef]);

  // Keep isSpeakingRef in sync for use inside callbacks
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);


  // Reset state on disconnect
  useEffect(() => {
    if (!isConnected) {
      hasSentFirstScanRef.current = false;
      processedMsgCountRef.current = 0;
    }
  }, [isConnected]);

  // Send system prompt about capabilities when connected.
  useEffect(() => {
    if (isConnected && !hasSentFirstScanRef.current) {
      const gateRule = REQUIRE_WAKE_WORD
        ? `\n\nGATE — Before replying to ANY message, call should_respond with the user's ` +
          `exact message. If it returns "SILENT", reply with exactly "." (nothing else). ` +
          `If "RESPOND", reply normally. The gate only decides IF you speak — it never ` +
          `fulfills a request. If the message asks you to DO something, call should_respond ` +
          `AND the matching action tool in the SAME turn; never promise an action without ` +
          `calling its tool. You may call multiple tools per turn. Exception: your first ` +
          `greeting after connecting needs no gate call. `
        : `\n\nRespond immediately to every message (no wake word needed). If the message ` +
          `asks you to DO something, call the matching action tool in the SAME turn; never ` +
          `promise an action without calling its tool. You may call multiple tools per turn. `;

      const precisionRule =
        `\n\nPRECISION — Never do counting, arithmetic, dates/ages, word indexing, or ` +
        `string manipulation in your head. Call compute and read back its result. Tasks: ` +
        `count_words, count_occurrences, nth_word, age, arithmetic, scramble, swap_chars ` +
        `(char_a/char_b), reverse (keeps vowels — use for plain "reverse it"), and ` +
        `reverse_without_vowels (ONLY when the user says "without vowels"). For "reply in ` +
        `exactly N words", draft, call count_words, adjust to N before speaking. ` +
        `\n\nFor "what day/date/time is it (now/today)", do NOT answer from memory or the ` +
        `system date — ALWAYS call compute with task="current_date" (no other args) and read ` +
        `back its result verbatim (it gives the live weekday, date, and time). ` +
        `For ANY "N days from now / ago / what day is <date>" question, do NOT count ` +
        `weekdays yourself — ALWAYS call date_offset with offset_days (0=today, +future, ` +
        `-past) and optional from="YYYY-MM-DD", then say BOTH weekday and date `;

      const formatRule =
        `\n\nFORMAT — Keep formatting characters the user asks for: currency ($ € £), ` +
        `date/time punctuation, operators (+ - * / =), %, and decimals. Echo tool results ` +
        `verbatim; never spell them out.`;

      const now = new Date();
      const dateStr = now.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const isoDate = now.toISOString().split("T")[0];

      sendContextualUpdate(
        `[SYSTEM] You are Flare, a voice AI assistant. ` +
        `Today's date is ${dateStr} (${isoDate}); use it for all day/date calculations. ` +
        `\n\nNUMBERS — Always write numbers as digits, not words (e.g. "6 July 2026", ` +
        `"3 apples"), in every message. ` +
        gateRule +
        precisionRule +
        formatRule +
        `\n\nLANGUAGE — English ONLY. Whatever language the user speaks, never switch or ` +
        `translate; if they use another language, reply in English that you only ` +
        `understand English and ask them to repeat in English. ` +
        `\n\nDon't correct a wrong name (Jarvis, Alexa, Siri, etc.) — just answer naturally. ` +

        `\n\nTOOLS — You have real capabilities; never say you lack access. Call the tool ` +
        `and answer from its result:` +
        `\n- CAMERA: for "what do you see / look at this / what's on screen", call scan_camera.` +
        `\n- 3D SCAN: for "scan this object and recreate it / make a 3D of it / scan this in the ` +
        `camera and create the 3D / turn this into a 3D model / 3D scan this", call scan_to_3d. ` +
        `It auto-turns the camera on, captures the object, and starts building an interactive 3D ` +
        `model the user can rotate on screen. Pass object_name if the user named the object. ` +
        `Generation runs in the BACKGROUND and takes a few minutes — the tool returns IMMEDIATELY ` +
        `with a status message once capture starts; a loading window appears and fills in on its ` +
        `own when the model is ready. Relay the tool's returned message; don't promise without ` +
        `calling it, and don't claim it's done or failed just because the tool returned quickly.` +
        `\n- 3D FROM TEXT: for "generate/make/create a 3D of X / build a 3D model of X / I want a ` +
        `3D X" where X is described in words (NO camera involved), call generate_3d with ` +
        `prompt=a detailed description of X (and object_name=the short name if given). This ` +
        `builds the model purely from the text prompt — do NOT turn the camera on. Same as the ` +
        `3D scan otherwise: it runs in the BACKGROUND for a few minutes, returns IMMEDIATELY with ` +
        `a status message, and a loading window fills in on its own when ready. Use scan_to_3d ` +
        `ONLY when the user wants to capture a real object via the camera; use generate_3d when ` +
        `they just describe what they want in words. Relay the tool's returned message.` +
        `\n- FACE ANALYSIS: for "scan my face and analyze / scan face and analyze / analyze my ` +
        `face / do a color analysis on me / analyze the person in front of the camera", call ` +
        `scan_face_analyze (no arguments). It uses the dedicated face camera and shows a loading ` +
        `popup. The analysis runs in the BACKGROUND and takes several seconds — the tool returns ` +
        `IMMEDIATELY with a status message. Relay that status (tell the user you're analyzing ` +
        `their face and will share results shortly) and do NOT invent any result. When the ` +
        `analysis finishes you'll get a follow-up [SYSTEM] message containing the real summary ` +
        `(age, gender, color analysis, best outfit) — at THAT point say it out loud naturally, ` +
        `framing age/gender as friendly best-effort visual estimates. A details popup appears on ` +
        `screen automatically.` +



        `\n- WEATHER: ONLY call check_weather when the user explicitly asks about weather, ` +


        `temperature, rain, forecast, or conditions. Never call it for a location/place ` +
        `question. If location was denied, relay that and ask to allow permissions.` +
        `\n- MAP/LOCATION: for ANY place or location question — "where is X", "show me X", ` +
        `"find X on the map", "how far is X" — call show_map with location=X (do NOT call ` +
        `check_weather). For distance between two places, add destination=Y. Use the tool's ` +
        `text; never guess a distance. Never respond to a location question by checking the weather.` +
        `\n- IMAGES: for an image request, call generate_image with a detailed prompt in the ` +
        `same turn (don't just promise it). To edit/change the previous image, pass ` +
        `use_last_image:true; for something new/unrelated, use_last_image:false; if unsure, ` +
        `leave it unset (auto-decides by recency + shared subject).` +
        `\n- IMAGE EDITS: You CAN edit/modify an image you already generated — never say you ` +
        `can't change its color, remove/add something, or alter it, and never ask "would you ` +
        `like a new image?". When the user asks to change/recolor/modify/adjust "the ..." or ` +
        `"it" right after an image (e.g. "make the table white", "change its color", "remove ` +
        `the background"), IMMEDIATELY call generate_image with use_last_image:true and a ` +
        `prompt describing the edited result. Don't refuse, don't ask permission, just do it.` +

        `\n- Some image/video prompts are auto-refused (profanity, real person doing a crime, ` +
        `ID/passport replicas). The tool's return value IS your reply — relay it, don't retry or argue.` +
        `\n- MUTE: when the user asks to be muted ("mute me", "stop listening", "be quiet", ` +
        `"I need privacy"), call mute_microphone. NEVER mute on your own — silence/pauses are ` +
        `not a reason. When they ask to be unmuted ("unmute me", "I'm back", "listen again"), ` +
        `call unmute_microphone. Don't argue about muting — just call the tool.`
      );
      hasSentFirstScanRef.current = true;
      console.log("[FLARE] System prompt sent.");
    }
  }, [isConnected, sendContextualUpdate]);

  const handleToggleCamera = useCallback(async () => {
    await camera.toggleCamera();
  }, [camera]);

  // When the user unmutes (button or keyboard), tell the agent it can hear again.
  // Otherwise the agent still thinks it's muted from the earlier mute_microphone
  // tool call and will respond with "I can't hear you, you're muted."
  const wasMutedRef = useRef(isMuted);
  useEffect(() => {
    const wasMuted = wasMutedRef.current;
    wasMutedRef.current = isMuted;
    // Only fire on the muted → unmuted transition
    if (wasMuted && !isMuted && isConnected) {
      sendContextualUpdate(
        `[SYSTEM] The user has just unmuted their microphone. You CAN hear them again now. ` +
        `Resume normal conversation — do NOT say you can't hear them or that the mic is muted.`
      );
      console.log("[FLARE] Sent unmute notification to agent.");
    }
  }, [isMuted, isConnected, sendContextualUpdate]);

  // The instant the user's utterance is finalized and shown in the
  // transcript, gate-mute the mic so any speech the user keeps producing
  // isn't picked up mid-turn — audio bleeding into the agent's processing/
  // response window confuses turn-taking and produces buggy replies.
  // Released once the agent finishes speaking its response. A timeout
  // guards against the gate never lifting if the agent never speaks back.
  const [awaitingAgentTurn, setAwaitingAgentTurn] = useState(false);
  const awaitingAgentTurnRef = useRef(false);
  const awaitingAgentTurnTimeoutRef = useRef<number | null>(null);
  const lastMessageCountRef = useRef(0);

  const clearAwaitingAgentTurn = useCallback(() => {
    awaitingAgentTurnRef.current = false;
    setAwaitingAgentTurn(false);
    if (awaitingAgentTurnTimeoutRef.current !== null) {
      window.clearTimeout(awaitingAgentTurnTimeoutRef.current);
      awaitingAgentTurnTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (messages.length === lastMessageCountRef.current) return;
    lastMessageCountRef.current = messages.length;
    const last = messages[messages.length - 1];
    if (last && last.role === "user") {
      awaitingAgentTurnRef.current = true;
      setAwaitingAgentTurn(true);
      if (awaitingAgentTurnTimeoutRef.current !== null) {
        window.clearTimeout(awaitingAgentTurnTimeoutRef.current);
      }
      awaitingAgentTurnTimeoutRef.current = window.setTimeout(() => {
        console.warn(
          "[FLARE] Agent never spoke back after the user's turn — releasing the mic gate."
        );
        clearAwaitingAgentTurn();
      }, NO_RESPONSE_TIMEOUT_MS);
    } else if (
      last &&
      last.role === "ai" &&
      last.text.trim() === "." &&
      awaitingAgentTurnRef.current
    ) {
      // The should_respond wake-word gate's SILENT reply is a lone "."
      // with effectively no audio, so isSpeaking often never flips
      // true→false for it — the normal turn-gate release below never
      // fires, leaving the mic gated (and the user's next attempts
      // dropped) until the no-response fallback timeout. The "." text arriving
      // is itself a reliable "turn's over" signal, so open the gate now.
      clearAwaitingAgentTurn();
      setGateMuted(false);
    }
  }, [messages, clearAwaitingAgentTurn, setGateMuted]);

  const wasSpeakingForTurnGateRef = useRef(false);
  useEffect(() => {
    // Agent STARTED speaking (false→true): cancel the no-response fallback
    // timer so a long reply is never cut off mid-sentence by it. The gate
    // stays closed and is released below only when speech actually ends.
    if (!wasSpeakingForTurnGateRef.current && isSpeaking && awaitingAgentTurnRef.current) {
      if (awaitingAgentTurnTimeoutRef.current !== null) {
        window.clearTimeout(awaitingAgentTurnTimeoutRef.current);
        awaitingAgentTurnTimeoutRef.current = null;
      }
    }
    if (wasSpeakingForTurnGateRef.current && !isSpeaking && awaitingAgentTurnRef.current) {
      clearAwaitingAgentTurn();
      // Open the mic gate in this same pass instead of waiting for the
      // awaitingAgentTurn state update to flow through the effect below —
      // that extra render round-trip was clipping the first syllables
      // (often the wake word) of whatever the user said right as the
      // agent finished speaking.
      setGateMuted(false);
    }
    wasSpeakingForTurnGateRef.current = isSpeaking;
  }, [isSpeaking, clearAwaitingAgentTurn, setGateMuted]);

  useEffect(() => {
    if (!isConnected) {
      lastMessageCountRef.current = 0;
      clearAwaitingAgentTurn();
    }
  }, [isConnected, clearAwaitingAgentTurn]);

  // When interrupt mode is deactivated, the agent can't be talked over. We
  // silence outgoing mic audio at the SDK level while it's speaking (via
  // setGateMuted) so no audio reaches the server to trigger a barge-in —
  // without flipping isMuted/disabling the stream track, so the mic never
  // visually appears muted to the user. Combined here with the turn gate
  // above so both reasons to gate-mute are respected simultaneously.
  useEffect(() => {
    if (!isConnected) {
      setGateMuted(false);
      return;
    }
    setGateMuted(awaitingAgentTurn || (!interruptEnabled && isSpeaking));
  }, [awaitingAgentTurn, isSpeaking, interruptEnabled, isConnected, setGateMuted]);

  // Keyboard shortcut: press M to toggle mute/unmute (only when connected).
  // Ignores keypresses inside input/textarea elements.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isConnected) return;
      // Don't intercept when user is typing in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isConnected, toggleMute]);

  // Keyboard shortcuts: S=Start, I=Interrupt, C=Toggle Camera.
  // Ignores keypresses inside input/textarea elements.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in an input field
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        if (!isConnected && !isConnecting) startConversation();
      } else if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        if (isConnected) interrupt();
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        handleToggleCamera();
      } else if (e.key === "o" || e.key === "O") {
        e.preventDefault();
        setInterruptEnabled((prev) => !prev);
      } else if (e.key === "a" || e.key === "A") {
        // Toggle the multi-camera settings sidebar.
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isConnected, isConnecting, startConversation, interrupt, handleToggleCamera]);

  // Re-acquire the live object-scan camera whenever the user reassigns it in
  // the settings sidebar (only if the camera is currently running).
  const prevObjectCameraIdRef = useRef(camera.objectCameraId);
  useEffect(() => {
    if (prevObjectCameraIdRef.current !== camera.objectCameraId) {
      prevObjectCameraIdRef.current = camera.objectCameraId;
      if (camera.isCameraOn) {
        void camera.restartObjectCamera();
      }
    }
  }, [camera.objectCameraId, camera.isCameraOn, camera]);


  if (showIntro) {
    return <IntroVideo onComplete={() => setShowIntro(false)} />;
  }

  return (
    <div className="bg-midnight font-display text-gray-100 min-h-screen md:h-screen w-full overflow-hidden relative selection:bg-primary selection:text-black">
      {/* Background Grid Texture */}
      <div className="absolute inset-0 bg-grid pointer-events-none z-0"></div>

      {/* Ambient Glow Spots */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-[100px] pointer-events-none z-0"></div>
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Background layer: large visualizer video, spans the full page height
          independently of the header/footer padding inside Main Container so
          it can grow to nearly full-screen without shifting FLARE/controls.
          Centered — at 130vmin it's already larger than the viewport, so it
          overflows (and touches) both the top and bottom edges symmetrically;
          the page-level overflow-hidden clips the excess with no scrollbars. */}
      <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none">
        <Visualizer
          isSpeaking={isSpeaking}
          audioStream={stream}
        />
      </div>

      {/* Main Container */}
      <div className="relative z-10 min-h-screen md:h-full flex flex-col p-4 md:p-10 pb-48 md:pb-10">
        {/* Top Header Area */}
        <header className="flex justify-between items-start">
          {/* System Monitor Widget */}
          <div className="glass-panel p-4 rounded-xl w-72 transition-all hover:border-primary/40 group relative">
            <div className="flex items-center space-x-2 mb-3 border-b border-primary/10 pb-2">
              <Activity className="text-primary animate-pulse" size={16} />
              <h2 className="text-xs font-mono font-extrabold tracking-widest text-primary/80">SYSTEM MONITOR</h2>
            </div>
            <div className="space-y-2 font-mono text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-300">STATUS</span>
                <span className={`font-extrabold flex items-center gap-1 ${isConnected ? "text-green-400" : "text-yellow-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? "bg-green-400 animate-pulse" : "bg-yellow-400"}`}></span>
                  {isConnected ? "ONLINE" : "STANDBY"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300">LATENCY</span>
                <span className={network.strength === "offline" ? "text-red-500" : "text-primary"}>
                  {isConnected
                    ? network.latencyMs !== null
                      ? `${network.latencyMs}ms`
                      : network.online
                        ? "measuring…"
                        : "offline"
                    : "--"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 flex items-center gap-1">
                  {network.strength === "offline"
                    ? <WifiOff size={10} />
                    : <Wifi size={10} />}
                  CONNECTION
                </span>
                <span className={`font-extrabold flex items-center gap-2 ${strengthMeta.color}`}>
                  {/* 4-bar signal-strength meter */}
                  <span className="flex items-end gap-0.5 h-3">
                    {[1, 2, 3, 4].map((bar) => (
                      <span
                        key={bar}
                        className={`w-0.5 rounded-sm ${
                          isConnected && bar <= strengthMeta.bars
                            ? "bg-current"
                            : "bg-current opacity-25"
                        }`}
                        style={{ height: `${bar * 3}px` }}
                      />
                    ))}
                  </span>
                  {isConnected ? strengthMeta.label : "--"}
                </span>
              </div>
              {isConnected && network.effectiveType && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">NETWORK</span>
                  <span className="text-gray-200 uppercase">
                    {network.effectiveType}
                    {network.downlinkMbps !== null
                      ? ` · ${network.downlinkMbps} Mbps`
                      : ""}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-gray-300">VOICE_ID</span>
                <span className="text-gray-200">FLARE_V2</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-300">CPU LOAD</span>
                <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary shadow-[0_0_10px_rgba(0,238,255,0.8)] transition-all duration-500"
                    style={{ width: isConnected ? "45%" : "12%" }}
                  />
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-300 flex items-center gap-1"><Eye size={10} />CAMERA</span>
                <span className={`font-extrabold flex items-center gap-1 ${camera.isCameraOn ? "text-green-400" : "text-gray-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${camera.isCameraOn ? "bg-green-400 animate-pulse" : "bg-gray-500"}`}></span>
                  {camera.isCameraOn ? "ACTIVE" : "OFF"}
                </span>
              </div>
              {camera.isCameraOn && vision.isAnalyzing && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-300">VISION</span>
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

        {/* Bottom Stage: FLARE text + controls — anchored to the bottom of the
            screen, rendered above the full-page visualizer background
            (Main Container is z-10, visualizer is z-0) */}
        <main className="flex-grow flex flex-col items-center justify-end relative pb-12 md:pb-16">
          {/* AI Status Text */}
          <div className="text-center">
            <h1 className="text-3xl md:text-4xl font-normal tracking-tight text-white neon-text mb-2">FLARE</h1>
            <p className="text-primary/60 font-mono text-sm tracking-[0.3em] uppercase animate-pulse">
              {isConnected
                ? (isSpeaking
                    ? "Speaking..."
                    : (isListening
                        ? "Listening..."
                        : "Processing..."))
                : "Ready"}
            </p>
          </div>

          {/* Controls — centered below status text */}
          <div className="mt-6 pointer-events-auto">
            <Controls
              visible={!isUiHidden}
              isConnected={isConnected}
              isConnecting={isConnecting}
              isMuted={isMuted}
              isCameraOn={camera.isCameraOn}
              interruptEnabled={interruptEnabled}
              onStart={startConversation}
              onEnd={endConversation}
              onToggleMute={toggleMute}
              onInterrupt={interrupt}
              onToggleCamera={handleToggleCamera}
            />
          </div>
        </main>

        {/* Bottom Interface Layer */}
        <footer className="fixed bottom-0 left-0 w-full z-20 flex justify-end p-4 md:p-10 pointer-events-none">
          <div className="pointer-events-auto">
            <Transcript visible={!isUiHidden} messages={messages} />
          </div>
        </footer>

        {/* Floating draggable Vision Feed window (hidden on mobile) */}
        <div className="hidden md:block">
          <CameraFeed
            visible={!isUiHidden}
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
          visible={!isUiHidden}
          windows={imageGen.windows}
          onClose={imageGen.closeWindow}
          onFocus={imageGen.focusWindow}
          onPositionChange={imageGen.updateWindowPosition}
        />

        {/* Floating 3D object viewer windows (from camera → 3D scans) */}
        <ObjectViewerManager
          visible={!isUiHidden}
          windows={objectScan.windows}
          onClose={objectScan.closeWindow}
          onFocus={objectScan.focusWindow}
          onPositionChange={objectScan.updateWindowPosition}
        />

        {/* Map popup (location / distance lookups) */}
        <MapPopup visible={!isUiHidden} popup={mapPopup.popup} onClose={mapPopup.close} />

        {/* Interactive face-analysis popup (age / gender / color analysis) */}
        <FaceAnalysisPopup
          visible={!isUiHidden}
          isOpen={faceAnalysis.isOpen}
          isAnalyzing={faceAnalysis.isAnalyzing}
          isPreviewing={faceAnalysis.isPreviewing}
          previewStream={faceAnalysis.previewStream}
          capturedDataUrl={faceAnalysis.capturedDataUrl}
          result={faceAnalysis.result}
          error={faceAnalysis.error}
          onClose={faceAnalysis.close}
        />



      </div>

      {/* Multi-camera settings sidebar (toggle: A key or gear icon) */}
      <SettingsSidebar
        isOpen={isSettingsOpen}
        devices={camera.devices}
        objectCameraId={camera.objectCameraId}
        faceCameraId={camera.faceCameraId}
        onObjectCameraChange={camera.setObjectCameraId}
        onFaceCameraChange={camera.setFaceCameraId}
        onRefreshDevices={camera.refreshDevices}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Bottom-left cluster: settings gear + interrupt mode toggle */}
      <div className="fixed bottom-4 left-4 md:bottom-8 md:left-8 z-50 pointer-events-auto flex items-center gap-2">
        {/* Settings gear (opens the multi-camera sidebar) */}
        <button
          onClick={() => setIsSettingsOpen((prev) => !prev)}
          title="Camera settings (A)"
          className={`group flex items-center justify-center w-10 h-10 glass-panel rounded-full border transition-all duration-300 focus:outline-none ${
            isSettingsOpen
              ? "border-primary text-primary shadow-[0_0_15px_rgba(0,238,255,0.3)]"
              : "border-gray-600 text-gray-400 hover:border-primary/50 hover:text-primary/70"
          }`}
        >
          <Settings size={16} className={`transition-transform duration-300 ${isSettingsOpen ? "rotate-90" : ""}`} />

        </button>

        {/* Interrupt mode toggle */}
        <button
          onClick={() => setInterruptEnabled((prev) => !prev)}
          title="Toggle interrupt mode (O)"
          className={`group flex items-center gap-2 glass-panel px-3 py-2 rounded-full border transition-all duration-300 focus:outline-none ${
            interruptEnabled
              ? "border-primary text-primary shadow-[0_0_15px_rgba(0,238,255,0.3)] hover:bg-primary hover:text-background-dark"
              : "border-gray-600 text-gray-500 hover:border-primary/50 hover:text-primary/70"
          }`}
        >
          <Hand size={16} />
          <span className="text-[10px] font-mono tracking-wider uppercase">
            {interruptEnabled ? "Interrupt: On" : "Interrupt: Off"}
          </span>
        </button>
      </div>


      {/* Version badge */}
      <div className="fixed bottom-2 right-3 z-50 font-mono text-[10px] text-primary/30 select-none pointer-events-none tracking-widest">
        v{__APP_VERSION__}
      </div>
    </div>
  );
}

export default App;
