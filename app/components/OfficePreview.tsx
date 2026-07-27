"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type ShellProps = { email: string; logoutAction: () => Promise<void>; active: "dashboard" | "notes" | "ledger"; children: React.ReactNode };

export function OfficeShell({ email, logoutAction, active, children }: ShellProps) {
  return <div className="shell office-shell">
    <header className="site-header office-header">
      <Link className="brand" href="/workspace"><span className="brand-mark">簿</span><span className="brand-name">簿言 <small>Bóyán</small></span></Link>
      <nav className="office-nav" aria-label="主要导航">
        <Link href="/workspace">工作簿分析</Link>
        <Link className={active === "dashboard" ? "active" : ""} href="/dashboard">可视化大屏</Link>
        <Link className={active === "notes" ? "active" : ""} href="/notes">记事本</Link>
        <Link className={active === "ledger" ? "active" : ""} href="/ledger">记账本</Link>
      </nav>
      <div className="account-menu"><span title={email}>{email}</span><form action={logoutAction}><button>退出</button></form></div>
    </header>
    <main>{children}</main>
  </div>;
}

type DashboardData = { empty?: boolean; message?: string; taskId?: string; workbookName?: string; sheets?: string[]; selectedSheet?: string; rowCount?: number; headers?: string[]; primaryMetric?: string | null; metrics?: { label: string; value: number }[]; trend?: { label: string; value: number }[]; categories?: { label: string; value: number }[] };

export function DashboardPreview() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [health, setHealth] = useState("—");
  const [riskCount, setRiskCount] = useState(0);
  async function loadDashboard(sheet?: string) { const response = await fetch(`/api/dashboard${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ""}`); if (response.ok) setDashboard(await response.json()); }
  useEffect(() => { void loadDashboard(); void (async () => {
    const historyResponse = await fetch("/api/analysis");
    if (!historyResponse.ok) return;
    const history = await historyResponse.json();
    const latest = (history.tasks ?? []).find((item: { status: string }) => item.status === "completed");
    if (!latest) return;
    const taskResponse = await fetch(`/api/analysis/${latest.id}`);
    if (!taskResponse.ok) return;
    const task = (await taskResponse.json()).task;
    const reportPath = findReportPath(task.workspace);
    if (!reportPath) return;
    const previewResponse = await fetch(`/api/analysis/${latest.id}/preview?path=${encodeURIComponent(reportPath)}`);
    if (!previewResponse.ok) return;
    const preview = await previewResponse.json();
    const report = String(preview?.data?.content ?? preview?.data?.text ?? preview?.data ?? "");
    setHealth(report.match(/总分[^\d]{0,30}(\d{1,3})/)?.[1] ?? report.match(/健康度[^\d]{0,20}(\d{1,3})/)?.[1] ?? "—");
    const count = [...report.matchAll(/F-\d{3}/g)].map(match => match[0]);
    setRiskCount(new Set(count).size);
  })(); }, []);
  const trend = dashboard?.trend ?? [];
  const categories = dashboard?.categories ?? [];
  const trendMax = Math.max(...trend.map(item => item.value), 1);
  const categoryMax = Math.max(...categories.map(item => item.value), 1);
  return <section className="dashboard-view">
    <div className="dashboard-heading">
      <div><span className="eyebrow">Workbook visual intelligence</span><h1>{dashboard?.workbookName ?? "等待工作簿分析"}<br/><em>可视化大屏</em></h1><p>{dashboard?.empty ? dashboard.message : `当前展示 ${dashboard?.selectedSheet ?? "—"} · ${dashboard?.rowCount ?? 0} 行真实数据`}</p></div>
      <div className="dashboard-tools">{dashboard?.sheets?.length ? <label>工作表<select value={dashboard.selectedSheet} onChange={e => void loadDashboard(e.target.value)}>{dashboard.sheets.map(item => <option key={item}>{item}</option>)}</select></label> : null}<Link className="secondary" href="/workspace">返回工作簿分析</Link></div>
    </div>
    {dashboard?.empty ? <div className="dashboard-empty"><strong>暂无可视化数据</strong><p>{dashboard.message}</p><Link href="/workspace" className="primary">上传工作簿 →</Link></div> : <>
    <div className="metric-grid"><Metric label="工作簿健康度" value={health} suffix="/ 100" note="来自分析报告" warning />{(dashboard?.metrics ?? []).slice(0,3).map(metric => <Metric key={metric.label} label={metric.label} value={metric.value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })} note={`来自 ${dashboard?.selectedSheet}`} />)}</div>
    <div className="dashboard-grid">
      <article className="viz-card revenue-card"><CardHead kicker="Data trend" title={trend.length ? `${dashboard?.primaryMetric ?? "数值"}趋势` : "未识别到日期趋势"} legend={dashboard?.selectedSheet ?? ""}/>{trend.length ? <div className="dynamic-columns">{trend.slice(-20).map(item => <div key={item.label}><i style={{height:`${Math.max(4,item.value/trendMax*100)}%`}}/><span>{item.label.slice(5)}</span><b>{item.value.toLocaleString("zh-CN",{maximumFractionDigits:1})}</b></div>)}</div> : <p className="viz-empty">当前工作表没有同时满足条件的日期列与数值列。</p>}</article>
      <article className="viz-card risk-chart-card"><CardHead kicker="Analysis result" title="分析概览" legend="真实报告"/><div className="report-facts"><strong>{health}</strong><span>健康度 / 100</span><strong>{riskCount || "—"}</strong><span>已识别风险</span></div></article>
      <article className="viz-card category-card"><CardHead kicker="Category view" title={categories.length ? `${dashboard?.primaryMetric ?? "数值"}分类分布` : "未识别到分类分布"} legend={dashboard?.selectedSheet ?? ""}/>{categories.length ? <div className="bar-list">{categories.map(item => <div key={item.label}><span>{item.label}</span><div><i style={{width:`${Math.max(2,item.value/categoryMax*100)}%`}}/></div><b>{item.value.toLocaleString("zh-CN",{maximumFractionDigits:1})}</b></div>)}</div> : <p className="viz-empty">当前工作表没有适合分组的文本字段与数值字段。</p>}</article>
      <article className="viz-card findings-card"><CardHead kicker="Workbook structure" title="数据结构" legend={`${dashboard?.rowCount ?? 0} 行`}/><div className="structure-list">{(dashboard?.headers ?? []).slice(0,12).map((header,index)=><span key={`${header}-${index}`}>{header}</span>)}</div></article>
    </div>
    <p className="dashboard-footnote">所有指标均来自工作簿与分析报告；推断性结论需人工复核。</p>
    </>}
  </section>;
}

function findReportPath(value: unknown): string | null {
  if (typeof value === "string" && value.endsWith("boyan-workbook-report.md")) return value;
  if (Array.isArray(value)) for (const item of value) { const found = findReportPath(item); if (found) return found; }
  if (value && typeof value === "object") for (const item of Object.values(value as Record<string, unknown>)) { const found = findReportPath(item); if (found) return found; }
  return null;
}

function Metric({ label, value, suffix, note, warning = false }: { label: string; value: string; suffix?: string; note: string; warning?: boolean }) { return <article className={`metric-card ${warning ? "warning" : ""}`}><span>{label}</span><strong>{value}<small>{suffix}</small></strong><p>{note}</p></article>; }
function CardHead({ kicker, title, legend }: { kicker: string; title: string; legend: string }) { return <header className="viz-card-head"><div><span>{kicker}</span><h2>{title}</h2></div><small>{legend}</small></header>; }

type Note = { id: string | number; title: string; body: string; tag: string; date: string };
type Attachment = { id: string; file_name: string; file_size: number };

function downloadText(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName.replace(/[\\/:*?"<>|]/g, "-");
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
const initialNotes: Note[] = [
  { id: 1, title: "七月销售表复核事项", body: "先修正销售汇总 B4 的引用范围，再恢复 I25 成本公式。修复完成后重新核对销售额、成本与毛利。", tag: "关联报告", date: "今天 14:32" },
  { id: 2, title: "周会待办", body: "确认 SO-202607-023 是否存在，并向华东区域负责人核实 C32 的实际归属。", tag: "工作待办", date: "昨天 18:10" },
  { id: 3, title: "交接说明补充", body: "需要在业务说明中加入公式扩展步骤，以及每月更新后的交叉验证流程。", tag: "交接记录", date: "7 月 25 日" },
];

export function NotesPreview() {
  const [notes, setNotes] = useState(initialNotes);
  const [selected, setSelected] = useState<string | number>(1);
  const [query, setQuery] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentError, setAttachmentError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const [deleting, setDeleting] = useState(false);
  const active = notes.find(note => note.id === selected) ?? notes[0];
  const filtered = notes.filter(note => `${note.title}${note.body}`.includes(query));
  useEffect(() => { void fetch("/api/notes").then(response => response.json()).then(data => {
    const loaded = (data.notes ?? []).map((note: Record<string, unknown>) => ({ id: String(note.id), title: String(note.title), body: String(note.body), tag: String(note.tag), date: new Date(String(note.updated_at)).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) }));
    setNotes(loaded); setSelected(loaded[0]?.id ?? 0);
  }); }, []);
  useEffect(() => { if (!active) { setAttachments([]); return; } void fetch(`/api/notes/${active.id}/attachments`).then(response => response.json()).then(data => setAttachments(data.attachments ?? [])); }, [active?.id]);
  async function addNote() { const response = await fetch("/api/notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "无标题笔记", body: "", tag: "个人笔记" }) }); const data = await response.json(); if (!response.ok) return; const note = { id: data.note.id, title: data.note.title, body: data.note.body, tag: data.note.tag, date: "刚刚" }; setNotes(items => [note, ...items]); setSelected(note.id); }
  async function update(key: "title" | "body", value: string) { const changed = { ...active, [key]: value, date: "刚刚" }; setNotes(items => items.map(note => note.id === active.id ? changed : note)); await fetch(`/api/notes/${active.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: changed.title, body: changed.body }) }); }
  async function confirmDelete() { if (!pendingDelete) return; setDeleting(true); const response = await fetch(`/api/notes/${pendingDelete.id}`, { method: "DELETE" }); if (response.ok) { const remaining = notes.filter(note => note.id !== pendingDelete.id); setNotes(remaining); if (selected === pendingDelete.id) setSelected(remaining[0]?.id ?? 0); setPendingDelete(null); } setDeleting(false); }
  async function addAttachment(file: File | undefined) { if (!active || !file) return; setAttachmentError(""); const data = new FormData(); data.set("file", file); const response = await fetch(`/api/notes/${active.id}/attachments`, { method: "POST", body: data }); const payload = await response.json(); if (!response.ok) { setAttachmentError(payload.error ?? "文件添加失败"); return; } setAttachments(items => [payload.attachment, ...items]); }
  async function removeAttachment(id: string) { if (!active) return; const response = await fetch(`/api/notes/${active.id}/attachments/${id}`, { method: "DELETE" }); if (response.ok) setAttachments(items => items.filter(item => item.id !== id)); }
  function downloadNote() {
    if (!active) return;
    const fileSection = attachments.length ? `\n\n## 相关文件\n\n${attachments.map(file => `- ${file.file_name}`).join("\n")}` : "";
    downloadText(`${active.title || "无标题笔记"}.md`, `# ${active.title || "无标题笔记"}\n\n> ${active.tag} · ${active.date}\n\n${active.body}${fileSection}\n`, "text/markdown;charset=utf-8");
  }
  return <section className="notebook-view">
    <div className="notebook-sidebar"><div className="notebook-title"><div><span>Personal notes</span><h1>记事本</h1></div><div className="notebook-actions"><button className="note-download" onClick={downloadNote} disabled={!active}>下载当前笔记</button><button onClick={addNote} aria-label="新建笔记" title="新建笔记">＋</button></div></div><label className="note-search">⌕<input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索笔记"/></label><div className="note-filters"><button className="active">全部笔记 <span>{notes.length}</span></button><button>关联报告 <span>{notes.filter(n=>n.tag==="关联报告").length}</span></button></div><div className="note-list">{filtered.map(note => <div className={selected === note.id ? "active" : ""} key={note.id}><button className="note-select" onClick={() => setSelected(note.id)}><small>{note.tag}</small><b>{note.title}</b><p>{note.body}</p><time>{note.date}</time></button><button className="note-delete" onClick={() => setPendingDelete(note)} aria-label={`删除${note.title || "无标题笔记"}`} title="删除笔记">🗑</button></div>)}</div></div>
    <div className="note-paper">{active ? <><div className="paper-tools"><span>{active.tag} · {active.date}自动保存</span></div><input className="note-heading-input" value={active.title} onChange={e => update("title", e.target.value)} aria-label="笔记标题"/><textarea className="note-body-input" value={active.body} onChange={e => update("body", e.target.value)} placeholder="在这里记录新的想法……" aria-label="笔记正文"/><div className="note-attachments"><label className="attachment-add">＋ 添加相关文件<input type="file" accept=".xlsx,.xls,.pdf,.docx,.doc,.txt,.md,.csv" onChange={event => { void addAttachment(event.target.files?.[0]); event.target.value = ""; }}/></label><small>支持 Excel、PDF、Word、TXT、MD、CSV，单文件不超过 10MB</small>{attachmentError && <p className="attachment-error">{attachmentError}</p>}{attachments.length > 0 && <div className="attachment-list">{attachments.map(file => <div key={file.id}><span><b>{file.file_name}</b><small>{(file.file_size / 1024).toFixed(1)} KB</small></span><a href={`/api/notes/${active.id}/attachments/${file.id}`}>下载</a><button onClick={() => void removeAttachment(file.id)}>移除</button></div>)}</div>}</div></> : <div className="empty-note">新建一则笔记，留住今天的思路。</div>}</div>
    {pendingDelete && <div className="delete-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !deleting) setPendingDelete(null); }}><div className="delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-description"><span>Delete note</span><h2 id="delete-dialog-title">是否确认删除？</h2><p id="delete-dialog-description">笔记“{pendingDelete.title || "无标题笔记"}”删除后无法恢复。</p><div><button className="secondary" onClick={() => setPendingDelete(null)} disabled={deleting}>取消</button><button className="confirm-delete" onClick={() => void confirmDelete()} disabled={deleting}>{deleting ? "正在删除…" : "确认删除"}</button></div></div></div>}
  </section>;
}

type Entry = { id: string | number; type: "支出" | "收入"; category: string; amount: number; date: string; note: string };
const initialEntries: Entry[] = [
  { id: 1, type: "支出", category: "办公用品", amount: 1280, date: "2026-07-27", note: "人体工学键盘采购" },
  { id: 2, type: "收入", category: "报销", amount: 860, date: "2026-07-26", note: "差旅费用报销" },
  { id: 3, type: "支出", category: "差旅", amount: 2350, date: "2026-07-24", note: "上海客户拜访" },
  { id: 4, type: "支出", category: "交通", amount: 286, date: "2026-07-22", note: "市内交通" },
  { id: 5, type: "收入", category: "其他", amount: 5200, date: "2026-07-18", note: "项目奖金" },
];

export function LedgerPreview() {
  const [entries, setEntries] = useState(initialEntries);
  const [type, setType] = useState<"支出" | "收入">("支出");
  const [filter, setFilter] = useState("全部");
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");
  const visible = filter === "全部" ? entries : entries.filter(entry => entry.type === filter);
  const today = new Date();
  const chartYear = today.getFullYear();
  const monthPrefix = `${chartYear}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const chart = useMemo(() => {
    const current = entries.filter(entry => entry.date.startsWith(monthPrefix));
    const income = current.filter(entry => entry.type === "收入");
    const expense = current.filter(entry => entry.type === "支出");
    const months = Array.from({ length: 12 }, (_, index) => {
      const prefix = `${chartYear}-${String(index + 1).padStart(2, "0")}`;
      const rows = entries.filter(entry => entry.date.startsWith(prefix));
      return { label: `${index + 1}月`, income: rows.filter(entry => entry.type === "收入").reduce((sum, entry) => sum + entry.amount, 0), expense: rows.filter(entry => entry.type === "支出").reduce((sum, entry) => sum + entry.amount, 0) };
    });
    const categoryMap = new Map<string, number>();
    expense.forEach(entry => categoryMap.set(entry.category, (categoryMap.get(entry.category) ?? 0) + entry.amount));
    const categories = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
    return { income: income.reduce((sum, entry) => sum + entry.amount, 0), expense: expense.reduce((sum, entry) => sum + entry.amount, 0), incomeCount: income.length, expenseCount: expense.length, months, categories };
  }, [entries, chartYear, monthPrefix]);
  const chartMax = Math.max(0, ...chart.months.flatMap(month => [month.income, month.expense]));
  const categoryColors = ["#627f70", "#8fa99a", "#c9a887", "#b87965", "#9ea88a", "#7e8f87"];
  let categoryOffset = 0;
  const donutBackground = chart.expense > 0 ? `conic-gradient(${chart.categories.map((category, index) => { const start = categoryOffset; categoryOffset += category.value / chart.expense * 100; return `${categoryColors[index % categoryColors.length]} ${start}% ${categoryOffset}%`; }).join(",")})` : "var(--sage-soft)";
  useEffect(() => { void fetch("/api/ledger").then(response => response.json()).then(data => setEntries(data.entries ?? [])); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const element = event.currentTarget; const form = new FormData(element); const amount = Number(form.get("amount")); if (!amount) return; const response = await fetch("/api/ledger", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type, category: String(form.get("category")), amount, date: String(form.get("date")), note: String(form.get("note")) }) }); const data = await response.json(); if (!response.ok) return; setEntries(items => [data.entry, ...items]); element.reset(); }
  async function removeEntry(id: string | number) { if (!window.confirm("确定删除这笔账目吗？")) return; const response = await fetch(`/api/ledger/${id}`, { method: "DELETE" }); if (response.ok) setEntries(items => items.filter(entry => entry.id !== id)); }
  async function saveEntry(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editingEntry) return; setSavingEdit(true); setEditError(""); const form = new FormData(event.currentTarget); const response = await fetch(`/api/ledger/${editingEntry.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: String(form.get("type")), category: String(form.get("category")), amount: Number(form.get("amount")), date: String(form.get("date")), note: String(form.get("note")) }) }); const data = await response.json(); if (response.ok) { setEntries(items => items.map(item => item.id === editingEntry.id ? data.entry : item)); setEditingEntry(null); } else setEditError(data.error ?? "账目修改失败"); setSavingEdit(false); }
  function downloadLedger() {
    const rows = [["日期", "类型", "分类", "金额", "备注"], ...visible.map(entry => [entry.date, entry.type, entry.category, entry.amount, entry.note])];
    const csv = `\uFEFF${rows.map(row => row.map(csvCell).join(",")).join("\r\n")}`;
    downloadText(`簿言记账本-${filter}-${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
  }
  return <section className="ledger-view"><div className="ledger-heading"><div><span className="eyebrow">Simple office ledger</span><h1>收支有迹，<em>心中有数。</em></h1><p>轻量记录日常办公收支，清楚看见每一笔钱的去向。</p></div><div className="ledger-actions"><button className="secondary" onClick={downloadLedger} disabled={!visible.length}>下载{filter}账目 ↓</button><button className="primary" onClick={() => document.getElementById("ledger-form")?.scrollIntoView({behavior:"smooth"})}>＋ 记一笔</button></div></div>
    <div className="ledger-summary"><article><span>本月收入</span><strong>¥ {chart.income.toLocaleString("zh-CN",{minimumFractionDigits:2})}</strong><small>{chart.incomeCount} 笔收入</small></article><article><span>本月支出</span><strong>¥ {chart.expense.toLocaleString("zh-CN",{minimumFractionDigits:2})}</strong><small>{chart.expenseCount} 笔支出</small></article><article className="balance"><span>本月结余</span><strong>¥ {(chart.income-chart.expense).toLocaleString("zh-CN",{minimumFractionDigits:2})}</strong><small>收入 − 支出</small></article></div>
    <div className="ledger-grid"><article className="viz-card ledger-trend"><CardHead kicker="Monthly flow" title="月度收支趋势" legend={`${chartYear} 年`}/><div className="ledger-bars">{chart.months.map(month => <div key={month.label}><i title={`收入 ¥${month.income.toLocaleString()}`} style={{height: month.income && chartMax ? `${Math.max(4, month.income / chartMax * 100)}%` : 0}}/><b title={`支出 ¥${month.expense.toLocaleString()}`} style={{height: month.expense && chartMax ? `${Math.max(4, month.expense / chartMax * 100)}%` : 0}}/><span>{month.label}</span></div>)}</div><div className="trend-legend"><span><i/>收入</span><span><i/>支出</span></div></article><article className="viz-card expense-ring"><CardHead kicker="Expense mix" title="支出分类" legend="本月"/>{chart.expense > 0 ? <div className="donut-wrap"><div className="donut expense dynamic-donut" style={{background: donutBackground}}><div><strong>¥{chart.expense.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</strong><span>总支出</span></div></div><ul>{chart.categories.map((category,index)=><li key={category.label}><i style={{background:categoryColors[index % categoryColors.length]}}/>{category.label} <b>{Math.round(category.value/chart.expense*100)}%</b></li>)}</ul></div> : <div className="ledger-empty-chart">本月还没有支出记录</div>}</article></div>
    <div className="ledger-bottom"><section className="ledger-table"><header><div><span>Recent entries</span><h2>最近账目</h2></div><div className="entry-tabs">{["全部","收入","支出"].map(item=><button className={filter===item?"active":""} onClick={()=>setFilter(item)} key={item}>{item}</button>)}</div></header><div className="entry-list">{visible.map(entry=><div key={entry.id}><span className={`entry-icon ${entry.type}`}>{entry.type === "收入" ? "↙" : "↗"}</span><span><b>{entry.note || "未填写备注"}</b><small><time>{entry.date}</time><em>{entry.category}</em></small></span><strong className={entry.type}>{entry.type === "收入" ? "+" : "−"} ¥{entry.amount.toLocaleString()}</strong><button className="entry-edit" onClick={() => { setEditError(""); setEditingEntry(entry); }} aria-label="编辑账目">✎</button><button className="entry-delete" onClick={() => void removeEntry(entry.id)} aria-label="删除账目">×</button></div>)}</div></section>
    <form id="ledger-form" className="ledger-form" onSubmit={submit}><span>Quick entry</span><h2>记一笔</h2><div className="type-switch"><button type="button" className={type==="支出"?"active":""} onClick={()=>setType("支出")}>支出</button><button type="button" className={type==="收入"?"active":""} onClick={()=>setType("收入")}>收入</button></div><label>金额<input name="amount" type="number" min="0.01" step="0.01" placeholder="0.00" required/></label><label>分类<select name="category"><option>办公用品</option><option>差旅</option><option>交通</option><option>餐饮</option><option>报销</option><option>工资</option><option>其他</option></select></label><label>日期<input name="date" type="date" defaultValue={`${chartYear}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`} required/></label><label>备注<input name="note" placeholder="这笔钱用在了哪里？"/></label><button className="primary">保存记录 →</button></form></div>
    {editingEntry && <div className="delete-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !savingEdit) setEditingEntry(null); }}><form className="edit-entry-dialog" onSubmit={saveEntry} role="dialog" aria-modal="true" aria-labelledby="edit-entry-title"><span>Edit entry</span><h2 id="edit-entry-title">修改账目</h2><div className="edit-entry-grid"><label>收支类型<select name="type" defaultValue={editingEntry.type}><option>支出</option><option>收入</option></select></label><label>金额<input name="amount" type="number" min="0.01" step="0.01" defaultValue={editingEntry.amount} required/></label><label>分类<select name="category" defaultValue={editingEntry.category}>{["办公用品","差旅","交通","餐饮","报销","工资","其他"].map(item=><option key={item}>{item}</option>)}</select></label><label>日期<input name="date" type="date" defaultValue={editingEntry.date} required/></label><label className="edit-note-field">备注<input name="note" defaultValue={editingEntry.note}/></label></div>{editError && <p className="error-message">{editError}</p>}<div className="edit-dialog-actions"><button type="button" className="secondary" onClick={() => setEditingEntry(null)} disabled={savingEdit}>取消</button><button className="primary" disabled={savingEdit}>{savingEdit ? "正在保存…" : "保存修改"}</button></div></form></div>}
  </section>;
}
