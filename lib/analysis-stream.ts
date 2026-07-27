import "server-only";

import { analysisPrompt, getWorkspace, infiniFetch, infiniHeaders } from "@/lib/infini";
import { updateTask, type AnalysisTask } from "@/lib/analysis";

const encoder = new TextEncoder();

function eventBlock(event: string, payload: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function parseBlock(block: string) {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  const raw = dataLines.join("\n");
  try { return { event, data: JSON.parse(raw) }; } catch { return { event, data: raw }; }
}

function messageFrom(data: any) {
  return data?.message ?? data?.data?.message ?? null;
}

export function createAnalysisStream(task: AnalysisTask, followUp?: string) {
  let consumerClosed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (consumerClosed) return;
        try { controller.enqueue(eventBlock(event, data)); }
        catch { consumerClosed = true; }
      };
      try {
        await updateTask(task.id, { status: "running", errorMessage: null });
        send("status", { status: "running" });

        const upstream = await fetch(`${process.env.INFINISYNAPSE_SERVER_URL ?? "https://app.infinisynapse.cn"}/api/ai/events?connId=${encodeURIComponent(task.conn_id)}`, {
          headers: infiniHeaders({ Accept: "text/event-stream" }),
          cache: "no-store",
          signal: AbortSignal.timeout(30 * 60 * 1000),
        });
        if (!upstream.ok || !upstream.body) throw new Error(`无法连接分析事件流（${upstream.status}）`);

        let lastTs = 0;
        if (followUp) {
          const existingResponse = await infiniFetch(`/api/ai_task/getUiMessageById?id=${encodeURIComponent(task.infini_task_id)}`);
          const existingPayload = await existingResponse.json();
          const existingMessages: any[] = Array.isArray(existingPayload?.data) ? existingPayload.data : [];
          lastTs = existingMessages.reduce((max, message) => Math.max(max, Number(message?.ts ?? 0)), 0);
        }

        const messageBody = followUp
          ? { type: "askResponse", taskId: task.infini_task_id, connId: task.conn_id, askResponse: "messageResponse", text: followUp }
          : {
              type: "newTask",
              taskId: task.infini_task_id,
              connId: task.conn_id,
              text: analysisPrompt(task.workbook_name, task.context_name),
              chatSettings: { mode: "act" },
              autoApprovalSettings: { maxRequests: 80, maxSubAgentRequests: 0, enableWebSearch: false, enableBrowser: false, enableReadImage: true, enableNativeToolCalling: true },
            };

        const posted = await infiniFetch("/api/ai/message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(messageBody) });
        const postResult = await posted.json().catch(() => ({}));
        if (postResult?.success === false) throw new Error(postResult?.error ?? postResult?.notification?.message ?? "分析任务创建失败");

        let latest = "";
        let completed = false;
        for (let attempt = 0; attempt < 450 && !completed; attempt++) {
          const messagesResponse = await infiniFetch(`/api/ai_task/getUiMessageById?id=${encodeURIComponent(task.infini_task_id)}`);
          const payload = await messagesResponse.json();
          const messages: any[] = Array.isArray(payload?.data) ? payload.data : [];
          for (const message of messages) {
            const ts = Number(message?.ts ?? 0);
            if (ts <= lastTs) continue;
            lastTs = Math.max(lastTs, ts);
            if (typeof message?.text === "string" && message.text.trim() && ["text", "reasoning", "completion_result", "error"].includes(message?.say ?? message?.ask)) {
              latest = message.text;
              await updateTask(task.id, { latestMessage: latest.slice(-12000) });
              send("infini", { event: "message.add", data: { message } });
            }
            if (message?.say === "error") send("warning", { message: message.text });
            if (message?.ask === "completion_result" || message?.say === "completion_result") { completed = true; break; }
          }
          if (!completed) await new Promise(resolve => setTimeout(resolve, 2000));
        }
        await upstream.body.cancel().catch(() => undefined);

        if (!completed) throw new Error("分析连接提前结束，请稍后恢复任务");
        const workspace = await getWorkspace(task.infini_task_id).catch(() => []);
        await updateTask(task.id, { status: "completed", latestMessage: latest || "分析已完成", workspace });
        send("complete", { status: "completed", workspace });
      } catch (error) {
        const message = error instanceof Error ? error.message : "分析任务失败";
        await updateTask(task.id, { status: "failed", errorMessage: message });
        send("failure", { status: "failed", error: message });
      } finally {
        if (!consumerClosed) {
          try { controller.close(); } catch { /* The browser may have refreshed between the last send and close. */ }
        }
        consumerClosed = true;
      }
    },
    cancel() {
      consumerClosed = true;
    },
  });
}
