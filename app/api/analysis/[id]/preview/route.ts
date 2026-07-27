import { NextResponse } from "next/server";
import { findOwnedTask } from "@/lib/analysis";
import { requireUser } from "@/lib/auth";
import { infiniFetch } from "@/lib/infini";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const task = await findOwnedTask((await params).id, user.id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.includes("..")) return NextResponse.json({ error: "文件路径无效" }, { status: 400 });
  const response = await infiniFetch("/api/ai_task/previewFile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.infini_task_id, fileName: path }) });
  const payload = await response.json();
  return NextResponse.json(payload);
}
