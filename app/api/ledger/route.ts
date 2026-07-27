import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const entrySchema = z.object({
  type: z.enum(["收入", "支出"]),
  category: z.string().min(1).max(50),
  amount: z.coerce.number().positive().max(999999999999),
  date: z.iso.date(),
  note: z.string().max(500).default(""),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const type = new URL(request.url).searchParams.get("type") ?? "全部";
  const result = await db.query(
    `SELECT id, entry_type AS type, category, amount::float8 AS amount, entry_date::text AS date, note, created_at, updated_at
       FROM ledger_entries WHERE user_id=$1 AND ($2='全部' OR entry_type=$2)
      ORDER BY entry_date DESC, created_at DESC LIMIT 200`,
    [user.id, type],
  );
  return NextResponse.json({ entries: result.rows });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const parsed = entrySchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "账目内容不符合要求" }, { status: 400 });
  const value = parsed.data;
  const result = await db.query(
    `INSERT INTO ledger_entries (user_id,entry_type,category,amount,entry_date,note)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id, entry_type AS type, category, amount::float8 AS amount, entry_date::text AS date, note, created_at, updated_at`,
    [user.id, value.type, value.category, value.amount, value.date, value.note],
  );
  return NextResponse.json({ entry: result.rows[0] }, { status: 201 });
}
