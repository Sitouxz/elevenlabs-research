import { useCallback } from "react";
import type { AppScreen, TopicId } from "../types";

export interface VoiceNavAction {
  screen?: AppScreen;
  topic?: TopicId;
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

export function useVoiceNav() {
  const parseIntent = useCallback((text: string): VoiceNavAction => {
    const lower = text.toLowerCase().trim();

    // Ignore very short queries (likely noise or fragments)
    if (lower.length < 4) return {};

    // 1. ACTION INTENTS checked FIRST with EXPLICIT matching
    // Must be at start or clearly intentional, not mid-sentence mentions

    // Ask questions - requires explicit intent phrasing
    if (hasExplicitPhrase(lower, EXPLICIT_ACTION_PHRASES.askQuestion)) {
      return { screen: "ask-questions" };
    }

    // Go back / main menu
    if (hasExplicitPhrase(lower, EXPLICIT_ACTION_PHRASES.goBack)) {
      return { screen: "main-menu" };
    }

    // Start discovery / explore topics
    if (hasExplicitPhrase(lower, EXPLICIT_ACTION_PHRASES.startDiscovery)) {
      return { screen: "topic-select" };
    }

    // 2. TOPIC SELECTION — only match explicit topic phrases at start or clear boundaries
    for (const { topic, phrases } of TOPIC_EXPLICIT_PHRASES) {
      for (const phrase of phrases) {
        // Topic selection must be at the start of the utterance (high confidence)
        // This prevents "Do you have questions about solar energy?" from matching
        if (lower.startsWith(phrase)) {
          return { screen: "topic-detail", topic };
        }
        // Or after clear intent markers like "tell me about", "explain", "what is"
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

  return { parseIntent };
}
