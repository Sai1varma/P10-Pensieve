# Block Board

A generic, static, single-page **editable block board**: a parent-child tree rendered
as horizontal **Miller columns** with click-to-drill-down expand/collapse, drag-and-drop
rearrange (dnd-kit), per-block color with same-color grouping, localStorage persistence,
and JSON export/import. No backend.

## Interactions

- **Drill down / expand:** click a block to open its children in the next column.
  Click it again to collapse. Opening a block collapses other open branches and any
  deeper columns (accordion drill-down).
- **Add:** `＋` add child, `↳` add sibling, or "＋ Add block" at the bottom of a column.
- **Rename:** double-click a block's text.
- **Color:** the `●` button opens a palette (or "no color").
- **Group:** 2+ blocks sharing a color in the same level auto-fold into one group chip;
  click the chip to expand its members.
- **Drag:** use the `⠿` handle. Drop on a sibling to reorder; drop on another column
  to reparent under that column's parent. (Can't drop a block into its own subtree.)
- **Export / Import / Reset:** in the top toolbar. Work also auto-saves to localStorage.

## Develop (Windows / PowerShell)

```powershell
npm.cmd install
npm.cmd run dev      # http://localhost:5173
npm.cmd run build    # -> dist/  (relative base, GitHub-Pages ready)
npm.cmd run preview  # serve the production build locally
```

## Deploy to GitHub Pages

`vite.config.ts` uses `base: './'`, so the build works under any Pages subpath.
Push this folder as a repo, then set **Settings → Pages → Source: GitHub Actions**.
The workflow in `.github/workflows/deploy.yml` builds and publishes `dist/` on push to `main`.

> Note: the workflow assumes this folder (the one with `package.json`) is the repo root.
> If you nest it under a monorepo, adjust the workflow paths.

## Data model

```ts
Block = { id, parentId, text, color, childIds }   // level = depth (derived)
Board = { version: 1, rootId, blocks: Record<id, Block> }
```

## Not in v1 (deferred)

Inherited-color policy (root neutral → level-1 categories → descendants inherit), multi-root
boards, nested containers, keyboard command palette, and the People10 11-pillar seed content.
