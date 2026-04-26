import { useCallback, useRef } from "react";
import type { AppScreen, TopicId } from "../types";

export interface VoiceNavAction {
  screen?: AppScreen;
  topic?: TopicId;
}

// Conversation context for guided navigation
interface ConversationContext {
  suggestedScreen?: AppScreen;
  suggestedTopic?: TopicId;
  timestamp: number;
  expiresAt: number;
}

// Topic selection requires explicit phrasing — avoids false positives from casual mentions
const TOPIC_EXPLICIT_PHRASES: { topic: TopicId; phrases: string[] }[] = [
  { topic: "solar", phrases: ["solar energy", "choose solar", "select solar", "pick solar", "go to solar", "let's do solar", "explore solar", "i want solar"] },
  { topic: "ev", phrases: ["ev charging", "electric vehicle", "electric car", "choose ev", "select ev", "pick ev", "go to ev", "let's do ev", "explore ev", "i want ev"] },
  { topic: "battery", phrases: ["battery storage", "energy storage", "choose battery", "select battery", "pick battery", "go to battery", "let's do battery", "explore battery", "i want battery"] },
  { topic: "ai", phrases: ["ai in energy", "artificial intelligence energy", "choose ai", "select ai", "pick ai", "go to ai", "let's do ai", "explore ai energy", "i want ai"] },
];

// Require explicit action phrases - must be at start of utterance for high confidence
const EXPLICIT_ACTION_PHRASES = {
  askQuestion: [
    "ask question",
    "ask lumi",
    "i have a question",
    "i want to ask",
    "let me ask",
    "ask a question",
    "want to ask",
    "can i ask",
  ],
  goBack: [
    "go back",
    "back to menu",
    "main menu",
    "go home",
    "go to home",
    "back to main",
    "return to menu",
  ],
  startDiscovery: [
    "start discovery",
    "start discover",
    "begin discovery",
    "show discovery",
    "open discovery",
    "explore topics",
    "show me the topics",
    "show topics",
  ],
};

// Check if phrase is at the start of text or preceded by a boundary (higher confidence)
function hasExplicitPhrase(text: string, phrases: string[]): boolean {
  const lower = text.toLowerCase().trim();
  // Must start with phrase, or phrase must follow "i " or "let " or be at sentence boundary
  for (const phrase of phrases) {
    // Direct start match
    if (lower.startsWith(phrase)) return true;
    // Match after common prefixes (I want to..., Let me..., Can I...)
    const prefixes = ["i ", "let ", "can i ", "please "];
    for (const prefix of prefixes) {
      if (lower.startsWith(prefix + phrase)) return true;
    }
    // Match after punctuation boundaries (prevents matching mid-sentence)
    const boundaries = [". ", "! ", "? ", " "];
    for (const boundary of boundaries) {
      if (lower.includes(boundary + phrase)) {
        // Additional check: phrase must be near start or after a clear intent marker
        const idx = lower.indexOf(boundary + phrase);
        if (idx < 20) return true; // Near beginning of utterance
      }
    }
  }
  return false;
}

// Avatar speech patterns that suggest navigation
const NAVIGATION_SUGGESTIONS = [
  { pattern: /explore (\w+(?:\s+\w+)?)/i, screen: "topic-detail", extractTopic: true },
  { pattern: /learn about (\w+(?:\s+\w+)?)/i, screen: "topic-detail", extractTopic: true },
  { pattern: /ask (?:me |you )?(?:a )?question/i, screen: "ask-questions" },
  { pattern: /go (?:back|home|to menu|to main)/i, screen: "main-menu" },
  { pattern: /check out (?:the )?topics/i, screen: "topic-select" },
  { pattern: /show (?:me )?(?:the )?topics/i, screen: "topic-select" },
  { pattern: /start (?:the )?(?:discovery|exploring)/i, screen: "topic-select" },
  { pattern: /try (?:the )?(\w+(?:\s+\w+)?) (?:challenge|module|topic)/i, screen: "topic-detail", extractTopic: true },
  { pattern: /begin (?:the )?(\w+(?:\s+\w+)?)/i, screen: "topic-detail", extractTopic: true },
  { pattern: /shall we (?:start|begin|go|explore)/i, screen: "topic-select" },
  { pattern: /want to (?:ask|learn|explore)/i, screen: "ask-questions" },
];

// Affirmative responses that accept a navigation suggestion
const AFFIRMATIVE_RESPONSES = [
  "yes", "yeah", "sure", "okay", "ok", "let's go", "lets go",
  "go ahead", "do it", "why not", "absolutely", "of course",
  "sounds good", "that sounds good", "i'd like that", "id like that",
  "please", "yes please", "yeah sure", "okay sure", "all right", "alright"
];

// Topic name mapping for extraction
const TOPIC_MAP: Record<string, TopicId> = {
  'solar': 'solar',
  'solar energy': 'solar',
  'ev': 'ev',
  'ev charging': 'ev',
  'electric vehicle': 'ev',
  'electric vehicles': 'ev',
  'battery': 'battery',
  'battery storage': 'battery',
  'storage': 'battery',
  'energy storage': 'battery',
  'ai': 'ai',
  'artificial intelligence': 'ai',
  'ai in energy': 'ai'
};

export function useVoiceNav() {
  const contextRef = useRef<ConversationContext | null>(null);

  // Update context when avatar suggests navigation
  const updateContextFromAvatar = useCallback((avatarText: string) => {
    const lower = avatarText.toLowerCase();

    for (const suggestion of NAVIGATION_SUGGESTIONS) {
      const match = lower.match(suggestion.pattern);
      if (match) {
        let topic: TopicId | undefined;

        if (suggestion.extractTopic && match[1]) {
          const topicKey = match[1].toLowerCase().trim();
          topic = TOPIC_MAP[topicKey];
        }

        // Store context for 10 seconds
        contextRef.current = {
          suggestedScreen: suggestion.screen as AppScreen,
          suggestedTopic: topic,
          timestamp: Date.now(),
          expiresAt: Date.now() + 10000
        };

        if (import.meta.env.DEV) {
          console.log('[VoiceNav] Context set:', contextRef.current);
        }
        return;
      }
    }
  }, []);

  const parseIntent = useCallback((text: string): VoiceNavAction => {
    const lower = text.toLowerCase().trim();

    // Ignore very short queries (likely noise or fragments)
    if (lower.length < 2) return {};

    const now = Date.now();
    const context = contextRef.current;

    // 1. Check for affirmative response to recent navigation suggestion
    if (context && now < context.expiresAt) {
      const isAffirmative = AFFIRMATIVE_RESPONSES.some(
        response => lower === response || lower.startsWith(response + ' ') || lower.startsWith(response + '!') || lower.startsWith(response + '.')
      );

      if (isAffirmative) {
        if (import.meta.env.DEV) {
          console.log('[VoiceNav] Affirmative response detected:', text, '->', context.suggestedScreen);
        }

        const action: VoiceNavAction = {
          screen: context.suggestedScreen,
          topic: context.suggestedTopic
        };
        contextRef.current = null;
        return action;
      }
    }

    // 2. Context expired, clear it
    if (context && now >= context.expiresAt) {
      contextRef.current = null;
    }

    // 3. Original logic: Ignore very short queries for keyword matching
    if (lower.length < 4) return {};

    // 4. ACTION INTENTS checked with EXPLICIT matching
    if (hasExplicitPhrase(lower, EXPLICIT_ACTION_PHRASES.askQuestion)) {
      return { screen: "ask-questions" };
    }

    if (hasExplicitPhrase(lower, EXPLICIT_ACTION_PHRASES.goBack)) {
      return { screen: "main-menu" };
    }

    if (hasExplicitPhrase(lower, EXPLICIT_ACTION_PHRASES.startDiscovery)) {
      return { screen: "topic-select" };
    }

    // 5. TOPIC SELECTION
    for (const { topic, phrases } of TOPIC_EXPLICIT_PHRASES) {
      for (const phrase of phrases) {
        if (lower.startsWith(phrase)) {
          return { screen: "topic-detail", topic };
        }
        const intentPrefixes = [
          "tell me about ",
          "explain ",
          "what is ",
          "how does ",
          "i want to learn about ",
          "let's learn about ",
        ];
        for (const prefix of intentPrefixes) {
          if (lower.startsWith(prefix + phrase)) {
            return { screen: "topic-detail", topic };
          }
        }
      }
    }

    return {};
  }, []);

  return { parseIntent, updateContextFromAvatar };
}
