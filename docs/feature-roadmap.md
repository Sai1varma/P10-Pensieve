# Feature Roadmap — P10 Pensieve

**Status:** Items 1–8, 10 implemented (2026-07-11). 3 and 10 need a Supabase SQL change run manually before they're live (see commit messages / chat history for the exact SQL) — everything else is fully live. 9 and 11 are intentionally not started (see below). A "whiteboard" board kind (freeform cards, no hierarchy) also shipped this session — not originally on this roadmap, came out of a separate conversation about the tree-only data model.

A PM-lens pass on what would give the most value to P10 Pensieve's actual users: senior People10 staff running brainstorms and reviews for the AI-first rebrand, working solo and live with colleagues, presenting to stakeholders. Ranked by value-for-effort, not just novelty.

Effort estimates assume the existing stack (React + TS + Vite, Supabase for auth/data/realtime, no other backend) and this codebase's own conventions (reducer actions, `Record<id,Block>` normalized state, hand-rolled UI, no new dependencies unless noted).

---

## Quick wins (low effort, solid value)

### 1. Board insights dashboard ✅ Implemented
A small summary panel (toolbar button → modal or side panel) showing: status breakdown (N idea / N exploring / N decided / N parked), top-voted nodes, nodes per owner, total node count. All of this data already exists on every `Block` (`status`, `votes`, `owner`) — this is pure aggregation, no new data model.
**Value:** Turns a brainstorm into a decision. Right now the only way to see "what did we actually decide" is scrolling the whole tree. Directly serves the stated use case (People10 review meetings).
**Effort:** ~1 day. New component + a few `useMemo` aggregations over `board.blocks`. No backend changes.

### 2. Board templates on creation ✅ Implemented
Right now "New board" always seeds the same generic 3-category starter tree. Offer a small picker (SWOT, Feature brainstorm, Retro, OKR tree, or blank) when creating a board.
**Value:** Faster start, more consistent structure across the team's boards — especially now that multiple boards are a first-class concept.
**Effort:** ~half a day. A few alternate `seedBoard()`-style functions + a picker step in the "New board" modal already built this session.

### 3. Read-only / view-only share link ✅ Implemented — needs SQL run to go live
"Export as link" produces a static, importable snapshot; "Go Live" requires a `@people10.com` sign-in. There's no link you can hand to an external stakeholder (a client, a vendor) that just *shows* the live board without letting them edit or requiring them to sign in.
**Value:** Lets you share real-time progress with people outside the domain-gated auth, safely (no accidental edits, no need to grant them an account).
**Effort:** ~1 day. A `?board=<id>&view=1` mode: skip the auth gate for read access (needs an RLS policy allowing anonymous `select` scoped to a single row by id — a small, contained Supabase change), keep the existing realtime subscription for live updates, hide all editing UI.

### 4. Command palette (Cmd/Ctrl+K) ✅ Implemented
Fuzzy-search across: jump to any node (by text), switch boards, run toolbar actions (export, present, reset), all from one keyboard-driven overlay.
**Value:** Real productivity win for the power users who'll use this daily; matches "senior engineer who ships in production" energy over hunting through menus.
**Effort:** ~1–2 days. One new component, reuses existing search/dispatch plumbing; no new dependency needed (the existing hand-rolled dropdown/modal patterns cover it).

### 5. Presence-aware node indicators ✅ Implemented
Today presence (`useCollab.ts`) shows *who's online*, but not *what they're looking at*. Add a small visual indicator (colored ring or avatar) on whichever node each present user currently has open/focused, sourced from the same presence channel.
**Value:** Reduces edit collisions in live sessions — the exact failure mode the whole-board last-write-wins sync model is exposed to (near-simultaneous edits to different nodes can overwrite each other). Cheap because the plumbing — presence channel, member colors — already exists.
**Effort:** ~half a day – 1 day. Extend the presence payload with a `focusedId`, broadcast it on `onNodeClick`/side-panel open, render as a small indicator in `BlockNode.tsx`. No schema change, no new dependency.

---

## Medium effort, high value

### 6. Cross-node references (non-hierarchical links) ✅ Implemented
The tree is strictly parent-child today. Add the ability to draw a lightweight "relates to" connection between two arbitrary nodes (e.g., "this risk relates to that feature"), rendered as a dashed edge distinct from the tree structure.
**Value:** Real brainstorms aren't strict trees — ideas relate across branches. This is the single biggest structural limitation of the current data model.
**Effort:** ~2–3 days. Additive `Block.relatedIds?: ID[]` field, a small UI affordance to link two nodes (e.g., drag with a modifier key, or "Link to…" in the node menu), extra edges in `Canvas.tsx`'s edge list. No change to the tree/layout logic itself.

### 7. Per-node comment threads ✅ Implemented
Today there's one `note` field per node. Add threaded comments (author, timestamp, text) for async discussion without overwriting the note.
**Value:** Enables async review ("I think we should reconsider this — thoughts?") without live presence, which matters since live collab requires everyone online at once.
**Effort:** ~2–3 days. `Block.comments?: Comment[]`, UI in the side panel's `NodeDetails`, reuses existing `owner`/member-name plumbing for attribution. No new backend beyond what's already synced in `data jsonb`.

### 8. Node attachments (images) ✅ Implemented
Attach a screenshot or mockup image to a node.
**Value:** Design/product brainstorms are often visual; a wall of text cards undersells ideas that are inherently visual.
**Effort:** ~3–4 days as originally scoped (Supabase Storage). Actually implemented via the client-compressed-data-URL approach built for whiteboard cards instead — zero new infrastructure, rendered as a small corner thumbnail (not full-width) since the tree layout reserves a fixed height per node.

### 9. Org-wide template/board gallery — not started, prerequisite now shipped
Cloud sync of the board *list* (Phase B of multi-board-feature.md) is implemented — needs a one-line Supabase SQL change run to go live (see that doc / README). Once confirmed live, this item is unblocked.
A "Browse shared boards" view — publish a board as a reusable template or reference example visible to all signed-in `@people10.com` users, separate from your own private board list.
**Value:** Compounds as the org uses this more — best practices and past brainstorms become reusable assets instead of one-off documents.
**Effort:** ~2–3 days *on top of* the in-progress multi-board cloud sync — this is a natural extension of that work (an `is_template`/`is_public` flag on the same `boards` table + a gallery query), not a separate system.

### 10. Change history / activity log ✅ Implemented — needs SQL run to go live
A lightweight audit trail per board — who changed what, when (beyond the ephemeral local undo stack, which resets on reload and doesn't survive collaboration per the earlier bug fix).
**Value:** Accountability and context for "why did this change" in a live-edited shared board, especially once external/broader sharing (item 3, 9) increases the number of hands on a board.
**Effort:** ~3 days. Needs an append-only `board_events` table in Supabase (id, board_id, actor_email, action summary, timestamp), written alongside the existing debounced content upsert. Read-only UI, no reducer changes.

---

## Big bet (high effort, highest strategic fit)

### 11. AI-assisted brainstorming — not started
Deliberately not attempted: the org's AI framework/provider is `TBD` per the positioning doc, and this item explicitly needs its own scoping conversation first.
Given People10 is repositioning as an **AI-first engineering partner**, using AI inside their own internal ideation tool is the most on-brand feature available — "we build AI-first, including for ourselves." Concretely:
- "Expand this idea" — generate 3–5 candidate sub-nodes from a node's text (and its ancestors' context), inserted as a normal editable branch the user can keep, edit, or discard.
- "Summarize this branch / this board" — a stakeholder-ready summary (reuses the existing `toMarkdown()` export as the source text).
- "Find similar ideas" — flag likely-duplicate nodes during a large brainstorm, for merge/dedupe.

**Value:** Not just a productivity feature — a credibility signal. Directly reinforces the company's own positioning claim in a tool their own team uses. High visibility if shown in sales/pitch contexts ("we use this internally").
**Effort:** ~1–2 weeks. Needs new infrastructure this app doesn't have today: a server-side proxy for LLM calls (a Supabase Edge Function is the natural fit — keeps API keys off the client), request/response UI on the node actions toolbar, and rate-limiting/cost controls. The AI framework/provider choice is explicitly `TBD` per this org's own positioning doc, so this would need that decision made first — worth sequencing after the smaller items above, not before.

---

## Suggested sequencing

~~Start with 1–5... Then 6–7... Layer 9 onto the multi-board cloud work...~~ — **1–8 and 10 are done** (2026-07-11); 3 and 10 needed a manual Supabase SQL step, which has been run. What's left:

- **9. Org-wide template/board gallery** — Phase B of `multi-board-feature.md` (cloud-synced board list) is now implemented (needs its SQL run to go live). Layer an `is_template`/`is_public` flag + gallery query on top next.
- **11. AI-assisted brainstorming** — blocked on the org's AI framework/provider decision (`TBD` per `positioning.md`). Surface this to the user and get an explicit decision before implementing anything — do not pick a provider unilaterally.
