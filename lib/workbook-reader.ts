import "server-only";

import * as XLSX from "xlsx";

export type WorkbookCell = string | number | Date | null;
export type WorkbookSheet = { name: string; rows: WorkbookCell[][] };

function cellValue(value: unknown): WorkbookCell {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function parse(buffer: Buffer) {
  return XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: true });
}

export function readWorkbook(buffer: Buffer): WorkbookSheet[] {
  const workbook = parse(buffer);
  return workbook.SheetNames.map(name => ({
    name,
    rows: (XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: null, blankrows: false }) as unknown[][]).map(row => row.map(cellValue)),
  }));
}

function markdownCell(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ").slice(0, 500);
}

export function createWorkbookSnapshot(buffer: Buffer, workbookName: string) {
  const workbook = parse(buffer);
  const parts = [`# ${workbookName} 结构化快照`, "", "以下内容由簿言直接从原始 XLSX 提取，保留单元格位置、值与公式。", ""];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const range = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]) : null;
    parts.push(`## Sheet: ${name}`);
    if (!range) { parts.push("（空工作表）", ""); continue; }
    const maxRow = Math.min(range.e.r, range.s.r + 1999);
    const maxCol = Math.min(range.e.c, range.s.c + 49);
    parts.push(`范围：${sheet["!ref"]}；快照：${XLSX.utils.encode_cell({ r: range.s.r, c: range.s.c })}:${XLSX.utils.encode_cell({ r: maxRow, c: maxCol })}`, "");
    for (let row = range.s.r; row <= maxRow; row++) {
      const cells: string[] = [];
      for (let col = range.s.c; col <= maxCol; col++) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        const cell = sheet[address];
        if (!cell) continue;
        const formula = cell.f ? `公式 =${cell.f}；结果 ${markdownCell(cell.v)}` : markdownCell(cell.v);
        if (formula) cells.push(`${address}: ${formula}`);
      }
      if (cells.length) parts.push(`- ${cells.join(" | ")}`);
    }
    if (maxRow < range.e.r || maxCol < range.e.c) parts.push("- 注：超大工作表已按前 2000 行、50 列截取。", "");
    else parts.push("");
  }
  return parts.join("\n");
}

export function snapshotFileName(workbookName: string) {
  return `${workbookName.replace(/\.xlsx$/i, "")}-结构化快照.md`;
}
