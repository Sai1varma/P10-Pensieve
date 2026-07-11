# Feature Spec: Multiple Boards + Navigation

**Status:** Phase A and Phase B both implemented and live (2026-07-11). feature-roadmap.md item #9 (org-wide template/board gallery) has since shipped on top of Phase B.

Phase B shipped as: a `owner_email text default (auth.jwt() ->> 'email')` column on `boards` (see README's Supabase setup section for the exact SQL); a new `useBoardIndex` hook (`src/collab/useBoardIndex.ts`) that fetches the signed-in user's own boards and merges them into the *same* switcher list as local boards (open question 1 below resolved as: single merged list, no separate section); a fix to `goLive()` so the cloud row reuses the local board's own id instead of a server-generated one (previously the two never matched, so `markBoardCloudStatus` was dead code and the switcher's "live" dot never actually applied); and a new `adoptRemoteBoard` store method so opening a shared/cloud board registers it under its own id in the local index instead of silently overwriting whatever local board happened to be active. Opening a cloud board never loaded on the current device navigates via a full `?board=<id>` page load (open question 3 resolved as: reuse the existing shared-link bootstrap path rather than building a second in-app connect flow).

## Goal
Let a user keep several independent boards and switch between them, instead of the single board the app holds today. Optionally have that list of boards follow the user across devices.

## Current state (as of this writing)
- **One board.** The whole board is a self-contained object `Board { version:3, rootId, blocks, members? }` persisted to a single `localStorage` key `block-board-v2` (the value is a v3 board; the key name is legacy).
- **Store** (`src/board/store.tsx`) holds exactly one board via `useReducer` + a history (undo/redo) wrapper; debounced persistence writes that one key.
- **Collaboration already supports many boards server-side:** each shared board is its own row in the Supabase `boards` table, addressed by `?board=<uuid>`. `useCollab` (`src/collab/useCollab.ts`) loads/subscribes/upserts a single row. So "multiple boards" is already true for shared boards — what's missing is a *local* registry and UI to manage/switch between boards.

## Open questions (decide before building)
1. **Where does the board list live?**
   - (a) **Local per-device** — simplest; each laptop has its own set of boards. Does NOT follow you across devices.
   - (b) **Cloud-synced list** — boards (or at least the index) live in Supabase so the same list appears on any laptop after sign-in. More work; requires auth to see your boards.
   - *Recommendation:* build (a) first, add (b) as a follow-up. **NOTE from user: they work across different laptops, so (b) is likely wanted — decide whether to do it up front.**
2. **When is a board a Supabase row?**
   - (a) Local-first: a board is local until you click "Go live" (current model, extended to N boards).
   - (b) Cloud-always: every board is a Supabase row from creation.
   - *Recommendation:* keep local-first (a); it preserves offline use and matches the current design.
3. **Delete semantics:** delete locally only, or also remove the shared Supabase row (and thus break existing `?board=` links)? *Recommendation:* delete local by default; offer a separate "delete shared copy" for live boards.

## Proposed approach

### Phase A — Local boards registry + switcher (do first) ✅ Implemented
Additive; no backend changes.

**Data / persistence** (`src/board/store.tsx` or a new `src/board/boards.ts`)
- Add a **boards index** in localStorage: `blockboard-index` = `{ boards: {id, name, updatedAt}[], currentId }`.
- Store each board under its own key, e.g. `blockboard-board-<id>`, instead of the single legacy key. Provide a **one-time migration**: if the legacy `block-board-v2` key exists and the index doesn't, wrap it as the first board ("My board") and populate the index.
- The existing reducer/history logic is unchanged — it just operates on the *active* board; switching boards swaps which board the provider loads and persists.

**Provider changes**
- `BoardProvider` gains: `boards` (index list), `currentId`, and actions `createBoard(name)`, `switchBoard(id)`, `renameBoard(id, name)`, `duplicateBoard(id)`, `deleteBoard(id)`.
- Undo/redo history resets on board switch (per-board history is a nice-to-have, not required).
- `name` derives from the root node text by default; keep it in the index for the switcher.

**UI**
- A **board switcher** in the toolbar (dropdown near the brand or in a new spot): lists boards, shows the active one, with **New board**, rename, duplicate, delete. ~1 new component (`src/components/BoardSwitcher.tsx`).

**Acceptance**
- Create/switch/rename/duplicate/delete boards; each persists independently; reload restores the last active board; the legacy single board is migrated as the first entry.

### Phase B — Cloud-synced board list (optional follow-up)
So the board list follows the user across laptops.
- Signed-in users can list their Supabase boards (`select id, name, updated_at from boards ...`) — a "My shared boards" section in the switcher.
- Requires the `boards` table to associate an owner (add `owner_email` / `created_by` column + RLS so users see their own / People10 boards). Opening one sets `?board=<id>` (already works).
- Decide whether local boards can be "pushed to cloud" and whether the cloud list merges with the local list in the switcher.

## Files likely touched
- `src/board/store.tsx` (or new `src/board/boards.ts`) — index + multi-key persistence + migration + new actions.
- `src/App.tsx` — render the switcher; pass active board through.
- `src/components/BoardSwitcher.tsx` — new UI.
- `src/components/Toolbar.tsx` — placement of the switcher.
- (Phase B) `src/collab/useCollab.ts` + Supabase schema/RLS — owner column + "my boards" query.

## Risks / notes
- Migration must be safe: never lose the existing board. Guard: only migrate when the index is absent.
- `?board=<uuid>` deep-links must keep working — opening a shared board should still take precedence / offer to add it to the local list.
- Keep switching cheap: boards are small JSON; loading one is instant.
