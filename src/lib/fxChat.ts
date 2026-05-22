// FX Chatbot Tutor — custom LLM backend wrapped for Akool retelling mode.
// Docs: FX.CHATBOT.TUTOR.postman_collection May 2025.json (RAG Chatbot endpoint).
//
// Usage:
//   const reply = await chatWithFx("hi there", history);
//   history is an array of { user?: string; ai?: string } turns (oldest first).

export interface FxChatTurn {
  user?: string;
  ai?: string;
}

export interface FxChatResponse {
  text: string;
  sources: unknown[];
  model?: string;
  expression_model?: string;
}

const BASE_URL = (import.meta.env.VITE_FX_BASE_URL as string | undefined)?.replace(/\/+$/, "");
const TOKEN = import.meta.env.VITE_FX_TOKEN as string | undefined;
const PASSPHRASE = import.meta.env.VITE_FX_PASSPHRASE as string | undefined;
const CONFIG_ID = import.meta.env.VITE_FX_CONFIG_ID as string | undefined;
const APP_ID = import.meta.env.VITE_FX_APP_ID as string | undefined;
const USE_EXPRESSION = (import.meta.env.VITE_FX_USE_EXPRESSION as string | undefined) === "true";

export const isFxConfigured = (): boolean =>
  Boolean(BASE_URL && TOKEN && PASSPHRASE && CONFIG_ID && APP_ID);

/**
 * Call the FX RAG chat endpoint. Returns the assistant text reply.
 * Throws if the FX backend is not fully configured or the request fails.
 */
export async function chatWithFx(prompt: string, history: FxChatTurn[] = []): Promise<FxChatResponse> {
  if (!isFxConfigured()) {
    throw new Error("FX LLM not configured (missing VITE_FX_* env vars)");
  }
  const url = `${BASE_URL}/api/chat?passphrase=${encodeURIComponent(PASSPHRASE!)}&config_id=${encodeURIComponent(CONFIG_ID!)}&app_id=${encodeURIComponent(APP_ID!)}`;

  // FX expects multipart/form-data per Postman collection.
  const form = new FormData();
  form.append("prompt", prompt);
  if (history.length > 0) {
    form.append("chat_history", JSON.stringify(history));
  }
  if (USE_EXPRESSION) {
    form.append("use_expression", "true");
  }
  // Never request use_audio — Akool handles TTS, we only want text back.

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`FX chat HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = await res.json();
  if (json?.status !== "OK" || !json?.data) {
    throw new Error(`FX chat error: ${json?.message || JSON.stringify(json).slice(0, 200)}`);
  }
  const text: string = json.data.text ?? json.data.answer ?? "";
  if (!text.trim()) {
    throw new Error("FX chat returned empty text");
  }
  return {
    text: text.trim(),
    sources: json.data.sources ?? [],
    model: json.data.model,
    expression_model: json.data.expression_model,
  };
}
