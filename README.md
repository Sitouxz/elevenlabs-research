# JARVIS — Voice + Vision + Image Generation

A JARVIS-style multimodal AI assistant built on **ElevenLabs Conversational AI**, **Groq vision** (live camera understanding), and **Replicate** (image generation in draggable popup windows).

## Stack

- React 19 + TypeScript + Vite
- Tailwind 4
- Framer Motion (animations + drag)
- ElevenLabs `@elevenlabs/client` (voice agent + client tools)
- Groq Llama-4 vision (real-time camera analysis)
- Replicate (image generation, default `flux-schnell`)

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

## Image generation feature

- **Manual trigger** — type a prompt in the bottom-left **IMAGE STUDIO** dock and press Enter.
- **Voice trigger** — say *"JARVIS, generate an image of a neon owl"* and the agent invokes the `generate_image` client tool.
- **Multi-window** — each generation opens a draggable popup window in the center of the screen. Click to focus, drag the title bar to move, ✕ to close. Multiple windows stack like Windows windows.
- **History** — completed images appear in the dock as thumbnails. Click any thumbnail to re-open the image in a new window.
- **Loading state** — animated cyan scan-line + pulsing core shows while Replicate is generating.

### How the Replicate proxy works

The browser cannot call `api.replicate.com` directly (CORS-blocked). Vite's dev server proxies `/api/replicate/*` to Replicate and injects the `Authorization: Bearer ${REPLICATE_API_TOKEN}` header **server-side**. Your token is never bundled into the client JS.

### Configuring the voice tool on the ElevenLabs agent dashboard

For the **voice trigger** to work, register a client tool on your agent at https://elevenlabs.io/app/conversational-ai:

1. Open your agent → **Tools** → **Add tool** → **Client tool**.
2. Name: `generate_image`
3. Description: `Generate an AI image and display it on screen. Call when the user asks for an image, picture, drawing, or illustration.`
4. Parameter: `prompt` — type `string`, required, description `"A detailed description of the image to generate."`
5. Save.

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
