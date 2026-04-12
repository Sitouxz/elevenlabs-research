import { useCallback } from "react";
import type { AppScreen, TopicId } from "../types";

export interface VoiceNavAction {
  screen?: AppScreen;
  topic?: TopicId;
}

const TOPIC_KEYWORDS: Record<TopicId, string[]> = {
  solar: ["solar", "solar energy", "sun", "photovoltaic", "pv"],
  ev: ["ev", "electric vehicle", "electric car", "charging", "ev charging"],
  battery: ["battery", "battery storage", "energy storage", "store energy"],
  ai: ["ai", "artificial intelligence", "ai in energy", "smart energy", "machine learning"],
};

export function useVoiceNav() {
  const parseIntent = useCallback((text: string): VoiceNavAction => {
    const lower = text.toLowerCase();

    if (
      lower.includes("start discovery") ||
      lower.includes("start discover") ||
      lower.includes("let's start") ||
      lower.includes("lets start") ||
      lower.includes("begin") ||
      lower.includes("discovery")
    ) {
      return { screen: "topic-select" };
    }

    if (
      lower.includes("ask question") ||
      lower.includes("question") ||
      lower.includes("ask lumi") ||
      lower.includes("i have a question")
    ) {
      return { screen: "ask-questions" };
    }

    if (
      lower.includes("go back") ||
      lower.includes("back") ||
      lower.includes("main menu") ||
      lower.includes("home")
    ) {
      return { screen: "main-menu" };
    }

    for (const [topicId, keywords] of Object.entries(TOPIC_KEYWORDS) as [TopicId, string[]][]) {
      if (keywords.some((kw) => lower.includes(kw))) {
        return { screen: "topic-detail", topic: topicId };
      }
    }

    return {};
  }, []);

  return { parseIntent };
}
