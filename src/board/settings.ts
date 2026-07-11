/** App-level preferences, separate from board content -- same "small
 *  localStorage-backed value, no context needed" pattern as THEME_KEY/ME_KEY
 *  in types.ts. Not reactive across components: read once at mount (e.g.
 *  Present's initial mode), written by SettingsPanel. Extensible -- future
 *  sections (e.g. AI model config) add fields here rather than new keys. */

export const SETTINGS_KEY = "blockboard-settings";

/** Providers the "Expand idea" Edge Function knows how to call -- must stay
 *  in sync with the PROVIDER_CONFIG map in supabase/functions/expand-idea.
 *  All of these speak the same OpenAI-style chat-completions request shape. */
export type ProviderId = "openai" | "deepseek" | "groq" | "mistral" | "xai" | "gemini";

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  groq: "Groq",
  mistral: "Mistral",
  xai: "xAI (Grok)",
  gemini: "Google Gemini",
};

export interface AppSettings {
  /** Default traversal order Present mode opens with. Changing this doesn't
   *  affect an already-open presentation -- see Present.tsx's in-bar toggle. */
  presentMode: "depth" | "breadth";
  /** null = AI features not configured on this device -- BlockNode's Expand
   *  button asks the user to set this rather than making a doomed request. */
  aiProvider: ProviderId | null;
  /** Free text (e.g. "deepseek-chat") -- not validated client-side. */
  aiModel: string;
}

const DEFAULT_SETTINGS: AppSettings = { presentMode: "depth", aiProvider: null, aiModel: "" };

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt storage */
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...loadSettings(), ...patch };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable */
  }
  return next;
}
