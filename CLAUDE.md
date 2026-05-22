# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Start Vite dev server
npm run build      # Type-check + Vite production build (tsc -b && vite build)
npm run lint       # ESLint
npm run preview    # Preview production build
```

No test suite is configured.

## Environment Setup

Copy `.env.example` to `.env` before running. The app requires two sets of credentials:

- **Akool** (`VITE_AKOOL_CLIENT_ID`, `VITE_AKOOL_CLIENT_SECRET`, `VITE_AKOOL_AVATAR_ID`) — required for streaming avatar. Without these, the app falls back to a static SVG.
- **ElevenLabs** (`VITE_ELEVENLABS_API_KEY`, `VITE_ELEVENLABS_VOICE_ID`) — used for TTS voice inside the Akool `fast_dialogue` session. Without this, Akool uses its own built-in voice.

Optional: `VITE_AKOOL_KNOWLEDGE_ID` feeds a knowledge base to Akool's LLM; `VITE_AKOOL_LLM_PROVIDER` sets a custom LLM provider.

## Architecture

### Screen state machine (`src/App.tsx`)
All navigation is managed by a single `screen` state string (`AppScreen` union type in `src/types.ts`). `AnimatePresence` + Framer Motion handles transitions. The `useEffect` that watches `avatar.messages` is the voice-driven navigation layer — it calls `parseIntent` on the last user message and calls `setScreen`.

### Avatar system (`src/hooks/useAkoolAvatar.ts`)
The core hook. On mount it:
1. Fetches an Akool API token
2. Creates a `fast_dialogue` streaming session (v4 API) with a 5-retry loop for busy-avatar errors
3. Joins an **Agora RTC** channel using credentials from the session response
4. Publishes a mic track so Akool STT hears the user
5. Starts a browser `SpeechRecognition` shadow to populate `messages[]` for in-app chat log and voice navigation

Modes: `"initializing"` → `"streaming"` (Akool connected) or `"static"` (fallback). Session ID is persisted to `localStorage` so stale sessions can be closed on next page load.

The hook returns a stable `UseAkoolAvatarReturn` interface; all screens receive the full avatar object as a prop named `avatar`.

### Video rendering (`src/components/LumiAvatar.tsx`)
Agora's video track is rendered into a hidden off-screen `<div>` (positioned `fixed`, `opacity: 0`, `z-index: -1`). A `requestAnimationFrame` loop reads frames from the hidden `<video>` element and draws them to a visible `<canvas>`, applying a **chroma-key** algorithm that removes white/near-white backgrounds (the Akool avatar is recorded against white). Temporal smoothing (`ALPHA_SMOOTH = 0.55`) reduces flicker.

### Voice navigation (`src/hooks/useVoiceNav.ts`)
Pure keyword matching against `avatar.messages`. Topic keywords are checked before generic navigation keywords so "tell me about solar" routes to `topic-detail` rather than being ignored. Navigation from voice only works on `main-menu`, `topic-select`, and `topic-detail` screens — not mid-conversation screens.

### Legacy hook (`src/hooks/useElevenLabsAgent.ts`)
Wraps the `@elevenlabs/client` `Conversation` SDK. No longer used by `App.tsx` but kept in the codebase. The active avatar system is entirely Akool (`useAkoolAvatar`).

### Topics (`src/types.ts`)
Four static topics: `solar`, `ev`, `battery`, `ai`. The `TOPICS` array and `TopicId` type are the single source of truth; screens import from there rather than duplicating data.

## Key Design Decisions

- **Singleton session guard**: `_activeSessionId` and `_initInProgress` module-level variables prevent React StrictMode's double-invoke from creating duplicate Akool sessions.
- **Dev HUD**: `App.tsx` renders a debug overlay (screen name, avatar mode, Akool connection state) when `import.meta.env.DEV` is true. Remove it before going to production.
- **Asset preloading**: Figma asset URLs are preloaded in `App.tsx`; the loading screen waits for all of them with an 8-second hard timeout fallback.
- **Background replacement**: SVGs in `public/backgrounds/` and `public/icons/` are placeholders. Icons in `public/icons/` match `TopicId` names.
