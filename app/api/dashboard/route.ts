import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { readWorkbook, type WorkbookCell } from "@/lib/workbook-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberValue(value: WorkbookCell) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[¥￥,$,%\s]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value: WorkbookCell) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value !== "string" || !/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(value)) return null;
  const parsed = new Date(value.replaceAll("/", "-"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(request.url);
  const requestedTask = url.searchParams.get("taskId");
  const taskResult = await db.query<{ id: string; workbook_name: string; workbook_data: Buffer }>(
    `SELECT id,workbook_name,workbook_data FROM analysis_tasks
      WHERE user_id=$1 AND status='completed' AND workbook_data IS NOT NULL AND ($2::uuid IS NULL OR id=$2)
      ORDER BY updated_at DESC LIMIT 1`,
    [user.id, requestedTask || null],
  );
  const task = taskResult.rows[0];
  if (!task) return NextResponse.json({ empty: true, message: "请重新上传并完成一次工作簿分析，随后即可生成动态大屏。" });

  const workbook = readWorkbook(Buffer.from(task.workbook_data));
  const sheets = workbook.map(sheet => sheet.name);
  const sheet = workbook.find(item => item.name === url.searchParams.get("sheet")) ?? workbook.find(item => item.rows.length > 1) ?? workbook[0];
  if (!sheet) return NextResponse.json({ empty: true, message: "工作簿中没有可读取的工作表。" });

  let headerRow = 0;
  for (let row = 0; row < Math.min(10, sheet.rows.length); row++) {
    const populated = sheet.rows[row].filter(value => value != null && String(value).trim()).length;
    if (populated >= 2) { headerRow = row; break; }
  }
  const columnCount = Math.min(Math.max(0, ...sheet.rows.map(row => row.length)), 50);
  const headers = Array.from({ length: columnCount }, (_, index) => String(sheet.rows[headerRow]?.[index] ?? `列 ${index + 1}`));
  const rows = sheet.rows.slice(headerRow + 1, headerRow + 3001).map(row => headers.map((_, index) => row[index] ?? null)).filter(row => row.some(value => value !== null && String(value).trim() !== ""));
  const numeric = headers.map((header, index) => ({ header, index, values: rows.map(row => numberValue(row[index])).filter((value): value is number => value !== null) })).filter(column => column.values.length >= Math.max(2, rows.length * .4) && !/学号|编号|序号|(^|\b)ID($|\b)|排名/.test(column.header));
  const dates = headers.map((header, index) => ({ header, index, values: rows.map(row => dateValue(row[index])) })).find(column => column.values.filter(Boolean).length >= Math.max(2, rows.length * .4));
  const category = headers.map((header, index) => ({ header, index, values: rows.map(row => row[index]).filter(value => typeof value === "string" && value.trim()) as string[] })).find(column => new Set(column.values).size >= 2 && new Set(column.values).size <= 20);
  const primary = numeric.find(column => /销售额|金额|收入|营收|利润|成本|总分|平均分|成绩|数量|合计/.test(column.header)) ?? numeric[0];
  const metrics = numeric.slice(0, 4).map(column => ({ label: column.header, value: column.values.reduce((sum, value) => sum + value, 0) }));
  const trendMap = new Map<string, number>();
  if (dates && primary) rows.forEach(row => { const date = dateValue(row[dates.index]); const value = numberValue(row[primary.index]); if (date && value !== null) { const key = date.toISOString().slice(0, 10); trendMap.set(key, (trendMap.get(key) ?? 0) + value); } });
  const categoryMap = new Map<string, number>();
  if (category && primary) rows.forEach(row => { const key = String(row[category.index] ?? "未分类"); const value = numberValue(row[primary.index]); if (key && value !== null) categoryMap.set(key, (categoryMap.get(key) ?? 0) + value); });
  const categories = [...categoryMap.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([label,value]) => ({ label,value }));
  return NextResponse.json({ taskId: task.id, workbookName: task.workbook_name, sheets, selectedSheet: sheet.name, rowCount: rows.length, headers, primaryMetric: primary?.header ?? null, metrics, trend: [...trendMap.entries()].sort().map(([label,value]) => ({ label,value })), categories });
}
