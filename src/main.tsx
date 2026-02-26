import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Suppress known ElevenLabs SDK bug: the internal AudioWorklet fires
// sendMessage after the WebSocket closes. This is harmless — the SDK
// doesn't guard its own onInputWorkletMessage handler.
const _origConsoleError = console.error;
const _origConsoleWarn = console.warn;
const WS_CLOSED_MSG = "WebSocket is already in CLOSING or CLOSED state";
console.error = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes(WS_CLOSED_MSG)) return;
  _origConsoleError.apply(console, args);
};
console.warn = (...args: any[]) => {
  if (typeof args[0] === "string" && args[0].includes(WS_CLOSED_MSG)) return;
  _origConsoleWarn.apply(console, args);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
