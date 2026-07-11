import LZString from "lz-string";
import { parseImported } from "./store";
import { STATUS_META, type Board, type ID, type TreeBoard } from "./types";

/** Render the board tree as an indented Markdown outline. */
export function toMarkdown(board: TreeBoard): string {
  const root = board.blocks[board.rootId];
  if (!root) return "";
  const lines: string[] = [`# ${root.text}`, ""];

  const walk = (id: ID, depth: number) => {
    const b = board.blocks[id];
    if (!b) return;
    if (id !== root.id) {
      const indent = "  ".repeat(Math.max(0, depth - 1));
      const meta: string[] = [];
      if (b.status) meta.push(STATUS_META[b.status].label);
      if (b.votes) meta.push(`▲${b.votes}`);
      if (b.owner) meta.push(`@${b.owner}`);
      if (b.tags?.length) meta.push(b.tags.map((t) => `#${t}`).join(" "));
      const extra = meta.length ? `  _(${meta.join(" · ")})_` : "";
      lines.push(`${indent}- ${b.text}${extra}`);
      if (b.note?.trim()) lines.push(`${indent}  > ${b.note.replace(/\n+/g, " ")}`);
      for (const l of b.links ?? []) lines.push(`${indent}  - [${l}](${l})`);
    }
    for (const c of b.childIds) walk(c, depth + 1);
  };
  walk(root.id, 0);
  return lines.join("\n");
}

/** Trigger a browser download of text content. */
export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- shareable link (compressed board in the URL hash) ----------

export function boardToHash(board: Board): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(board));
}

export function hashToBoard(hash: string): Board | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(hash);
    if (!json) return null;
    return parseImported(JSON.parse(json));
  } catch {
    return null;
  }
}

/** Build a full shareable URL, or null if it would be impractically long. */
export function buildShareUrl(board: Board): string | null {
  const hash = boardToHash(board);
  const url = `${location.origin}${location.pathname}#board=${hash}`;
  return url.length > 30000 ? null : url;
}
