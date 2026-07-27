import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadTaskFile } from "@/lib/infini";
import { createWorkbookSnapshot, snapshotFileName } from "@/lib/workbook-reader";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const CONTEXT_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

function extension(name: string) { return name.slice(name.lastIndexOf(".")).toLowerCase(); }

export async function POST(request: Request) {
  const user = await requireUser();
  const data = await request.formData();
  const workbook = data.get("workbook");
  const context = data.get("context");

  if (!(workbook instanceof File) || extension(workbook.name) !== ".xlsx") return NextResponse.json({ error: "请选择 .xlsx 工作簿" }, { status: 400 });
  if (workbook.size === 0 || workbook.size > MAX_FILE_BYTES) return NextResponse.json({ error: "工作簿大小必须在 25MB 以内" }, { status: 400 });
  if (context instanceof File && context.size > 0 && (!CONTEXT_EXTENSIONS.includes(extension(context.name)) || context.size > MAX_FILE_BYTES)) {
    return NextResponse.json({ error: "业务说明仅支持 PDF、DOCX、TXT、MD，且不超过 25MB" }, { status: 400 });
  }

  const taskId = randomUUID();
  const connId = randomUUID();
  const workbookBuffer = Buffer.from(await workbook.arrayBuffer());
  let snapshot: File;
  try {
    snapshot = new File([createWorkbookSnapshot(workbookBuffer, workbook.name)], snapshotFileName(workbook.name), { type: "text/markdown" });
  } catch {
    return NextResponse.json({ error: "无法读取该 XLSX 工作簿，请确认文件未损坏且未加密" }, { status: 400 });
  }
  const inserted = await db.query<{ id: string }>(
    `INSERT INTO analysis_tasks (user_id, infini_task_id, conn_id, workbook_name, context_name, workbook_data, workbook_size)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [user.id, taskId, connId, workbook.name, context instanceof File && context.size > 0 ? context.name : null, workbookBuffer, workbook.size],
  );
  const id = inserted.rows[0].id;

  try {
    await uploadTaskFile(taskId, workbook);
    await uploadTaskFile(taskId, snapshot);
    if (context instanceof File && context.size > 0) await uploadTaskFile(taskId, context);
    return NextResponse.json({ id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "文件上传失败";
    await db.query("UPDATE analysis_tasks SET status='failed', error_message=$2, updated_at=NOW() WHERE id=$1", [id, message]);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function GET() {
  const user = await requireUser();
  const result = await db.query(
    `SELECT id, status, workbook_name, latest_message, error_message, created_at, updated_at
       FROM analysis_tasks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 20`,
    [user.id],
  );
  return NextResponse.json({ tasks: result.rows });
}
