import { findOwnedTask } from "@/lib/analysis";
import { createAnalysisStream } from "@/lib/analysis-stream";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const task = await findOwnedTask((await params).id, user.id);
  if (!task) return Response.json({ error: "任务不存在" }, { status: 404 });
  if (task.status !== "queued") return Response.json({ error: "任务已启动或结束" }, { status: 409 });
  return new Response(createAnalysisStream(task), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
