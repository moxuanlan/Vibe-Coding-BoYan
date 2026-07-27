import { findOwnedTask } from "@/lib/analysis";
import { requireUser } from "@/lib/auth";
import { infiniFetch } from "@/lib/infini";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const task = await findOwnedTask((await params).id, user.id);
  if (!task) return Response.json({ error: "任务不存在" }, { status: 404 });
  const path = new URL(request.url).searchParams.get("path");
  if (!path || path.includes("..")) return Response.json({ error: "文件路径无效" }, { status: 400 });
  const upstream = await infiniFetch(`/api/tools/storage/downloadTaskFile/${encodeURIComponent(task.infini_task_id)}?path=${encodeURIComponent(path)}`);
  return new Response(upstream.body, { headers: {
    "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.split("/").pop() ?? "report")}`,
  }});
}
