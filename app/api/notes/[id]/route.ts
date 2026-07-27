import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const updateSchema = z.object({ title: z.string().max(200), body: z.string().max(50000) });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "笔记内容不符合要求" }, { status: 400 });
  const result = await db.query(
    "UPDATE notes SET title=$3, body=$4, updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *",
    [(await params).id, user.id, parsed.data.title, parsed.data.body],
  );
  if (!result.rowCount) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  return NextResponse.json({ note: result.rows[0] });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const result = await db.query("DELETE FROM notes WHERE id=$1 AND user_id=$2", [(await params).id, user.id]);
  if (!result.rowCount) return NextResponse.json({ error: "笔记不存在" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
