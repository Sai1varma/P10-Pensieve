import type { ProviderId } from "../board/settings";
import { getSupabase } from "./supabase";

export interface ExpandIdeaResult {
  ideas?: string[];
  error?: string;
}

/**
 * "Expand this idea" (item 11 MVP): asks the expand-idea Edge Function for
 * 3-5 candidate sub-ideas for a node, given its ancestor chain for context.
 * The Edge Function holds the actual provider API key server-side -- this
 * call only ever carries the caller's own session JWT (attached
 * automatically by supabase-js) plus which provider/model to use.
 */
export async function expandIdea(args: {
  nodeText: string;
  ancestorTexts: string[];
  provider: ProviderId;
  model: string;
}): Promise<ExpandIdeaResult> {
  const sb = getSupabase();
  if (!sb) return { error: "Collaboration isn't configured, so AI features aren't available." };
  const { data, error } = await sb.functions.invoke("expand-idea", { body: args });
  if (error) return { error: error.message || "The AI request failed." };
  return data as ExpandIdeaResult;
}
