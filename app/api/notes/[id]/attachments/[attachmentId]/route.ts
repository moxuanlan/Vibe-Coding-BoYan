import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

type Params = { params: Promise<{ id: string; attachmentId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const value = await params;
  const result = await db.query<{ file_name: string; content_type: string; file_data: Buffer }>(
    "SELECT file_name,content_type,file_data FROM note_attachments WHERE id=$1 AND note_id=$2 AND user_id=$3",
    [value.attachmentId, value.id, user.id],
  );
  const file = result.rows[0];
  if (!file) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  return new NextResponse(new Uint8Array(file.file_data), { headers: { "Content-Type": file.content_type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name)}` } });
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const value = await params;
  const result = await db.query("DELETE FROM note_attachments WHERE id=$1 AND note_id=$2 AND user_id=$3", [value.attachmentId, value.id, user.id]);
  if (!result.rowCount) return NextResponse.json({ error: "附件不存在" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
