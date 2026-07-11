import * as XLSX from "xlsx";
import { hslHex, type Block, type ID, type TreeBoard } from "./types";

// Match the generated palette used elsewhere (types.ts CAT_SAT / CAT_LIGHT).
const CAT_SAT = 0.62;
const CAT_LIGHT = 0.45;

/**
 * Build a board from an .xlsx workbook, mirroring xlsx_to_board.py:
 *  - Col A -> pillar (level 1, a unique evenly-spaced color)
 *  - Col B -> element (level 2, inherits its pillar color)
 *  - Col C -> details (level 3, newline-separated; inherit color)
 * Blank cells continue the group above. Pillars + elements start collapsed.
 */
export function excelToBoard(buf: ArrayBuffer, rootTitle = "Imported Board"): TreeBoard {
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames.includes("C_Opus4.8")
    ? "C_Opus4.8"
    : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error("The workbook has no readable sheet.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  const cell = (r: unknown[], i: number) => {
    const v = r?.[i];
    return v == null ? "" : String(v).trim();
  };

  // Count pillars (col A non-empty) from row 2 onward, to space hues evenly.
  let pillarTotal = 0;
  for (let i = 1; i < rows.length; i++) if (cell(rows[i], 0)) pillarTotal++;
  const catColor = (idx: number) =>
    hslHex((idx * 360) / Math.max(pillarTotal, 1), CAT_SAT, CAT_LIGHT);

  const blocks: Record<ID, Block> = {};
  let counter = 0;
  const newId = () => `x${(++counter).toString(36)}`;

  const add = (
    parentId: ID | null,
    text: string,
    color: string | null,
    collapsed: boolean
  ): Block => {
    const b: Block = { id: newId(), parentId, text, color, childIds: [], collapsed };
    blocks[b.id] = b;
    if (parentId) blocks[parentId].childIds.push(b.id);
    return b;
  };

  const root = add(null, rootTitle, null, false);

  let pillar: Block | null = null;
  let element: Block | null = null;
  let pillarColor: string | null = null;
  let pillarCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const a = cell(rows[i], 0);
    const b = cell(rows[i], 1);
    const c = cell(rows[i], 2);
    if (!a && !b && !c) continue;

    if (a) {
      pillarColor = catColor(pillarCount++);
      pillar = add(root.id, a, pillarColor, true);
      element = null;
    }
    if (b) {
      if (!pillar) {
        pillarColor = catColor(pillarCount++);
        pillar = add(root.id, "(uncategorized)", pillarColor, true);
      }
      element = add(pillar.id, b, pillarColor, true);
    }
    if (c) {
      const target = element ?? pillar;
      if (!target) continue;
      for (const line of c.split("\n")) {
        const t = line.trim();
        if (t) add(target.id, t, pillarColor, false);
      }
    }
  }

  return { version: 3, kind: "tree", rootId: root.id, blocks, members: [] };
}
