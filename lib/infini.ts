import "server-only";

const serverUrl = process.env.INFINISYNAPSE_SERVER_URL ?? "https://app.infinisynapse.cn";

function apiKey() {
  const key = process.env.INFINISYNAPSE_API_KEY;
  if (!key) throw new Error("INFINISYNAPSE_API_KEY is not configured");
  return key;
}

export function infiniHeaders(extra?: HeadersInit) {
  return { Authorization: `Bearer ${apiKey()}`, "x-lang": "zh_CN", ...extra };
}

export async function infiniFetch(path: string, init?: RequestInit) {
  const response = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: infiniHeaders(init?.headers),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`InfiniSynapse ${response.status}: ${detail.slice(0, 500)}`);
  }
  return response;
}

export async function uploadTaskFile(taskId: string, file: File) {
  const data = new FormData();
  data.append("file", file, file.name);
  const response = await infiniFetch(`/api/tools/taskUpload/${encodeURIComponent(taskId)}?subdir=upload_documents&naming=original`, {
    method: "POST",
    body: data,
  });
  return response.json();
}

export async function getWorkspace(taskId: string) {
  const response = await infiniFetch(`/api/ai_task/getTaskWorkspace/${encodeURIComponent(taskId)}`);
  const payload = await response.json();
  return payload?.data?.files ?? payload?.files ?? payload?.data ?? [];
}

export function analysisPrompt(workbookName: string, contextName?: string | null) {
  const snapshotName = `${workbookName.replace(/\.xlsx$/i, "")}-结构化快照.md`;
  return `你是“簿言 Bóyán”的 Excel 工作簿审计与交接分析师。直接执行，不要创建多阶段计划，不要使用 SQL、网页搜索或浏览器。优先使用普通文件读取工具读取 upload_documents/${snapshotName}，它是从原始工作簿提取的可信结构化快照，包含 Sheet、单元格位置、值和公式；不要使用会解析 XLSX 的工具读取 ${workbookName}，避免重复解析错误。${contextName ? `同时读取业务说明 ${contextName}。` : ""}完成以下任务：
1. 识别所有 Sheet 的用途、关键字段、输入区、计算区、输出区及跨表关系。
2. 检查公式一致性、引用范围遗漏、固定值替代公式、错误值、异常外部引用等风险。
3. 检查重复记录、缺失值、日期/金额类型、分类名称不一致及汇总与明细不一致。
4. ${contextName ? "对照业务说明检查指标口径冲突。" : "从表格证据推断业务口径，但明确标注假设。"}
5. 每条发现必须给出：风险级别、类别、Sheet/单元格或记录位置、证据、可能影响、置信度、建议复核动作。不得把推测写成确定事实，不得修改原文件。
6. 在工作区生成简明 Markdown 报告。调用 write_to_file 时必须同时传入 path 和 content，其中 path 必须明确设为 boyan-workbook-report.md。报告只允许包含以下四个部分，并严格按此顺序输出：
   # 一句话结论
   用 1 至 2 句话说明这份表格整体是否可靠，以及最需要关注的问题。
   ## 关键发现
   列出最重要的 3 至 5 条发现，按风险从高到低排列。每条只写问题、位置和影响，使用日常语言，避免审计术语。
   ## 重要数据
   列出最值得关注的 3 至 5 个数字、趋势或异常；没有可靠数据时明确写“未发现可确认的重要数据”，不得编造。
   ## 建议处理
   给出最多 4 条可以直接执行的下一步，并标明优先顺序。
   整份报告控制在 600 个中文字符左右，不输出工作簿结构清单、指标口径长文、维护步骤、交接清单或重复证据。详细证据仅在用户追问时补充。
7. 控制在 50 次工具请求以内，不生成图表或额外 CSV。写完 Markdown 后立即返回 completion_result，不再做重复复核。`;
}
