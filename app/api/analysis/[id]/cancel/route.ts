import { NextResponse } from "next/server";
import { findOwnedTask, updateTask } from "@/lib/analysis";
import { requireUser } from "@/lib/auth";
import { infiniFetch } from "@/lib/infini";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const task = await findOwnedTask((await params).id, user.id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  await infiniFetch(`/api/ai_task/cancelTask?taskId=${encodeURIComponent(task.infini_task_id)}`, { method: "POST" }).catch(() => null);
  await updateTask(task.id, { status: "cancelled" });
  return NextResponse.json({ ok: true });
}
