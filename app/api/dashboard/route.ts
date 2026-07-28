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
  const isScoreSheet = headers.some(header => /姓名|学号|班级/.test(header)) && numeric.some(column => /总分|平均分|成绩|语文|数学|英语/.test(column.header));
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const scoreColumns = numeric.filter(column => /总分|平均分|成绩|语文|数学|英语|物理|化学|生物|历史|地理|政治/.test(column.header));
  const scoreBasis = numeric.find(column => /平均分|平均成绩/.test(column.header)) ?? primary;
  const metricColumns = (isScoreSheet ? scoreColumns : numeric).slice(0, 4);
  const metrics = metricColumns.map(column => ({ label: isScoreSheet ? `${column.header}平均` : column.header, value: isScoreSheet ? average(column.values) : column.values.reduce((sum, value) => sum + value, 0) }));
  const trendMap = new Map<string, number>();
  if (dates && primary) rows.forEach(row => { const date = dateValue(row[dates.index]); const value = numberValue(row[primary.index]); if (date && value !== null) { const key = date.toISOString().slice(0, 10); trendMap.set(key, (trendMap.get(key) ?? 0) + value); } });
  const categoryMap = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  if (category && primary) rows.forEach(row => { const key = String(row[category.index] ?? "未分类"); const value = numberValue(row[primary.index]); if (key && value !== null) { categoryMap.set(key, (categoryMap.get(key) ?? 0) + value); categoryCounts.set(key, (categoryCounts.get(key) ?? 0) + 1); } });
  const categories = [...categoryMap.entries()].map(([label, value]) => ({ label, value: isScoreSheet ? value / (categoryCounts.get(label) ?? 1) : value })).sort((a,b) => b.value-a.value).slice(0, 10);
  const scoreDistribution = new Map([ ["90分及以上", 0], ["80–89分", 0], ["70–79分", 0], ["60–69分", 0], ["60分以下", 0] ]);
  if (isScoreSheet && scoreBasis) scoreBasis.values.forEach(value => {
    const label = value >= 90 ? "90分及以上" : value >= 80 ? "80–89分" : value >= 70 ? "70–79分" : value >= 60 ? "60–69分" : "60分以下";
    scoreDistribution.set(label, (scoreDistribution.get(label) ?? 0) + 1);
  });
  const trend = isScoreSheet
    ? [...scoreDistribution.entries()].map(([label, value]) => ({ label, value }))
    : [...trendMap.entries()].sort().map(([label,value]) => ({ label,value }));
  const structures = headers.map((header, index) => {
    const values = rows.map(row => row[index]).filter(value => value !== null && String(value).trim() !== "");
    const numericCount = values.filter(value => numberValue(value) !== null).length;
    const dateCount = values.filter(value => dateValue(value) !== null).length;
    const type = values.length && numericCount / values.length >= .8 ? "数值" : values.length && dateCount / values.length >= .8 ? "日期" : "文本";
    return { header, type, valid: values.length, missing: rows.length - values.length };
  });
  const totalCells = rows.length * headers.length;
  const validCells = structures.reduce((sum, column) => sum + column.valid, 0);
  const completeness = totalCells ? Math.round(validCells / totalCells * 100) : 0;
  const overview = isScoreSheet && primary ? [
    `共 ${rows.length} 名学生，${scoreColumns.length} 个成绩指标`,
    `${primary.header}平均 ${average(primary.values).toFixed(1)}，最高 ${Math.max(...primary.values).toFixed(1)}，最低 ${Math.min(...primary.values).toFixed(1)}`,
    `数据完整率 ${completeness}%${completeness < 100 ? "，建议检查缺失成绩" : "，未发现空缺"}`,
  ] : [
    `共 ${rows.length} 行、${headers.length} 个字段`,
    `识别到 ${numeric.length} 个数值字段${dates ? "和日期字段" : ""}`,
    `数据完整率 ${completeness}%`,
  ];
  return NextResponse.json({ taskId: task.id, workbookName: task.workbook_name, sheets, selectedSheet: sheet.name, rowCount: rows.length, headers, structures, overview, isScoreSheet, primaryMetric: primary?.header ?? null, metricMode: isScoreSheet ? "平均分" : "合计", metrics, trend, trendTitle: isScoreSheet ? `${scoreBasis?.header ?? "成绩"}分段人数` : trend.length ? `${primary?.header ?? "数值"}趋势` : "未识别到日期趋势", categoryTitle: isScoreSheet ? `${category?.header ?? "分类"}${primary?.header ?? "成绩"}平均分` : `${primary?.header ?? "数值"}分类分布`, categories });
}
