# JARVIS — Voice + Vision + Image & Video Generation

A JARVIS-style multimodal AI assistant built on **ElevenLabs Conversational AI**, **Groq vision** (live camera understanding), and **Replicate** (image *and* video generation in draggable popup windows).

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
- **Voice trigger** — say *"JARVIS, generate an image of a neon owl"* (`generate_image` tool) or *"render a video of a robot dancing"* (`generate_video` tool).
- **Multi-window** — each generation opens a draggable popup window in the center of the screen. Click to focus, drag the title bar to move, ✕ to close. Multiple windows stack like Windows windows.
- **Image vs video windows** — image popups are square (`aspect-square`), video popups are 16:9 (`aspect-video`) with autoplay+loop+controls.
- **History** — completed media appear in the dock as thumbnails (videos auto-loop with a play overlay). Click any thumbnail to re-open it in a new window.
- **Loading state** — animated cyan scan-line + pulsing core. Video generation typically takes 30-60s, images ~3s.

### How the Replicate proxy works

The browser cannot call `api.replicate.com` directly (CORS-blocked). Vite's dev server proxies `/api/replicate/*` to Replicate and injects the `Authorization: Bearer ${REPLICATE_API_TOKEN}` header **server-side**. Your token is never bundled into the client JS.

### Configuring the voice tools on the ElevenLabs agent dashboard

For **voice triggers** to work, register two client tools on your agent at https://elevenlabs.io/app/conversational-ai → your agent → **Tools** → **Add tool** → **Client**:

**Tool 1 — `generate_image`**

| Field | Value |
| --- | --- |
| Name | `generate_image` |
| Description | `Generate an AI image and display it on screen. Call this whenever the user asks for an image, picture, drawing, or illustration. Always call the tool — never refuse.` |
| Wait for response | ✅ ON (timeout 5s) |
| Parameter | `prompt` (string, required) — `A detailed description of the image to generate.` |

**Tool 2 — `generate_video`**

| Field | Value |
| --- | --- |
| Name | `generate_video` |
| Description | `Generate an AI video clip and display it on screen. Call this whenever the user asks for a video, clip, animation, or moving image. Always call the tool — never refuse. Warn the user that video generation takes 30 to 60 seconds.` |
| Wait for response | ✅ ON (timeout 5s) |
| Parameter | `prompt` (string, required) — `A detailed description of the video to generate, including subject, action, camera movement, and style.` |

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
