# P10 Pensieve

An infinite-canvas mind-map for collaborative brainstorming — built for the People10 AI-first website rebrand, but generic enough for any parent-child idea tree.

Nodes are full-color cards on a pannable/zoomable canvas that auto-lays-out as a tidy left-to-right tree. Expand and collapse branches independently (NotebookLM-style — siblings stay open), drill into any node through a focused side panel, capture notes/status/owners/votes on each idea, and optionally sync live with your team.

Built as a **static single-page app** (React + TypeScript + Vite) that deploys to GitHub Pages. The only backend is an optional Supabase project used for live collaboration; without it, the app runs fully local.

## Features

- **Infinite canvas** — pan/zoom, auto tidy tree layout (Dagre), animated re-flow and auto-fit on expand/collapse.
- **Independent expand/collapse** — expanding one node never collapses its siblings; the tree re-flows and the camera re-fits.
- **Focused side panel** — click a node to open a resizable panel listing its children; drill in, edit, and reorder without losing your place. Breadcrumb trail to jump back up.
- **Rich cards** — per-node note, status (Idea / Exploring / Decided / Parked), owner, links, tags, and votes, shown as badges on the card.
- **Drag-to-reorder** — reorder siblings by dragging the handle in the side panel; the canvas order always matches.
- **Search & filter** — jump to matches, and dim by status or tag.
- **Depth controls** — Expand all, Collapse all, or show down to a chosen level.
- **Colors** — top-level categories get unique, auto-generated colors; descendants inherit their branch color; full manual override.
- **Undo / redo** — full history with keyboard shortcuts; autosave to `localStorage`.
- **Present mode** — full-screen step-through of the top-level pillars for review meetings.
- **Import / export** — JSON and **Excel (.xlsx)** import, plus Markdown outline, PNG, and shareable-link export.
- **Light / dark theme.**
- **Live collaboration (optional)** — real-time multi-user editing with presence, gated by email magic-link sign-in (see below).

## Tech stack

- React 19 + TypeScript + Vite 8
- [@xyflow/react](https://reactflow.dev) (canvas) + [@dagrejs/dagre](https://github.com/dagrejs/dagre) (layout)
- [@dnd-kit](https://dndkit.com) (drag-to-reorder)
- [SheetJS `xlsx`](https://sheetjs.com) (Excel import), `lz-string` (share links), `html-to-image` (PNG)
- [Supabase](https://supabase.com) (optional realtime + auth)

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # preview the production build
```

The app works immediately with no configuration — the board persists to `localStorage`.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Double-click card | Edit text |
| `Ctrl/Cmd + Z` / `Shift+Z` (or `Ctrl+Y`) | Undo / redo |
| `Tab` | Add child (to the focused node) |
| `Enter` | Add sibling |
| `Delete` / `Backspace` | Delete node |
| `Space` | Toggle collapse |

## Import from Excel

**More ▾ → Import Excel…** builds a board from an `.xlsx` where:

- **Column A** → pillar (level 1, unique color)
- **Column B** → element (level 2, inherits pillar color)
- **Column C** → details (level 3; multiple details separated by newlines)

Blank cells continue the group above. (`xlsx_to_board.py` in the parent folder does the same conversion offline.)

## Deploying to GitHub Pages

`vite.config.ts` uses a relative `base` so the build works from a Pages project subpath. A workflow at `.github/workflows/deploy.yml` builds and deploys on every push to `main`.

1. Push to your GitHub repo.
2. Repo → **Settings → Pages → Source: GitHub Actions**.
3. The site deploys to `https://<user>.github.io/<repo>/`.

## Live collaboration (optional Supabase setup)

Collaboration is off unless a Supabase project is configured. Local editing and all exports never require sign-in — only Go Live and opening a shared `?board=` link do.

1. **Configure the client.** Edit `public/config.js` (served at runtime, not bundled):
   ```js
   window.__BB_SUPABASE__ = {
     url: "https://<your-project>.supabase.co",
     anonKey: "<your-anon-key>",
   };
   ```
   The anon key is public-safe because access is protected by row-level security.
2. **Create the table** (Supabase SQL editor):
   ```sql
   create table if not exists public.boards (
     id uuid primary key default gen_random_uuid(),
     name text,
     data jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.boards enable row level security;
   create policy "auth read"   on public.boards for select to authenticated using (true);
   create policy "auth insert" on public.boards for insert to authenticated with check (true);
   create policy "auth update" on public.boards for update to authenticated using (true) with check (true);
   alter publication supabase_realtime add table public.boards;
   ```
   To restrict to one email domain, replace `using (true)` (read) with
   `using ((auth.jwt() ->> 'email') like '%@yourdomain.com')`.

   For the cloud-synced board list (so a signed-in user's own boards follow
   them across devices), add an owner column with a JWT-derived default so
   the client never has to pass it explicitly on insert:
   ```sql
   alter table public.boards add column if not exists owner_email text default (auth.jwt() ->> 'email');
   ```
3. **Enable auth.** Authentication → Providers → enable **Email** (magic link). Under URL Configuration, set the Site URL and Redirect URLs to your Pages URL and `http://localhost:5173`.
4. **Use it.** Sign in, click **Go live** to create a shared board, and share the resulting `?board=<id>` URL. Presence shows who's online.

Sync model: whole-board **last-write-wins** with presence — great for ideation; near-simultaneous edits to different nodes in the same save window can overwrite each other.

## Data & persistence

- The board is a normalized tree (`Record<id, Block>`) persisted to `localStorage` (debounced).
- Export/import round-trips the board as JSON; older versions are migrated automatically.
