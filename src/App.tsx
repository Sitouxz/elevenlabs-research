import { useCallback, useEffect, useRef, useState } from "react";
import { IntroVideo } from "./components/IntroVideo";
import { Visualizer } from "./components/Visualizer";
import { Controls } from "./components/Controls";
import { Transcript } from "./components/Transcript";
import { CameraFeed } from "./components/CameraFeed";
// import { ImageStudio } from "./components/ImageStudio";
import { ImageWindowManager } from "./components/ImageWindowManager";
import { useElevenLabs } from "./hooks/useElevenLabs";
import { useCamera } from "./hooks/useCamera";
import { useVision } from "./hooks/useVision";
import { useImageGeneration } from "./hooks/useImageGeneration";
import {
  checkPromptSafety,
  getModerationRefusalMessage,
} from "./utils/contentModeration";
import { compute as runCompute, type ComputeOperation } from "./utils/compute";
import { Activity, ShieldCheck, Eye, Hand } from "lucide-react";

const AGENT_ID = import.meta.env.VITE_ELEVENLABS_AGENT_ID || "PASTE_YOUR_AGENT_ID_HERE";

// ponytail: flip to switch the "must say Flare/Flair to get a response" gate
// on or off — Vite HMR picks it up immediately, no other code to touch.
const REQUIRE_WAKE_WORD = true;

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
        return `Generating an image of "${promptStr}"${refNote}. It will appear on screen in a moment.`;
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
      compute: ({ task, text, substring, n, birth_year, target_year, expression, case_sensitive, char_a, char_b }) => {
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

        const opMap: Record<string, ComputeOperation | null> = {
          age: { task: "age", birthYear: opBirthYear, targetYear: opTargetYear },
          count_occurrences: { task: "count_occurrences", text: opText, substring: opSub, caseSensitive: opCaseSensitive },
          count_words: { task: "count_words", text: opText },
          nth_word: { task: "nth_word", text: opText, n: opN },
          reverse_without_vowels: { task: "reverse_without_vowels", text: opText },
          scramble: { task: "scramble", text: opText },
          swap_chars: { task: "swap_chars", text: opText, charA: opCharA, charB: opCharB },
          arithmetic: { task: "arithmetic", expression: opExpr },
        };

        const operation = opMap[opTask];
        if (!operation) {
          return `Unknown compute task "${opTask}". Available tasks: age, count_occurrences, count_words, nth_word, reverse_without_vowels, scramble, swap_chars, arithmetic.`;
        }
        return runCompute(operation);
      },
    });
    console.log(
      "[FLARE] Client tools registered: generate_image, generate_video, scan_camera, " +
      "mute_microphone, unmute_microphone, should_respond, compute. " +
      "NOTE: For voice triggers to work, all tools must ALSO be declared " +
      "on the agent dashboard. See README for instructions."
    );
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
        ? `\n\nCRITICAL RULE — Before responding to ANY user message, you MUST call ` +
          `the should_respond tool with the user's exact message. ` +
          `\n\nIf the tool returns a response starting with "SILENT", your ENTIRE ` +
          `response must be exactly a single dot character: "." and nothing else. ` +
          `No words, no explanation, no apology — just "." ` +
          `\n\nIf the tool returns a response starting with "RESPOND", reply naturally ` +
          `and helpfully. ` +
          `\n\ncalling should_respond is ONLY a gate that decides whether you speak at ` +
          `all — it is NOT a substitute for any other tool call, and saying should_respond ` +
          `returned "RESPOND" does not fulfill the user's request by itself. If the ` +
          `user's message asks you to DO something (generate an image or video, scan the ` +
          `camera, mute/unmute the mic, or any precise counting/math/indexing/string task), ` +
          `you MUST call should_respond first, AND THEN, in that same turn, ALSO call the ` +
          `specific tool for that action (e.g. generate_image, generate_video, scan_camera, ` +
          `mute_microphone, unmute_microphone, compute) before or while you speak. NEVER say ` +
          `things like "I'll generate that for you" or "sure, one ` +
          `moment" and then stop without actually calling the action tool — a spoken promise ` +
          `to do something is meaningless unless the corresponding tool call actually happens ` +
          `in the same turn. You are allowed and expected to call more than one tool per turn. ` +
          `\n\nThe ONLY exception is your very first greeting after connecting — ` +
          `you may greet the user once without calling the tool. `
        : `\n\nCRITICAL RULE — Respond immediately to every user message, without ` +
          `waiting for them to say your name first. ` +
          `\n\nIf the user's message asks you to DO something (generate an image or ` +
          `video, scan the camera, mute/unmute the mic, or any precise counting/math/indexing/string ` +
          `task), you MUST ALSO call the specific tool for that action (e.g. generate_image, ` +
          `generate_video, scan_camera, mute_microphone, unmute_microphone, compute) before or ` +
          `while you speak. NEVER say things like "I'll generate that for you" or "sure, one ` +
          `moment" and then stop without actually calling the action tool — a spoken promise ` +
          `to do something is ` +
          `meaningless unless the corresponding tool call actually happens in the same ` +
          `turn. You are allowed and expected to call more than one tool per turn. `;

      const precisionRule =
        `\n\nCRITICAL RULE — For any request that requires precise counting, arithmetic, ` +
        `dates/ages, word indexing, or exact string manipulation, do NOT guess or rely on ` +
        `mental reasoning. Call the compute tool with the correct task and parameters, then ` +
        `read the result back to the user. ` +
        `\n\nUse compute for: exact word counts (e.g. "reply in exactly 15 words"), ` +
        `letter/substring counts, age in a given year, finding the Nth word, reversing ` +
        `strings with or without vowels, scrambling words, swapping characters, and basic ` +
        `arithmetic. ` +
        `\n\nExamples: ` +
        `- "How old in 2027 if born in 1997?" → task=age, birth_year=1997, target_year=2027. ` +
        `- "Reply in exactly 15 words" → draft your response, call task=count_words with ` +
        `text=<your draft>, and adjust until the count is exactly 15 before speaking. ` +
        `- "How many a's in 'A data analyst...'?" → task=count_occurrences, ` +
        `text=<the phrase>, substring="a". ` +
        `- "What is the 5th word?" → task=nth_word, text=<the phrase>, n=5. ` +
        `- "Reverse 'informatics' without vowels" → task=reverse_without_vowels, text="informatics". ` +
        `- "Scramble 'informatics'" → task=scramble, text="informatics". ` +
        `- "Switch N and F in 'informatics'" or "Reverse the N and F in 'informatics'" ` +
        `→ task=swap_chars, text="informatics", char_a="n", char_b="f". `;

      const formatRule =
        `\n\nCRITICAL RULE — Preserve all formatting characters the user asks for. ` +
        `Never strip or spell out currency symbols ($, €, £), date/time punctuation ` +
        `(slashes, colons, commas, AM/PM), arithmetic operators (+, -, *, /, =), ` +
        `percent signs, decimal points, or other special characters. Echo the exact ` +
        `formatted result from any tool (e.g. the compute tool) without rewriting it ` +
        `into plain words.`;

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
        `Today's date is ${dateStr} (${isoDate}). Use this exact date as the reference for all day/date calculations. ` +
        `\n\nCRITICAL RULE — Whenever your reply contains a number (dates, counts, ` +
        `quantities, times, etc.), write it using digits, not spelled-out words — ` +
        `e.g. "6 July 2026" and "3 apples", never "six July two thousand and twenty ` +
        `six" or "three apples". This applies to every message you send, not just the ` +
        `first one. ` +
        gateRule +
        precisionRule +
        formatRule +
        `\n\nDo NOT correct the user ` +
        `if they call you by the wrong name (e.g., Jarvis, Alexa, Siri, Cortana). ` +
        `Just respond naturally without acknowledging the name mix-up. ` +
        `\n\nYou have live camera vision. You CAN see through the user's camera. ` +
        `Whenever the user asks what's on their screen, what you can see, or to look at ` +
        `something, call the scan_camera tool to capture and read the current frame, then ` +
        `answer from its result. Never say you don't have access to the camera. ` +
        `\n\nYou CAN generate images. When the user asks for an image, you MUST ` +
        `actually call the generate_image tool with a detailed prompt describing ` +
        `exactly what they want — do this immediately, in the same turn as your ` +
        `spoken reply. Do NOT just say you will generate it and stop there. ` +
        `\n\nIMPORTANT — Image editing/iteration: When the user asks to modify, ` +
        `edit, or change a previously generated image (e.g. "make it turn left", ` +
        `"change it to white", "add ornaments", "paint him blue"), you MUST pass ` +
        `use_last_image: true in your generate_image call. This tells the system ` +
        `to use the last generated image as a reference, keeping the same subject ` +
        `and style while applying the user's changes. ` +
        `\n\nWhen the user asks for something COMPLETELY NEW and unrelated to the ` +
        `previous image (e.g. they want a different subject entirely), pass ` +
        `use_last_image: false to force a fresh generation without any reference. ` +
        `\n\nIf you're unsure whether the user wants an edit or a brand-new, unrelated ` +
        `image, you can leave use_last_image unset — the system will auto-decide based ` +
        `on how recently the last image was made AND whether the new request shares a ` +
        `subject with it. To be safe, always pass use_last_image: false whenever the ` +
        `user explicitly asks for something new/different/unrelated to what you just ` +
        `generated, so it definitely does NOT reuse the previous image. ` +
        `\n\nSome generate_image/generate_video requests will be automatically ` +
        `refused by the tool itself — for prompts containing profanity, prompts ` +
        `depicting a real person committing a crime or illegal act, or requests to ` +
        `create replicas of ID cards, passports, or other identity documents. When ` +
        `this happens the tool's return value IS the message to say — relay it to ` +
        `the user as your response, don't retry the call, don't apologize further, ` +
        `and don't argue with the refusal. ` +
        `\n\nYou CAN mute and unmute the user's microphone. ` +
        `Whenever the user asks to be muted — for example: "mute me", "mute myself", ` +
        `"stop listening", "don't listen", "be quiet", "stop talking", "I need privacy", ` +
        `or anything indicating they want you to stop hearing them — call the ` +
        `mute_microphone tool immediately. Do NOT argue or explain that you can't ` +
        `mute — just call the tool and it will be done. ` +
        `\n\nNEVER call mute_microphone on your own initiative — not because the user ` +
        `has been silent, not because there was a long pause, not because the camera or ` +
        `conversation has been idle for a while, and not as a guess about what they want. ` +
        `Silence is not a reason to mute. Only call mute_microphone when the user's own ` +
        `words explicitly ask for it. ` +
        `\n\nWhenever the user asks to be unmuted — for example: "unmute me", ` +
        `"unmute myself", "start listening", "listen again", "come back", "I'm back", ` +
        `or anything indicating they want you to hear them again — call the ` +
        `unmute_microphone tool immediately. Do NOT argue or explain that you can't ` +
        `unmute — just call the tool and it will be done.`
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
      }, 12_000);
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
      // dropped) until the 12s fallback timeout. The "." text arriving
      // is itself a reliable "turn's over" signal, so open the gate now.
      clearAwaitingAgentTurn();
      setGateMuted(false);
    }
  }, [messages, clearAwaitingAgentTurn, setGateMuted]);

  const wasSpeakingForTurnGateRef = useRef(false);
  useEffect(() => {
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
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isConnected, isConnecting, startConversation, interrupt, handleToggleCamera]);

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
                <span className="text-primary">{isConnected ? "24ms" : "--"}</span>
              </div>
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
      </div>

      {/* Interrupt mode toggle */}
      <div className="fixed bottom-4 left-4 md:bottom-8 md:left-8 z-50 pointer-events-auto">
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
