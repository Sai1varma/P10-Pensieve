// "Expand this idea" (item 11 MVP). Generates 3-5 candidate sub-ideas for a
// node from its text + ancestor chain, via whichever OpenAI-compatible
// provider the caller's Settings picked (src/board/settings.ts). The
// provider's API key never leaves this function -- the client only ever
// sends {provider, model}.
//
// Deploy: `supabase functions deploy expand-idea`
// Secrets (Dashboard -> Edge Functions -> Secrets, or `supabase secrets set`):
//   one <PROVIDER>_API_KEY per provider you want live -- see PROVIDER_CONFIG
//   below. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are
//   auto-injected by Supabase, no setup needed.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_DOMAIN = "@people10.com";
const DAILY_CAP = 50;

type ProviderId = "openai" | "deepseek" | "groq" | "mistral" | "xai" | "gemini";

// Hardcoded on purpose -- never take a base URL from the client (SSRF guard).
// Keep in sync with PROVIDER_LABELS in src/board/settings.ts.
const PROVIDER_CONFIG: Record<ProviderId, { baseUrl: string; envKey: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1/chat/completions", envKey: "OPENAI_API_KEY" },
  deepseek: { baseUrl: "https://api.deepseek.com/chat/completions", envKey: "DEEPSEEK_API_KEY" },
  groq: { baseUrl: "https://api.groq.com/openai/v1/chat/completions", envKey: "GROQ_API_KEY" },
  mistral: { baseUrl: "https://api.mistral.ai/v1/chat/completions", envKey: "MISTRAL_API_KEY" },
  xai: { baseUrl: "https://api.x.ai/v1/chat/completions", envKey: "XAI_API_KEY" },
  // Google's OpenAI-compatibility layer -- double-check this path against
  // Google's current docs before relying on it; it's the newest/least
  // battle-tested of this set.
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    envKey: "GEMINI_API_KEY",
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "Not signed in." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Verify the caller's identity -- this endpoint doesn't go through
  // `boards`' RLS at all, so domain restriction has to be enforced here.
  const authClient = createClient(supabaseUrl, anonKey);
  const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
  const email = userData?.user?.email ?? null;
  if (userError || !email || !email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
    return json({ error: "Not authorized." }, 401);
  }

  let body: { nodeText?: string; ancestorTexts?: string[]; provider?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const { nodeText, ancestorTexts, provider, model } = body;
  if (!nodeText || !provider || !model) {
    return json({ error: "Missing nodeText, provider, or model." }, 400);
  }
  const config = PROVIDER_CONFIG[provider as ProviderId];
  if (!config) return json({ error: `Unknown provider "${provider}".` }, 400);
  const apiKey = Deno.env.get(config.envKey);
  if (!apiKey) return json({ error: `${provider} isn't configured on the server yet.` }, 400);

  // Service-role client: bypasses RLS by design -- only this function ever
  // touches ai_usage, which has zero policies (default-deny for everyone
  // else, including the caller's own authenticated session).
  const serviceClient = createClient(supabaseUrl, serviceRoleKey);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await serviceClient
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= DAILY_CAP) {
    return json({ error: `Daily AI limit reached (${DAILY_CAP}/day). Try again tomorrow.` }, 429);
  }

  const context = (ancestorTexts ?? []).join(" > ");
  const systemPrompt =
    "You are a brainstorming assistant helping a senior engineering team expand an idea. " +
    "Given a topic and the chain of parent topics it sits under, generate 3 to 5 concise, " +
    "concrete, non-generic sub-ideas that expand on it. Respond with ONLY a JSON array of " +
    "strings, no markdown, no code fences, no explanation. Each string is a short phrase, " +
    "under 12 words.";
  const userPrompt = context
    ? `Context (top-level to immediate parent): ${context}\nTopic to expand: ${nodeText}`
    : `Topic to expand: ${nodeText}`;

  let aiRes: Response;
  try {
    aiRes = await fetch(config.baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.8,
      }),
    });
  } catch {
    return json({ error: `Could not reach ${provider}.` }, 502);
  }
  if (!aiRes.ok) {
    const detail = await aiRes.text().catch(() => "");
    return json({ error: `${provider} returned an error (${aiRes.status}). ${detail.slice(0, 200)}` }, 502);
  }

  const payload = await aiRes.json().catch(() => null);
  const content: string | undefined = payload?.choices?.[0]?.message?.content;
  if (!content) return json({ error: "The AI returned an empty response." }, 502);

  // Models sometimes wrap JSON in a ```json fence despite instructions --
  // strip fences and grab the first [...] substring before parsing.
  const cleaned = content.replace(/```[a-z]*\n?/gi, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  let ideas: unknown;
  try {
    ideas = JSON.parse(match ? match[0] : cleaned);
  } catch {
    return json({ error: "Could not parse the AI's response." }, 502);
  }
  if (!Array.isArray(ideas) || !ideas.every((i) => typeof i === "string")) {
    return json({ error: "The AI's response wasn't in the expected format." }, 502);
  }

  await serviceClient.from("ai_usage").insert({ user_email: email });

  return json({ ideas: ideas.slice(0, 5) });
});
