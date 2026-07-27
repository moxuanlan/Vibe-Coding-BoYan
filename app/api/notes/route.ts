import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const noteSchema = z.object({
  title: z.string().max(200).default(""),
  body: z.string().max(50000).default(""),
  tag: z.string().max(50).default("个人笔记"),
  analysisTaskId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const result = await db.query(
    `SELECT notes.id, notes.title, notes.body, notes.tag, notes.analysis_task_id,
            notes.created_at, notes.updated_at, analysis_tasks.workbook_name
       FROM notes LEFT JOIN analysis_tasks ON analysis_tasks.id=notes.analysis_task_id
      WHERE notes.user_id=$1 AND ($2='' OR notes.title ILIKE '%' || $2 || '%' OR notes.body ILIKE '%' || $2 || '%')
      ORDER BY notes.updated_at DESC LIMIT 100`,
    [user.id, query],
  );
  return NextResponse.json({ notes: result.rows });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const parsed = noteSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "笔记内容不符合要求" }, { status: 400 });
  const { title, body, tag, analysisTaskId } = parsed.data;
  const result = await db.query(
    `INSERT INTO notes (user_id,title,body,tag,analysis_task_id)
     SELECT $1,$2,$3,$4,t.id FROM (SELECT $5::uuid AS id) input
     LEFT JOIN analysis_tasks t ON t.id=input.id AND t.user_id=$1
     RETURNING *`,
    [user.id, title, body, tag, analysisTaskId ?? null],
  );
  return NextResponse.json({ note: result.rows[0] }, { status: 201 });
}
