import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const updateSchema = z.object({
  type: z.enum(["收入", "支出"]),
  category: z.string().min(1).max(50),
  amount: z.coerce.number().positive().max(999999999999),
  date: z.iso.date(),
  note: z.string().max(500),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "账目内容不符合要求" }, { status: 400 });
  const result = await db.query(
    `UPDATE ledger_entries SET entry_type=$3, category=$4, amount=$5, entry_date=$6, note=$7, updated_at=NOW()
      WHERE id=$1 AND user_id=$2
      RETURNING id, entry_type AS type, category, amount::float8 AS amount, entry_date::text AS date, note`,
    [(await params).id, user.id, parsed.data.type, parsed.data.category, parsed.data.amount, parsed.data.date, parsed.data.note],
  );
  if (!result.rowCount) return NextResponse.json({ error: "账目不存在" }, { status: 404 });
  return NextResponse.json({ entry: result.rows[0] });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const result = await db.query("DELETE FROM ledger_entries WHERE id=$1 AND user_id=$2", [(await params).id, user.id]);
  if (!result.rowCount) return NextResponse.json({ error: "账目不存在" }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
