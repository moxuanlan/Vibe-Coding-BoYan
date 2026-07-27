"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type View = "home" | "upload" | "progress" | "report";
type TaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
type Task = { id: string; status: TaskStatus; workbookName: string; latestMessage: string | null; errorMessage: string | null; workspace: unknown };
type HistoryTask = { id: string; status: TaskStatus; workbook_name: string; latest_message: string | null; error_message: string | null; created_at: string };

export function WorkspacePreview({ email, logoutAction }: { email: string; logoutAction: () => Promise<void> }) {
  const [view, setView] = useState<View>("home");
  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<HistoryTask[]>([]);
  const [progressText, setProgressText] = useState("等待开始分析");
  const [report, setReport] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const go = (next: View) => { setView(next); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const files = useMemo(() => collectFiles(task?.workspace), [task?.workspace]);

  async function loadHistory() {
    const response = await fetch("/api/analysis");
    if (!response.ok) return [] as HistoryTask[];
    const tasks = ((await response.json()).tasks ?? []) as HistoryTask[];
    setHistory(tasks);
    return tasks;
  }

  useEffect(() => {
    let stopped = false;
    void (async () => {
      const tasks = await loadHistory();
      if (stopped) return;
      const active = tasks.find(item => item.status === "running" || item.status === "queued");
      if (!active) return;
      setView("progress");
      if (active.status === "queued") {
        try { await consumeStream(await fetch(`/api/analysis/${active.id}/stream`), active.id); } catch { await pollTask(active.id, () => stopped); }
      } else await pollTask(active.id, () => stopped);
    })();
    return () => { stopped = true; };
  }, []);

  async function refreshTask(id: string) {
    const response = await fetch(`/api/analysis/${id}`);
    if (!response.ok) return null;
    const current = (await response.json()).task as Task;
    setTask(current);
    setProgressText(current.latestMessage || current.errorMessage || statusLabel(current.status));
    if (current.status === "completed") {
      const reportPath = collectFiles(current.workspace).find(path => path.endsWith("boyan-workbook-report.md"));
      if (reportPath) {
        const previewResponse = await fetch(`/api/analysis/${id}/preview?path=${encodeURIComponent(reportPath)}`);
        if (previewResponse.ok) {
          const preview = await previewResponse.json();
          const content = preview?.data?.content ?? preview?.data?.text ?? preview?.data ?? preview?.content;
          setReport(typeof content === "string" ? content : current.latestMessage ?? "分析已完成。");
        } else setReport(current.latestMessage ?? "分析已完成。");
      } else setReport(current.latestMessage ?? "分析已完成，请从产物列表下载完整报告。");
      setView("report");
    } else setView("progress");
    return current;
  }

  async function pollTask(id: string, isStopped: () => boolean = () => false) {
    while (!isStopped()) {
      const current = await refreshTask(id);
      if (!current || ["completed", "failed", "cancelled"].includes(current.status)) {
        await loadHistory();
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  async function consumeStream(response: Response, id: string) {
    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error ?? "无法启动分析");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = block.match(/^event:\s*(.+)$/m)?.[1];
        const raw = block.match(/^data:\s*(.+)$/m)?.[1];
        if (!raw) continue;
        const data = JSON.parse(raw);
        if (event === "infini") {
          const message = data?.data?.message ?? data?.data?.data?.message;
          if (typeof message?.text === "string" && message.text.trim()) setProgressText(message.text);
        }
        if (event === "failure") setProgressText(data.error ?? "分析失败");
      }
    }
    await refreshTask(id);
    await loadHistory();
  }

  async function startAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setFormError("");
    try {
      const response = await fetch("/api/analysis", { method: "POST", body: new FormData(event.currentTarget) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "文件上传失败");
      const created: Task = { id: payload.id, status: "queued", workbookName: "", latestMessage: null, errorMessage: null, workspace: [] };
      setTask(created); setProgressText("文件已上传，正在连接 InfiniSynapse…"); go("progress");
      await consumeStream(await fetch(`/api/analysis/${payload.id}/stream`), payload.id);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "操作失败");
      go("upload");
    } finally { setSubmitting(false); }
  }

  async function followUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!task) return;
    const form = event.currentTarget;
    const message = String(new FormData(form).get("message") ?? "").trim();
    if (!message) return;
    setProgressText("正在继续分析…"); go("progress");
    try {
      await consumeStream(await fetch(`/api/analysis/${task.id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) }), task.id);
      form.reset();
    } catch (error) { setProgressText(error instanceof Error ? error.message : "追问失败"); }
  }

  async function cancelTask() {
    if (!task) return;
    await fetch(`/api/analysis/${task.id}/cancel`, { method: "POST" });
    await refreshTask(task.id);
  }

  async function deleteHistoryTask(id: string) {
    const response = await fetch(`/api/analysis/${id}`, { method: "DELETE" });
    if (!response.ok) return false;
    setHistory(items => items.filter(item => item.id !== id));
    if (task?.id === id) { setTask(null); setReport(""); }
    return true;
  }

  return (
    <div className="shell">
      <header className="site-header">
        <button className="brand" onClick={() => go("home")}><span className="brand-mark">簿</span><span className="brand-name">簿言 <small>Bóyán</small></span></button>
        <nav className="nav"><button className={view === "home" ? "active" : ""} onClick={() => go("home")}>首页</button><button className={view === "upload" ? "active" : ""} onClick={() => go("upload")}>开始体检</button><button className={view === "progress" ? "active" : ""} onClick={() => go("progress")}>分析过程</button><button className={view === "report" ? "active" : ""} onClick={() => go("report")}>体检报告</button><Link href="/dashboard">可视化大屏</Link><Link href="/notes">记事本</Link><Link href="/ledger">记账本</Link></nav>
        <div className="account-menu"><span title={email}>{email}</span><form action={logoutAction}><button>退出</button></form></div>
      </header>
      <main>
        {view === "home" && <Home onUpload={() => go("upload")} onReport={() => task ? go("report") : go("upload")} />}
        {view === "upload" && <UploadPage onSubmit={startAnalysis} submitting={submitting} error={formError} history={history} onOpen={refreshTask} onDelete={deleteHistoryTask} />}
        {view === "progress" && <ProgressPage task={task} text={progressText} onCancel={cancelTask} />}
        {view === "report" && <ReportPage task={task} report={report} files={files} onFollowUp={followUp} onUpload={() => go("upload")} />}
      </main>
    </div>
  );
}

function Home({ onUpload, onReport }: { onUpload: () => void; onReport: () => void }) {
  return <section className="view"><div className="hero"><div className="hero-copy"><span className="eyebrow">Excel workbook intelligence</span><h1>让每一份复杂表格，<br/><em>都说得清楚。</em></h1><p className="lead">上传 Excel，自动理解工作簿结构、发现公式与数据风险，并生成下一位同事真正看得懂的交接说明书。</p><div className="hero-actions"><button className="primary" onClick={onUpload}>开始工作簿体检 <span className="arrow">→</span></button><button className="secondary" onClick={onReport}>查看最近报告</button></div><div className="privacy-note"><span>✓</span> 原文件不会被自动修改 · 所有发现均建议人工复核</div></div><HeroArt/></div><FeatureBand/></section>;
}

function UploadPage({ onSubmit, submitting, error, history, onOpen, onDelete }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void; submitting: boolean; error: string; history: HistoryTask[]; onOpen: (id: string) => void; onDelete: (id: string) => Promise<boolean> }) {
  const [pendingDelete, setPendingDelete] = useState<HistoryTask | null>(null);
  const [deleting, setDeleting] = useState(false);
  async function confirmDelete() { if (!pendingDelete) return; setDeleting(true); if (await onDelete(pendingDelete.id)) setPendingDelete(null); setDeleting(false); }
  return <><Page eyebrow="Workbook intake" title={<>把难懂的工作簿，<br/>交给我们先读一遍。</>} description="支持一个 .xlsx 工作簿，并可追加一份业务说明文档。"><div className="workspace"><form className="panel" onSubmit={onSubmit}><span className="panel-label">01 · 上传工作簿</span>{error && <div className="error-message">{error}</div>}<label className="dropzone"><div><div className="file-icon"/><h3>选择 Excel 工作簿</h3><p>仅支持 .xlsx，单文件不超过 25MB</p><input className="real-file-input" name="workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required/></div></label><label className="context-field"><span>业务说明（可选）</span><input name="context" type="file" accept=".pdf,.docx,.txt,.md"/><small>支持 PDF、DOCX、TXT、MD</small></label><button className="primary sample" disabled={submitting}>{submitting ? "正在上传…" : "开始体检 →"}</button></form><aside className="panel"><span className="panel-label">最近任务</span><div className="history-list">{history.length ? history.map(item=><div className="history-row" key={item.id}><button className="history-open" onClick={() => void onOpen(item.id)}><span>{item.workbook_name}</span><small className={`status-${item.status}`}>{statusLabel(item.status)}</small></button><button className="history-delete" onClick={() => setPendingDelete(item)} disabled={item.status === "queued" || item.status === "running"} aria-label={`删除${item.workbook_name}`} title={item.status === "queued" || item.status === "running" ? "请先取消进行中的任务" : "删除任务记录"}>🗑</button></div>) : <p className="hint">还没有分析记录。</p>}</div><a className="secondary sample download-sample" href="/sample/月度销售利润表示例.xlsx" download>下载示例工作簿</a></aside></div></Page>{pendingDelete && <div className="delete-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !deleting) setPendingDelete(null); }}><div className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="task-delete-title"><span>Delete record</span><h2 id="task-delete-title">是否确认删除？</h2><p>任务“{pendingDelete.workbook_name}”的本地分析记录将被删除，此操作无法恢复。</p><div><button className="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>取消</button><button className="confirm-delete" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? "正在删除…" : "确认删除"}</button></div></div></div>}</>;
}

function ProgressPage({ task, text, onCancel }: { task: Task | null; text: string; onCancel: () => void }) {
  const failed = task?.status === "failed" || task?.status === "cancelled";
  return <Page eyebrow="Analysis in progress" title={failed ? "本次分析没有完成。" : "正在读懂你的工作簿。"} description="页面会持续接收 InfiniSynapse 的真实执行消息。刷新后可从最近任务恢复。"><div className="progress-layout"><section className="panel"><span className="panel-label">任务状态</span><div className={`progress-ring ${failed ? "failed" : ""}`}><strong>{failed ? "!" : task?.status === "completed" ? "✓" : "AI"}</strong></div><div className="step-list"><Step done label="文件安全上传"/><Step done={task?.status !== "queued"} current={task?.status === "running"} label="结构、公式与数据分析"/><Step done={task?.status === "completed"} label="生成交接报告"/></div>{task?.status === "running" && <button className="secondary sample" onClick={onCancel}>取消分析</button>}</section><section className="agent-log"><span className="panel-label">InfiniSynapse 分析记录</span><div className="live-message">{text}<span className={task?.status === "running" ? "cursor" : ""}/></div>{task?.errorMessage && <div className="log-error">{task.errorMessage}</div>}</section></div></Page>;
}

function ReportPage({ task, report, files, onFollowUp, onUpload }: { task: Task | null; report: string; files: string[]; onFollowUp: (e: FormEvent<HTMLFormElement>) => void; onUpload: () => void }) {
  if (!task || task.status !== "completed") return <Page eyebrow="Workbook health report" title="还没有可查看的报告" description="完成一次工作簿分析后，报告与下载文件会显示在这里。"><button className="primary" onClick={onUpload}>开始体检</button></Page>;
  return <Page eyebrow="Workbook health report" title={<>{task.workbookName || "工作簿"}<br/>体检报告</>} description="以下内容来自 InfiniSynapse 的真实分析结果。"><div className="report-grid functional-report"><section className="panel report-content"><span className="panel-label">分析摘要</span><pre>{report || "分析已完成。"}</pre></section><aside className="panel"><span className="panel-label">任务产物</span><div className="file-list">{files.length ? files.map(path=><a key={path} href={`/api/analysis/${task.id}/download?path=${encodeURIComponent(path)}`}>{path}<span>↓</span></a>) : <p className="hint">未发现可下载文件，请查看分析摘要。</p>}</div><form className="follow-up" onSubmit={onFollowUp}><label htmlFor="message">继续追问</label><textarea id="message" name="message" rows={4} maxLength={2000} placeholder="例如：请进一步解释最高风险公式的影响范围" required/><button className="primary">发送追问 →</button></form></aside></div></Page>;
}

function Page({ eyebrow, title, description, children }: { eyebrow: string; title: React.ReactNode; description: string; children: React.ReactNode }) { return <section className="view page"><div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h2 className="page-title">{title}</h2></div><p>{description}</p></div>{children}</section>; }
function Step({ label, done=false, current=false }: { label:string; done?:boolean; current?:boolean }) { return <div className={`step ${current?"current":""}`}><span className="step-mark">{done?"✓":"·"}</span><span>{label}</span><small>{done?"完成":current?"进行中":"等待"}</small></div>; }
function statusLabel(status: TaskStatus) { return ({ queued:"等待中", running:"分析中", completed:"已完成", failed:"失败", cancelled:"已取消" })[status]; }

function collectFiles(value: unknown): string[] {
  const paths = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node === "string" && /\.[a-z0-9]{1,8}$/i.test(node)) paths.add(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      const item = node as Record<string, unknown>;
      const path = item.path ?? item.fileName ?? item.filename ?? item.logicalPath;
      if (typeof path === "string" && /\.[a-z0-9]{1,8}$/i.test(path)) paths.add(path);
      Object.values(item).forEach(walk);
    }
  };
  walk(value);
  return [...paths].filter(path => !path.startsWith("upload_documents/") && !path.startsWith("use_external_tool/"));
}

function HeroArt(){return <div className="hero-art"><div className="sheet-window"><div className="sheet-bar"><i className="dot"/><i className="dot"/><i className="dot"/><span className="sheet-title">月度销售利润表.xlsx</span></div><div className="sheet-grid"><span className="cell c1">销售汇总</span><span className="cell c2">华东区域</span><span className="cell c3">¥ 326,800</span><span className="cell c4">=SUM(F4:F38)</span><div className="row-highlight"/></div></div><div className="finding-card"><div className="finding-top"><span>高风险发现</span><span>01 / 08</span></div><h3>新增三行未计入销售额</h3><p>汇总公式停留在 F38，但数据已延伸至 F41，预计少计 ¥28,600。</p></div><div className="art-index">01</div></div>}
function FeatureBand(){return <div className="feature-band"><div className="section-head"><div><span className="eyebrow">What it reveals</span><h2>不只检查数字，<br/>也解释表格为何如此运转。</h2></div><p>从结构、公式、数据到业务口径，生成带证据、可定位、可复核的工作簿健康报告。</p></div><div className="feature-grid">{[["01","结构梳理","识别每个 Sheet 的用途、关键字段、输入与输出区域，以及跨表关系。"],["02","风险体检","发现公式模式异常、引用遗漏、重复数据和指标口径冲突，并保留证据。"],["03","自动交接","整理更新步骤、指标解释和维护注意事项，生成可直接下载的交接说明书。"]].map(x=><article className="feature" key={x[0]}><span className="feature-index">{x[0]}</span><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div></div>}
