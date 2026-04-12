# ITE Smart Gallery Avatar

An AI-powered interactive kiosk experience featuring **Lumi**, a smart energy guide avatar for the ITE Smart Gallery.

## Stack

- React 19 + TypeScript + Vite
- TailwindCSS v4 + Framer Motion
- ElevenLabs Conversational AI (dual agents)
- Akool Real-Time Streaming Avatar (with static fallback)

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials:

```env
# ElevenLabs — create two agents at https://elevenlabs.io/conversational-ai
VITE_ELEVENLABS_NAV_AGENT_ID=your_nav_agent_id
VITE_ELEVENLABS_QNA_AGENT_ID=your_qna_agent_id

# Akool — get credentials at https://akool.com/dashboard
VITE_AKOOL_CLIENT_ID=your_client_id
VITE_AKOOL_CLIENT_SECRET=your_client_secret
VITE_AKOOL_AVATAR_ID=your_avatar_id
VITE_AKOOL_VOICE_ID=your_voice_id
```

2. Install and run:

```bash
npm install
npm run dev
```

## Screens

| Screen | Trigger |
|--------|---------|
| Splash | App start — speak or tap to continue |
| Main Menu | After splash — shows START DISCOVERY + ASK QUESTIONS |
| Topic Select | Voice: "start discovery" or button click |
| Topic Detail | Voice: topic name or orb click |
| Ask Questions | Voice: "ask questions" or button click — QnA agent activates here only |

## Avatar

- **Primary**: Akool real-time streaming (WebRTC) — requires `VITE_AKOOL_*` env vars
- **Fallback**: Static SVG (`/public/lumi-static.svg`) + ElevenLabs voice if Akool unavailable

## Replacing Assets

- Drop your Lumi avatar PNG at `public/lumi-static.png` (or update path in `LumiAvatar.tsx`)
- Replace background SVGs in `public/backgrounds/` with actual photos/renders
- Replace icon SVGs in `public/icons/` with final artwork
