export type AppScreen =
  | "splash"
  | "main-menu"
  | "topic-select"
  | "topic-detail"
  | "ask-questions"
  | "scenario-title"
  | "decision"
  | "score"
  | "end-scenario"
  | "naration"
  | "summary";

export type TopicId = "solar" | "ev" | "battery" | "ai";

export interface Topic {
  id: TopicId;
  label: string;
  sublabel: string;
  icon: string;
  bgImage: string;
  titlePrefix: string;
  titleMain: string;
}

const BASE = import.meta.env.BASE_URL;

export const TOPICS: Topic[] = [
  {
    id: "solar",
    label: "SOLAR",
    sublabel: "ENERGY",
    icon: `${BASE}icons/solar.svg`,
    bgImage: `${BASE}backgrounds/solar-bg.svg`,
    titlePrefix: "UNDERSTANDING",
    titleMain: "SOLAR ENERGY",
  },
  {
    id: "ev",
    label: "EV",
    sublabel: "CHARGING",
    icon: `${BASE}icons/ev.svg`,
    bgImage: `${BASE}backgrounds/ev-bg.svg`,
    titlePrefix: "UNDERSTANDING",
    titleMain: "EV CHARGING",
  },
  {
    id: "battery",
    label: "BATTERY",
    sublabel: "STORAGE",
    icon: `${BASE}icons/battery.svg`,
    bgImage: `${BASE}backgrounds/battery-bg.svg`,
    titlePrefix: "UNDERSTANDING",
    titleMain: "BATTERY STORAGE",
  },
  {
    id: "ai",
    label: "AI IN",
    sublabel: "ENERGY",
    icon: `${BASE}icons/ai.svg`,
    bgImage: `${BASE}backgrounds/ai-bg.svg`,
    titlePrefix: "UNDERSTANDING",
    titleMain: "AI IN ENERGY",
  },
];
