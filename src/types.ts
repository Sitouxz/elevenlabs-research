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

export const TOPICS: Topic[] = [
  {
    id: "solar",
    label: "SOLAR",
    sublabel: "ENERGY",
    icon: "/icons/solar.svg",
    bgImage: "/backgrounds/solar-bg.svg",
    titlePrefix: "UNDERSTANDING",
    titleMain: "SOLAR ENERGY",
  },
  {
    id: "ev",
    label: "EV",
    sublabel: "CHARGING",
    icon: "/icons/ev.svg",
    bgImage: "/backgrounds/ev-bg.svg",
    titlePrefix: "UNDERSTANDING",
    titleMain: "EV CHARGING",
  },
  {
    id: "battery",
    label: "BATTERY",
    sublabel: "STORAGE",
    icon: "/icons/battery.svg",
    bgImage: "/backgrounds/battery-bg.svg",
    titlePrefix: "UNDERSTANDING",
    titleMain: "BATTERY STORAGE",
  },
  {
    id: "ai",
    label: "AI IN",
    sublabel: "ENERGY",
    icon: "/icons/ai.svg",
    bgImage: "/backgrounds/ai-bg.svg",
    titlePrefix: "UNDERSTANDING",
    titleMain: "AI IN ENERGY",
  },
];
