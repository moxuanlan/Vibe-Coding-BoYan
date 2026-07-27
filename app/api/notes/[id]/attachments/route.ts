import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".pdf", ".docx", ".doc", ".txt", ".md", ".csv"];

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const result = await db.query(
    `SELECT id, file_name, content_type, file_size, created_at
       FROM note_attachments WHERE note_id=$1 AND user_id=$2 ORDER BY created_at DESC`,
    [(await params).id, user.id],
  );
  return NextResponse.json({ attachments: result.rows });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const noteId = (await params).id;
  const owned = await db.query("SELECT 1 FROM notes WHERE id=$1 AND user_id=$2", [noteId, user.id]);
  if (!owned.rowCount) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  const value = (await request.formData()).get("file");
  if (!(value instanceof File) || !value.size || value.size > MAX_BYTES) return NextResponse.json({ error: "请选择不超过 10MB 的文件" }, { status: 400 });
  const extension = value.name.slice(value.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) return NextResponse.json({ error: "暂不支持该文件格式" }, { status: 400 });
  const result = await db.query(
    `INSERT INTO note_attachments (note_id,user_id,file_name,content_type,file_size,file_data)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,file_name,content_type,file_size,created_at`,
    [noteId, user.id, value.name, value.type || "application/octet-stream", value.size, Buffer.from(await value.arrayBuffer())],
  );
  return NextResponse.json({ attachment: result.rows[0] }, { status: 201 });
}
