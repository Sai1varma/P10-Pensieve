export type ID = string;

export type Theme = "light" | "dark";

/** Lifecycle of an idea during the rebrand journey. */
export type Status = "idea" | "exploring" | "decided" | "parked";

export const STATUS_META: Record<Status, { label: string; color: string }> = {
  idea: { label: "Idea", color: "#64748b" },
  exploring: { label: "Exploring", color: "#0284c7" },
  decided: { label: "Decided", color: "#059669" },
  parked: { label: "Parked", color: "#d97706" },
};

export const STATUS_ORDER: Status[] = ["idea", "exploring", "decided", "parked"];

/** Active search/filter view state, shared by Toolbar and Canvas. */
export interface ViewFilter {
  status?: Status;
  tag?: string;
}

/** A single node in the tree. `level` is derived from depth, not stored. */
export interface Block {
  id: ID;
  parentId: ID | null; // null only for the implicit board root
  text: string;
  color: string | null; // null = neutral surface (root is always null-ish)
  childIds: ID[];
  collapsed: boolean; // independent per node -> hides this node's subtree
  x?: number; // canvas position (dagre fills when absent)
  y?: number;
  // ----- v3 content fields (all optional) -----
  note?: string;
  status?: Status;
  owner?: string;
  links?: string[];
  tags?: string[];
  votes?: number;
}

export interface Board {
  version: 3;
  rootId: ID;
  blocks: Record<ID, Block>;
  members?: Member[];
}

/** A lightweight team member for Owner attribution (no login yet). */
export interface Member {
  id: ID;
  name: string;
  color: string;
}

/** localStorage key holding this device's chosen member name. */
export const ME_KEY = "blockboard-me-name";

/** Full-color palette, tuned to read well as whole-card fills in light AND dark. */
export const PALETTE: { name: string; value: string }[] = [
  { name: "Rose", value: "#e11d48" },
  { name: "Orange", value: "#ea580c" },
  { name: "Amber", value: "#d97706" },
  { name: "Emerald", value: "#059669" },
  { name: "Teal", value: "#0d9488" },
  { name: "Sky", value: "#0284c7" },
  { name: "Indigo", value: "#4f46e5" },
  { name: "Violet", value: "#7c3aed" },
  { name: "Fuchsia", value: "#c026d3" },
  { name: "Slate", value: "#475569" },
];

export const STORAGE_KEY = "block-board-v2";
export const THEME_KEY = "blockboard-theme";

/* ---------- generated color engine ----------
 * Top-level categories draw unique, well-separated colors from an effectively
 * unlimited palette (golden-angle hue spacing). Descendants inherit their
 * category color; users can still override any node manually.
 */

/** HSL -> #rrggbb. h in [0,360), s/l in [0,1]. */
export function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

// Saturation/lightness tuned to read well as full-card fills in light AND dark.
const CAT_SAT = 0.62;
const CAT_LIGHT = 0.45;
const GOLDEN_ANGLE = 137.508;

/** The hue (0..360) encoded by a generated category hex, else null. */
function hueOf(hex: string): number | null {
  const c = hex.replace("#", "");
  if (c.length !== 6) return null;
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return null;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return (h + 360) % 360;
}

/**
 * Pick a category color whose hue is maximally distant from every color
 * already in use, so top-level categories never repeat and stay separated.
 */
export function nextCategoryColor(usedHexes: (string | null)[]): string {
  const usedHues = usedHexes
    .map((h) => (h ? hueOf(h) : null))
    .filter((h): h is number => h !== null);
  if (usedHues.length === 0) return hslHex(210, CAT_SAT, CAT_LIGHT);

  // Golden-angle candidates keep good spread without knowing the total count.
  let best = 0;
  let bestGap = -1;
  for (let i = 0; i < usedHues.length + 24; i++) {
    const hue = (i * GOLDEN_ANGLE) % 360;
    const gap = usedHues.reduce((mn, u) => {
      const dd = Math.abs(hue - u);
      return Math.min(mn, Math.min(dd, 360 - dd));
    }, 360);
    if (gap > bestGap) {
      bestGap = gap;
      best = hue;
    }
  }
  return hslHex(best, CAT_SAT, CAT_LIGHT);
}

/** A larger swatch set for the manual picker (24 evenly-spaced hues). */
export const SWATCHES: string[] = Array.from({ length: 24 }, (_, i) =>
  hslHex((i * 360) / 24, CAT_SAT, CAT_LIGHT)
);

/** Node box used by the layout engine (must match CSS). */
export const NODE_W = 240;
export const NODE_H = 96;

/**
 * Pick a readable text color (near-black / near-white) for a given fill,
 * using WCAG relative luminance.
 */
export function contrastText(hex: string | null): string {
  if (!hex) return "var(--text)";
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const lin = (v: number) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.5 ? "#0b0f17" : "#ffffff";
}
