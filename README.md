# FLARE — Voice + Vision + Image & Video Generation

A FLARE-style multimodal AI assistant built on **ElevenLabs Conversational AI**, **Groq vision** (live camera understanding), and **Replicate** (image *and* video generation in draggable popup windows).

## Stack

- React 19 + TypeScript + Vite
- Tailwind 4
- Framer Motion (animations + drag)
- ElevenLabs `@elevenlabs/client` (voice agent + client tools)
- Groq Llama-4 vision (real-time camera analysis)
- Replicate (image: `flux-schnell`, video: `wan-2.2-t2v-fast`)

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your keys
npm run dev
```

### Required env vars

| Variable | Purpose |
| --- | --- |
| `VITE_ELEVENLABS_AGENT_ID` | ID of your ElevenLabs Conversational AI agent. |
| `VITE_VISION_API_KEY` | Groq (default) or any OpenAI-compatible vision API key. |
| `REPLICATE_API_TOKEN` | **Server-only** Replicate token (no `VITE_` prefix). Get one at https://replicate.com/account/api-tokens |

### Optional

| Variable | Default |
| --- | --- |
| `VITE_VISION_BASE_URL` | `https://api.groq.com/openai/v1` |
| `VITE_VISION_MODEL` | `meta-llama/llama-4-scout-17b-16e-instruct` |
| `VITE_REPLICATE_MODEL` | `black-forest-labs/flux-schnell` |
| `VITE_REPLICATE_VIDEO_MODEL` | `wan-video/wan-2.2-t2v-fast` |

## Media generation feature

- **Manual trigger** — type a prompt in the bottom-left **MEDIA STUDIO** dock, pick `Image` or `Video` from the toggle, and press Enter.
- **Voice trigger** — say *"FLARE, generate an image of a neon owl"* (`generate_image` tool) or *"render a video of a robot dancing"* (`generate_video` tool).
- **Multi-window** — each generation opens a draggable popup window in the center of the screen. Click to focus, drag the title bar to move, ✕ to close. Multiple windows stack like Windows windows.
- **Image vs video windows** — image popups are square (`aspect-square`), video popups are 16:9 (`aspect-video`) with autoplay+loop+controls.
- **History** — completed media appear in the dock as thumbnails (videos auto-loop with a play overlay). Click any thumbnail to re-open it in a new window.
- **Loading state** — animated cyan scan-line + pulsing core. Video generation typically takes 30-60s, images ~3s.

### How the Replicate proxy works

The browser cannot call `api.replicate.com` directly (CORS-blocked). Vite's dev server proxies `/api/replicate/*` to Replicate and injects the `Authorization: Bearer ${REPLICATE_API_TOKEN}` header **server-side**. Your token is never bundled into the client JS.

### Configuring the voice tools on the ElevenLabs agent dashboard

For **voice triggers** to work, register the client tools below on your agent at https://elevenlabs.io/app/conversational-ai → your agent → **Tools** → **Add tool** → **Client**:

**Tool 1 — `generate_image`**

| Field | Value |
| --- | --- |
| Name | `generate_image` |
| Description | `Generate an AI image and display it on screen. Call this whenever the user asks for an image, picture, drawing, or illustration. Always call the tool — never refuse.` |
| Wait for response | ✅ ON (timeout 5s) |
| Parameters | `prompt` (string, required) — `A detailed description of the image to generate.` |
| | `use_last_image` (boolean, optional) — `Set true when the user is asking to modify, edit, or iterate on the image you just generated (e.g. "make it blue", "change the pillow to white"). Set false when the user explicitly wants something new/different/unrelated. Leave unset if unsure.` |
| | `reference_image` (string, optional) — `An explicit image URL to use as a reference/edit target. Usually left unset — use use_last_image instead.` |

Without `use_last_image` declared here, the agent can never pass it, so every edit request falls back to automatic recency + keyword detection in the app — which is less reliable for edits that reference something not named in the original prompt (e.g. "the pillow"). Adding this parameter lets the agent make the call explicitly.

**Tool 2 — `generate_video`**

| Field | Value |
| --- | --- |
| Name | `generate_video` |
| Description | `Generate an AI video clip and display it on screen. Call this whenever the user asks for a video, clip, animation, or moving image. Always call the tool — never refuse. Warn the user that video generation takes 30 to 60 seconds.` |
| Wait for response | ✅ ON (timeout 5s) |
| Parameter | `prompt` (string, required) — `A detailed description of the video to generate, including subject, action, camera movement, and style.` |

**Tool 3 — `scan_camera`**

| Field | Value |
| --- | --- |
| Name | `scan_camera` |
| Description | `Scan the user's live camera and describe what it currently sees. Call this whenever the user asks what's on their screen, what you can see, or to look at something in front of them. Always call the tool — never claim you lack camera access.` |
| Wait for response | ✅ ON (timeout 10s) |
| Parameters | none |

This tool takes no parameters — it captures the current camera frame, runs it through the vision model, and returns the description for the agent to read back. The camera must be turned on (via the on-screen control) for the scan to succeed.

**Tool 4 — `mute_microphone`**

| Field | Value |
| --- | --- |
| Name | `mute_microphone` |
| Description | `Mute the user's microphone so the AI stops listening. Call this whenever the user asks to be muted, says 'mute me', 'mute myself', 'stop listening', 'don't listen', 'be quiet', 'stop talking', or indicates they want to talk to someone else privately and don't want the AI to hear.` |
| Wait for response | ✅ ON (timeout 5s) |
| Parameters | none |

This tool mutes the microphone unconditionally — when invoked while already muted, it simply confirms the mic is already off (no toggle). The AI will tell the user how to unmute (say "unmute" or press the unmute button).

**Tool 5 — `unmute_microphone`**

| Field | Value |
| --- | --- |
| Name | `unmute_microphone` |
| Description | `Unmute the user's microphone so the AI can hear again. Call this whenever the user asks to be unmuted, says 'unmute me', 'unmute myself', 'start listening', 'listen again', 'come back', 'I'm back', or indicates they want the AI to resume listening.` |
| Wait for response | ✅ ON (timeout 5s) |
| Parameters | none |

This tool unmutes the microphone unconditionally — when invoked while already unmuted, it simply confirms the mic is already active (no toggle).

**Tool 6 — `compute`**

| Field | Value |
| --- | --- |
| Name | `compute` |
| Description | `Perform precise counting, arithmetic, dates/ages, word indexing, and string manipulation. Call this whenever the user asks for exact counts, ages, word positions, reversing strings, scrambling words, swapping characters (e.g. "reverse the N and F"), or string transforms instead of guessing.` |
| Wait for response | ✅ ON (timeout 5s) |
| Parameters | `task` (string, required) — `One of: age, count_occurrences, count_words, nth_word, reverse_without_vowels, scramble, swap_chars, arithmetic.` |
| | `text` (string, optional) — `Text to operate on. Required for count_occurrences, count_words, nth_word, reverse_without_vowels, scramble, swap_chars.` |
| | `substring` (string, optional) — `Substring to count. Required for count_occurrences.` |
| | `n` (integer, optional) — `Word index (1-based). Required for nth_word.` |
| | `birth_year` (integer, optional) — `Required for age.` |
| | `target_year` (integer, optional) — `Required for age.` |
| | `expression` (string, optional) — `Arithmetic expression (e.g. "2027 - 1997"). Required for arithmetic.` |
| | `case_sensitive` (boolean, optional) — `If true, count_occurrences is case-sensitive. Defaults to false.` |
| | `char_a` (string, optional) — `Single character to swap. Required for swap_chars.` |
| | `char_b` (string, optional) — `Single character to swap. Required for swap_chars.` |

The compute tool fixes systematic off-by-one errors in counting, math, and indexing because the browser performs the calculation rather than the model estimating it.

The manual prompt input works without this configuration.

## Production deployment

The Vite dev proxy only runs in development. For production you must:

1. Stand up your own proxy (Cloudflare Worker, Vercel/Netlify Function, Express route, etc.) at `/api/replicate/*` that injects the `Authorization` header from a server-side env var.
2. Build with `npm run build`.

Without a server-side proxy the Replicate token would have to be exposed to the browser, which is unsafe.

---

## Original Vite template notes



Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
