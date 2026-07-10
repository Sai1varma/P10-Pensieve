# CLAUDE.md — P10 Pensieve

Context for AI coding agents working on this repo. Read this before modifying code.

## What this is
An infinite-canvas mind-map for collaborative brainstorming (People10 AI-first rebrand). Static single-page app (React 19 + TypeScript + Vite 8), deployed to GitHub Pages. Optional Supabase backend for live collaboration; without it the app is fully local (localStorage).

## Run / build
```bash
npm install
npm run dev      # local dev
npm run build    # tsc -b && vite build  → always run this to verify before committing
```
There are no unit tests; correctness is verified by a clean `npm run build` plus manual UI testing.

## Architecture (source of truth = a normalized tree)
- **Store** — `src/board/store.tsx`: React Context + `useReducer`. State is `Board { version:3, rootId, blocks: Record<id, Block>, members? }`. All mutations go through `dispatch(action)`. Reducer is wrapped by a **history reducer** for undo/redo (`past/present/future`); layout-only actions (`setPositions`, `moveNode`) are TRANSIENT and don't create history. Debounced persistence to `localStorage` (key `block-board-v2`, value is a v3 board — the key name is legacy). `migrate()` upgrades v1→v2→v3 on load/import.
- **Types** — `src/board/types.ts`: `Block`, `Board`, `Status`/`STATUS_META`, `Member`, palette helpers (`hslHex`, `nextCategoryColor`, `SWATCHES`), `contrastText`, `NODE_W/NODE_H`. Color rule: only top-level categories get unique generated colors; descendants inherit their branch color.
- **Canvas** — `src/flow/Canvas.tsx` + `BlockNode.tsx` + `deriveGraph.ts`: React Flow renders nodes DERIVED from the store. A `structureSignature` (visible ids joined) drives re-layout: when it changes, Dagre re-lays out (`src/board/layout.ts`) → `setNodes` → persist positions → animate + `fitView`. Data-only changes just refresh node data (positions preserved). **Do not** dispatch `setPositions` when reusing stored positions (avoids reflow loop / redundant renders).
- **Layout** — `src/board/layout.ts`: Dagre LR tree. IMPORTANT: `enforceChildOrder()` post-processes Dagre output so siblings render top-to-bottom in `childIds` order (Dagre reorders by crossing-minimization otherwise). This keeps canvas order == side-panel order == drag order.
- **Side panel** — `src/components/SidePanel.tsx`: opens on node click (`onNodeClick` → `focusedId` in `App.tsx`). Flat, `childIds`-ordered list of the focused node's children with drag-to-reorder (@dnd-kit; drag the ⠿ handle → `reorderChildren` action). `NodeDetails` sub-component edits note/status/owner/links/tags/votes via `patchBlock`.
- **Collaboration** — `src/collab/`: `supabase.ts` (client from `public/config.js` `window.__BB_SUPABASE__`), `auth.ts` (magic-link), `useCollab.ts` (whole-board last-write-wins sync + presence, gated by an authenticated session), `AuthGate.tsx` (login modal, restricted to `@people10.com`). Local editing never requires login; only Go Live / opening a `?board=<id>` link does. RLS on the `boards` table is the real security boundary.

## Key conventions & gotchas
- **All state changes are reducer actions.** Add a new action type to the `Action` union and a `case` in `reducer` (or the history layer for undo/redo semantics).
- **Windows dev**: use `npm.cmd` / `npx.cmd`. Editing `store.tsx` breaks Vite Fast-Refresh (mixed exports) → transient "useBoard must be used within BoardProvider" or hook-order errors in the browser during HMR; they clear on a full reload — not real bugs.
- **Code-splitting**: heavy libs are lazy — `html-to-image` and `xlsx` via dynamic `import()`; `SidePanel`/`Present` via `React.lazy`. `vite.config.ts` splits `@xyflow/react`/`@dagrejs/dagre` and `@supabase/supabase-js` into separate chunks (manualChunks must be the FUNCTION form — Vite 8/rolldown rejects the object form).
- **GitHub Pages**: `base: './'` in `vite.config.ts`; `.github/workflows/deploy.yml` deploys `dist` on push to `main`. Repo root = this `block-board/` folder.
- **Excel import** mirrors `../xlsx_to_board.py`: col A=pillar, B=element, C=details (newline-split). See `src/board/importExcel.ts`.
- **Themes**: `data-theme` on `<html>` + CSS variables in `src/index.css`. Full-color cards use `contrastText()` for readable text.

## Where to change common things
- New per-node field → `types.ts` (Block), `patchBlock` already handles arbitrary patches, add UI in `SidePanel.tsx` `NodeDetails` + badge in `BlockNode.tsx`.
- New toolbar action → `src/components/Toolbar.tsx` (put secondary actions in the "More ▾" menu).
- Canvas controls (fit/tidy/levels) → the `<Panel>` in `Canvas.tsx`.
- Layout spacing / ordering → `src/board/layout.ts`.
- Collaboration behavior → `src/collab/useCollab.ts`.

## Supabase setup (for a fresh environment)
Fill `public/config.js` with the project `url` + `anonKey`. In Supabase: enable Email auth, set Site URL + Redirect URLs (Pages URL + local dev URL), create the `boards` table with RLS restricting to authenticated `@people10.com` users, and add it to the `supabase_realtime` publication. See README.md for the exact SQL.
