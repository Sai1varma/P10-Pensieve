import { parseImported } from "./store";
import { buildShareUrl } from "./io";
import type { Board } from "./types";

/** Kind-agnostic export/import helpers shared by Toolbar and WhiteboardToolbar. */

export function exportJson(board: Board, filename = "block-board.json") {
  const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importJsonFile(file: File): Promise<Board | null> {
  try {
    return parseImported(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}

export async function exportPng(filename = "block-board.png") {
  const vp = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!vp) return;
  try {
    const { toPng } = await import("html-to-image");
    const bg = getComputedStyle(document.body).backgroundColor || "#0b0f17";
    const dataUrl = await toPng(vp, { backgroundColor: bg, pixelRatio: 2 });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = filename;
    a.click();
  } catch {
    alert("Could not render the board to an image.");
  }
}

export async function copyShareLink(board: Board) {
  const url = buildShareUrl(board);
  if (!url) {
    alert("This board is too large to share via link — use Export instead.");
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    alert("Share link copied to clipboard.");
  } catch {
    prompt("Copy this share link:", url);
  }
}
