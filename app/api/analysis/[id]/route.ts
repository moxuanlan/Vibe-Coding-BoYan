import { NextResponse } from "next/server";
import { findOwnedTask } from "@/lib/analysis";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const task = await findOwnedTask((await params).id, user.id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ task: {
    id: task.id, status: task.status, workbookName: task.workbook_name, latestMessage: task.latest_message,
    errorMessage: task.error_message, workspace: task.workspace, createdAt: task.created_at, updatedAt: task.updated_at,
  }});
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const task = await findOwnedTask((await params).id, user.id);
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (task.status === "queued" || task.status === "running") return NextResponse.json({ error: "进行中的任务需要先取消" }, { status: 409 });
  await db.query("DELETE FROM analysis_tasks WHERE id=$1 AND user_id=$2", [task.id, user.id]);
  return new NextResponse(null, { status: 204 });
}
