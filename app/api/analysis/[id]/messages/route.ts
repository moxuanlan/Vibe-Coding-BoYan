import { z } from "zod";
import { findOwnedTask } from "@/lib/analysis";
import { createAnalysisStream } from "@/lib/analysis-stream";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const task = await findOwnedTask((await params).id, user.id);
  if (!task) return Response.json({ error: "任务不存在" }, { status: 404 });
  if (task.status !== "completed") return Response.json({ error: "请等待当前分析完成" }, { status: 409 });
  const parsed = z.object({ message: z.string().trim().min(1).max(2000) }).safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "请输入有效的追问" }, { status: 400 });
  return new Response(createAnalysisStream(task, parsed.data.message), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } });
}
