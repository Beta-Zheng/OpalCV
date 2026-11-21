/* ------------------------------------------------------------------
 * LLM Gateway：统一请求结构 / Provider 接口化 / 路由策略
 * - ollama 协议：{base}/api/chat
 * - openai_compatible：{base}/chat/completions
 * - 外部模型默认关闭；无可用模型时降级为本地规则引擎
 * - 所有 AI 输出必须通过 JSON 校验，失败自动重试一次
 * ------------------------------------------------------------------ */
import type {
  AIAction,
  Block,
  ModelProvider,
  PrivacyLike,
  RouteStrategy,
} from "./ai-types";
import { ACTION_LABELS } from "../types";
import { containsTerm, stripHtml, hasAchievementMetric } from "./utils";

export interface AISuggestionOutput {
  suggested_block: Block;
  explanation: string;
  matched_keywords: string[];
  warnings: string[];
}

/* ---------------- 系统 Prompt（§14.1，禁止编造） ---------------- */

const SYSTEM_PROMPT = `你是一名专业简历优化顾问。

要求：
1. 只能基于用户提供的内容进行优化。
2. 不得编造不存在的项目、公司、技能、职位、数据指标。
3. 如果用户没有提供数字，不要编造数字。
4. 如果需要量化结果，只能给出"建议补充"的提示，放在 warnings 数组。
5. 输出必须为合法 JSON。
6. 不要输出 Markdown 代码块。
7. 不要输出额外解释。
8. 保持语言简洁、专业、结果导向。
9. 保留职责强度，不得把参与或协助改成主导。保留日期、专名及估算限定词。`;

const ACTION_INSTRUCTION: Record<AIAction, string> = {
  polish:
    "动作：润色。保留全部事实与数字，仅优化措辞，使表达更专业、结果导向。",
  rewrite:
    "动作：改写。将每条 bullet 重组为「动作 + 做了什么 + 已提供的成果」结构，不新增事实，不提升职责强度。",
  quantify:
    "动作：量化建议。不要修改 bullets 内容，只在 warnings 中指出每条可以补充的量化指标位置。",
  shorten:
    "动作：缩短。删除冗余词与修饰语，以保留全部事实和数字为先。无法安全缩短时保留原文，并在 warnings 提示拆分。",
  translate:
    "动作：翻译为英文。翻译标题、副标题、描述与要点。保留公司/学校专名、日期、技术名词、数字和职责强度，不新增或提升事实。不确定的专名保留原文并在 warnings 提醒用户。",
  expand:
    "动作：扩写。按「背景 / 方案 / 结果」补充结构性描述，仅基于已有信息合理展开，不编造新数据。",
  jd_match:
    "动作：根据 JD 优化。在不编造的前提下，让表述向 JD 关键词靠拢，并在 matched_keywords 列出命中的关键词。",
  ats_optimize:
    "动作：ATS 优化。使用标准动词开头，去除特殊符号与表情，关键词前置，保证纯文本可读。",
};

/* ---------------- Provider ---------------- */

export class ProviderError extends Error {
  constructor(public status: number) {
    super(`模型服务返回 HTTP ${status}，请检查服务配置与鉴权`);
  }
}

export interface ChatStreamOptions {
  signal?: AbortSignal;
  stream?: boolean;
  onChunk?: (chunk: string, accumulated: string) => void;
  onProgress?: (accumulated: string) => void;
}

function normalizeChatOptions(
  signalOrOptions?: AbortSignal | ChatStreamOptions
): ChatStreamOptions {
  if (!signalOrOptions) return {};
  if ("aborted" in signalOrOptions) {
    return { signal: signalOrOptions };
  }
  return signalOrOptions;
}

function shouldStream(options: ChatStreamOptions): boolean {
  if (options.stream === false) return false;
  return Boolean(options.stream || options.onChunk || options.onProgress);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<any> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (init.signal?.aborted) ctrl.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new ProviderError(res.status);
    // Keep the timeout active while the response body is being received.
    return await res.json();
  } finally {
    clearTimeout(t);
    init.signal?.removeEventListener("abort", abort);
  }
}

async function readStreamWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  extractDelta: (line: string) => string,
  extractFallbackJson: (data: any) => string,
  options: ChatStreamOptions
): Promise<string> {
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (init.signal?.aborted) ctrl.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const onAbort = () => {
    reader?.cancel(new DOMException("timeout", "AbortError")).catch(() => {});
  };
  ctrl.signal.addEventListener("abort", onAbort, { once: true });

  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new ProviderError(res.status);

    const contentType = res.headers?.get?.("content-type") ?? "";
    if (!res.body || contentType.includes("application/json")) {
      const data = await res.json();
      const text = extractFallbackJson(data);
      if (text) {
        options.onChunk?.(text, text);
        options.onProgress?.(text);
      }
      return text;
    }

    reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let accumulated = "";

    const emitLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line) return;
      const delta = extractDelta(line);
      if (!delta) return;
      accumulated += delta;
      options.onChunk?.(delta, accumulated);
      options.onProgress?.(accumulated);
    };

    while (true) {
      if (ctrl.signal.aborted) {
        throw new DOMException("timeout", "AbortError");
      }
      const { value, done } = await reader.read();
      if (ctrl.signal.aborted) {
        throw new DOMException("timeout", "AbortError");
      }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        emitLine(line);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      emitLine(buffer);
    }
    return accumulated;
  } finally {
    clearTimeout(t);
    ctrl.signal.removeEventListener("abort", onAbort);
    init.signal?.removeEventListener("abort", abort);
  }
}

function parseOllamaStreamLine(line: string): string {
  try {
    const parsed = JSON.parse(line);
    return parsed?.message?.content ?? parsed?.response ?? "";
  } catch {
    return "";
  }
}

function parseOpenAIStreamLine(line: string): string {
  if (!line.startsWith("data:")) return "";
  const payload = line.slice(5).trim();
  if (!payload || payload === "[DONE]") return "";
  try {
    const parsed = JSON.parse(payload);
    return (
      parsed?.choices?.[0]?.delta?.content ??
      parsed?.choices?.[0]?.message?.content ??
      ""
    );
  } catch {
    return "";
  }
}

export async function chatOllama(
  p: ModelProvider,
  messages: Array<{ role: string; content: string }>,
  signalOrOptions?: AbortSignal | ChatStreamOptions
): Promise<string> {
  const options = normalizeChatOptions(signalOrOptions);
  const stream = shouldStream(options);
  const base = (p.base_url || "http://localhost:11434").replace(/\/$/, "");
  const init: RequestInit = {
    method: "POST",
    signal: options.signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: p.model_name,
      messages,
      stream,
      format: "json",
      options: { temperature: p.temperature },
    }),
  };

  if (stream) {
    return readStreamWithTimeout(
      `${base}/api/chat`,
      init,
      p.timeout_ms,
      parseOllamaStreamLine,
      (res) => res?.message?.content ?? "",
      options
    );
  }

  const res = await fetchWithTimeout(`${base}/api/chat`, init, p.timeout_ms);
  return res?.message?.content ?? "";
}

export async function chatOpenAI(
  p: ModelProvider,
  messages: Array<{ role: string; content: string }>,
  signalOrOptions?: AbortSignal | ChatStreamOptions
): Promise<string> {
  const options = normalizeChatOptions(signalOrOptions);
  const stream = shouldStream(options);
  const base = (p.base_url || "https://api.openai.com/v1").replace(/\/$/, "");
  const body: Record<string, unknown> = {
    model: p.model_name,
    messages,
    temperature: p.temperature,
    max_tokens: p.max_tokens,
    response_format: { type: "json_object" },
  };
  if (stream) {
    body.stream = true;
  }
  const init: RequestInit = {
    method: "POST",
    signal: options.signal,
    headers: {
      "Content-Type": "application/json",
      ...(p.api_key ? { Authorization: `Bearer ${p.api_key}` } : {}),
    },
    body: JSON.stringify(body),
  };

  if (stream) {
    return readStreamWithTimeout(
      `${base}/chat/completions`,
      init,
      p.timeout_ms,
      parseOpenAIStreamLine,
      (res) => res?.choices?.[0]?.message?.content ?? "",
      options
    );
  }

  const res = await fetchWithTimeout(
    `${base}/chat/completions`,
    init,
    p.timeout_ms
  );
  return res?.choices?.[0]?.message?.content ?? "";
}

export function chat(
  p: ModelProvider,
  messages: Array<{ role: string; content: string }>,
  signalOrOptions?: AbortSignal | ChatStreamOptions
): Promise<string> {
  return p.protocol === "ollama"
    ? chatOllama(p, messages, signalOrOptions)
    : chatOpenAI(p, messages, signalOrOptions);
}

/* ---------------- 输出校验（§15.1） ---------------- */

export function parseAIOutput(
  raw: string,
  original: Block
): AISuggestionOutput {
  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型未返回 JSON 对象");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new Error("JSON 解析失败：模型输出不是合法 JSON");
  }
  if (
    typeof parsed.suggested_block !== "object" ||
    parsed.suggested_block === null ||
    Array.isArray(parsed.suggested_block)
  )
    throw new Error("缺少 suggested_block 字段");
  if (typeof parsed.explanation !== "string")
    throw new Error("缺少 explanation 字段");
  const sb = parsed.suggested_block as Partial<Block>;
  const merged: Block = {
    ...original,
    title: typeof sb.title === "string" ? sb.title : original.title,
    subtitle: typeof sb.subtitle === "string" ? sb.subtitle : original.subtitle,
    start_date:
      typeof sb.start_date === "string" ? sb.start_date : original.start_date,
    end_date: typeof sb.end_date === "string" ? sb.end_date : original.end_date,
    location: typeof sb.location === "string" ? sb.location : original.location,
    description:
      typeof sb.description === "string"
        ? sb.description
        : original.description,
    bullets: Array.isArray(sb.bullets)
      ? sb.bullets.filter((x): x is string => typeof x === "string")
      : original.bullets,
    skills: Array.isArray(sb.skills)
      ? sb.skills.filter((x): x is string => typeof x === "string")
      : original.skills,
  };
  return {
    suggested_block: merged,
    explanation: parsed.explanation,
    matched_keywords: Array.isArray(parsed.matched_keywords)
      ? parsed.matched_keywords.filter(
          (x): x is string => typeof x === "string"
        )
      : [],
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((x): x is string => typeof x === "string")
      : [],
  };
}

/* ---------------- 路由选择（§13.5） ---------------- */

export type ProviderSelection =
  | { kind: "provider"; provider: ModelProvider }
  | { kind: "confirm_external"; provider: ModelProvider }
  | { kind: "rules" };

export function selectProvider(
  models: ModelProvider[],
  privacy: PrivacyLike
): ProviderSelection {
  const enabled = models.filter((m) => m.enabled);
  const locals = enabled.filter(
    (m) => m.type === "local" || m.type === "private"
  );
  const externals = enabled.filter((m) => m.type === "external");

  if (locals.length) return { kind: "provider", provider: locals[0] };
  if (privacy.route === "local_only") return { kind: "rules" };
  if (!externals.length) return { kind: "rules" };
  if (!privacy.allowExternal) return { kind: "rules" };
  return { kind: "confirm_external", provider: externals[0] };
}

/* ---------------- 生成建议（含一次重试） ---------------- */

export async function generateWithLLM(
  provider: ModelProvider,
  action: AIAction,
  block: Block,
  resumeSummary: string,
  jdJson: string | null,
  signalOrOptions?: AbortSignal | ChatStreamOptions
): Promise<AISuggestionOutput> {
  const userPrompt = [
    ACTION_INSTRUCTION[action],
    "",
    `当前模块（JSON）：\n${JSON.stringify(block, null, 2)}`,
    `简历摘要：\n${resumeSummary || "（无）"}`,
    jdJson ? `目标岗位 JD（JSON）：\n${jdJson}` : "",
    "",
    `输出格式（严格 JSON，不要 Markdown）：`,
    `{"suggested_block":{...完整模块...},"explanation":"一句话说明改动","matched_keywords":[],"warnings":[]}`,
  ]
    .filter((s, i) => s !== "" || i < 3)
    .join("\n");

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];

  const raw = await chat(provider, messages, signalOrOptions);
  try {
    return parseAIOutput(raw, block);
  } catch (firstErr) {
    // Retry only output validation. Network / authentication failures retain their cause.
    const retry = await chat(
      provider,
      [
        ...messages,
        {
          role: "user",
          content:
            "上一次输出不是合法 JSON。请只输出符合格式的 JSON 对象本身，不要任何前后缀。",
        },
      ],
      signalOrOptions
    );
    try {
      return parseAIOutput(retry, block);
    } catch {
      throw new Error(
        `AI 输出校验失败（已重试一次）：${
          firstErr instanceof Error ? firstErr.message : "未知错误"
        }`
      );
    }
  }
}

export function buildResumeSummary(
  data: import("../types").ResumeData
): string {
  const lines = [`目标职位：${stripHtml(data.basic_info.title) || "未填写"}`];
  for (const s of [...data.sections]
    .filter((s) => s.visible && s.type !== "basic_info")
    .sort((a, b) => a.order - b.order)) {
    const facts = [...s.blocks]
      .filter((b) => b.visible)
      .sort((a, b) => a.order - b.order)
      .slice(0, 8)
      .map((b) =>
        [
          b.title,
          b.subtitle,
          ...(b.subtitles ?? []),
          [b.start_date, b.end_date].filter(Boolean).join("–"),
          stripHtml(b.description),
          ...b.bullets.map(stripHtml),
          ...b.skills,
        ]
          .filter(Boolean)
          .join("；")
          .slice(0, 700)
      );
    if (facts.some(Boolean))
      lines.push(`${s.title}：\n${facts.filter(Boolean).join("\n")}`);
  }
  return lines.join("\n\n").slice(0, 6000);
}

/* ---------------- 本地规则引擎（模型不可用时的降级兜底） ---------------- */

const VERB_MAP: Array<[RegExp, string]> = [
  [/^我/, ""],
  [/^负责了/, "负责"],
  [/^参与了/, "参与"],
  [/^协助了/, "协助"],
  [/^做了/, "完成"],
];

const FILLER = ["非常", "十分", "的相关"];

function polishBullet(b: string): string {
  let out = b.trim();
  for (const f of FILLER) out = out.split(f).join("");
  for (const [re, rep] of VERB_MAP) out = out.replace(re, rep);
  out = out.replace(/\s{2,}/g, " ").trim();
  if (!out) return b;
  return out;
}

export function ruleSuggestion(
  action: AIAction,
  block: Block,
  jdKeywords: string[]
): AISuggestionOutput {
  const out: AISuggestionOutput = {
    suggested_block: {
      ...block,
      bullets: [...block.bullets],
      skills: [...block.skills],
    },
    explanation: "",
    matched_keywords: [],
    warnings: [],
  };
  const bullets = block.bullets.filter(Boolean);

  switch (action) {
    case "translate":
      out.explanation =
        "英文翻译需要启用模型。本地规则不会生成翻译或改动原文。";
      out.warnings = ["请在模型与隐私中配置可用模型，再发起英文翻译。"];
      break;
    case "polish":
      out.suggested_block.bullets = bullets.map(polishBullet);
      out.explanation =
        "规则引擎：精简修饰词与句式，保留职责、估算范围与数字（未连接模型时的本地兜底）。";
      break;
    case "rewrite":
      // 规则引擎无法真正重写语义（禁止编造事实），与 polish 的差异在于：
      // 保留职责强度，并对缺少成果数据的 bullet 给出补充提示
      out.suggested_block.bullets = bullets.map((b) => polishBullet(b));
      out.suggested_block.description = block.description;
      out.explanation =
        "规则引擎：精简句式，提示补充成果，保留原有职责与事实。";
      out.warnings = bullets
        .filter(
          (b) =>
            !/\d/.test(b) &&
            !/(成果|提升|降低|缩短|减少|增长|覆盖|达成|优化)/.test(b)
        )
        .map(
          (b) =>
            `「${b.slice(
              0,
              18
            )}…」建议补充：动作带来的成果数据（比例 / 规模 / 耗时）`
        );
      break;
    case "quantify":
      out.explanation =
        "规则引擎：已标记可补充量化指标的描述（不修改原文、不编造数字）。";
      out.warnings = bullets
        .filter((b) => !hasAchievementMetric(b))
        .map(
          (b) => `建议为「${b.slice(0, 20)}」补充：规模 / 比例 / 耗时等指标`
        );
      if (!out.warnings.length)
        out.warnings = [
          bullets.length
            ? "已识别到带单位的指标，请核对口径、基线与真实成果"
            : "条目暂无成果描述，请先补充真实经历。",
        ];
      break;
    case "shorten":
      out.suggested_block.bullets = bullets.map(polishBullet);
      out.warnings = bullets
        .filter((b) => b.length > 40)
        .map(
          (b) =>
            `「${b.slice(
              0,
              18
            )}…」较长，建议拆分动作与成果；已保留完整内容，避免截断事实。`
        );
      out.explanation =
        "规则引擎：精简冗词，长句提供拆分建议，保留完整事实与成果。";
      break;
    case "expand":
      out.explanation =
        "规则引擎：按「背景 / 方案 / 结果」给出扩写提示；具体事实需由你补充，避免编造。";
      out.warnings = bullets
        .slice(0, 4)
        .map(
          (b) =>
            `可围绕「${b.slice(
              0,
              16
            )}」补充：当时的背景 → 采取的方案与技术选型 → 可度量的结果`
        );
      if (!bullets.length)
        out.warnings = ["该模块暂无 bullets，请先填写基础内容再扩写"];
      break;
    case "jd_match": {
      const text = [
        block.title,
        block.subtitle,
        block.description,
        ...bullets,
        ...block.skills,
      ]
        .join(" ")
        .toLowerCase();
      const hit = jdKeywords.filter((k) => containsTerm(text, k));
      out.matched_keywords = hit;
      out.explanation = hit.length
        ? `规则引擎：该模块已覆盖 JD 关键词 ${hit
            .slice(0, 6)
            .join("、")}，建议将其放在 bullets 靠前位置。`
        : "规则引擎：该模块未命中 JD 关键词，建议在真实经历范围内调整措辞。";
      out.warnings = jdKeywords
        .filter((k) => !containsTerm(text, k))
        .slice(0, 5)
        .map((k) => `JD 关键词「${k}」未在本模块出现，勿强行添加不真实的经验`);
      break;
    }
    case "ats_optimize":
      out.suggested_block.bullets = [
        ...new Set(
          bullets.map((b) =>
            polishBullet(b)
              .replace(/[★☆❤️]/g, "")
              .trim()
          )
        ),
      ].filter(Boolean);
      out.suggested_block.skills = [
        ...new Set(block.skills.map((s) => s.trim()).filter(Boolean)),
      ];
      out.explanation =
        "规则引擎：去重、去特殊符号、动词开头，保证纯文本 ATS 可读。";
      break;
  }
  out.explanation += `（${ACTION_LABELS[action].label}）`;
  return out;
}

/* ---------------- 模型连通性测试 ---------------- */

export type ProviderDiagnosticCode =
  | "ok"
  | "cors_or_network"
  | "auth_error"
  | "model_not_found"
  | "timeout"
  | "http_error"
  | "unknown";

export interface ProviderTestResult {
  ok: boolean;
  latency: number;
  message: string;
  json: boolean;
  code: ProviderDiagnosticCode;
  hint?: string;
  availableModels?: string[];
}

function isAbortError(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

function isNetworkOrCorsError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (!(e instanceof Error)) return false;
  return /failed to fetch|networkerror|load failed|fetch failed|cors/i.test(
    e.message
  );
}

export async function testProvider(
  p: ModelProvider
): Promise<ProviderTestResult> {
  const t0 = performance.now();
  const base = (
    p.base_url ||
    (p.protocol === "ollama"
      ? "http://localhost:11434"
      : "https://api.openai.com/v1")
  ).replace(/\/$/, "");

  try {
    if (p.protocol === "ollama") {
      const res = await fetchWithTimeout(
        `${base}/api/tags`,
        { method: "GET" },
        p.timeout_ms
      );
      const models: string[] = (res?.models || [])
        .map((m: { name?: string }) => m.name)
        .filter((name: unknown): name is string => typeof name === "string");
      const hasModel = models.some(
        (m) => m === p.model_name || m.startsWith(p.model_name)
      );
      const latency = Math.round(performance.now() - t0);

      if (!hasModel) {
        return {
          ok: false,
          latency,
          code: "model_not_found",
          availableModels: models,
          message: `已连上 Ollama，但未找到模型「${p.model_name}」（本机可用：${
            models.slice(0, 6).join("、") || "无"
          }）`,
          hint: models.length
            ? `请执行 ollama pull ${p.model_name}，或改用上方已安装模型。`
            : `本机暂无已拉取模型，请先执行 ollama pull ${p.model_name}。`,
          json: false,
        };
      }

      return {
        ok: true,
        latency,
        code: "ok",
        availableModels: models,
        message: `连接成功，发现模型 ${p.model_name}（本机共 ${models.length} 个模型）`,
        json: true,
      };
    }

    const res = await fetchWithTimeout(
      `${base}/models`,
      {
        method: "GET",
        headers: p.api_key ? { Authorization: `Bearer ${p.api_key}` } : {},
      },
      p.timeout_ms
    );
    const latency = Math.round(performance.now() - t0);
    const models: string[] = Array.isArray(res?.data)
      ? res.data
          .map((m: { id?: string }) => m.id)
          .filter((id: unknown): id is string => typeof id === "string")
      : [];

    if (
      models.length > 0 &&
      p.model_name &&
      !models.includes(p.model_name)
    ) {
      return {
        ok: false,
        latency,
        code: "model_not_found",
        availableModels: models,
        message: `鉴权通过，但服务模型列表中未找到「${p.model_name}」（可用：${models
          .slice(0, 6)
          .join("、")}）`,
        hint: "请核对 Model 名称拼写，或选择服务返回的可用模型。",
        json: false,
      };
    }

    return {
      ok: true,
      latency,
      code: "ok",
      ...(models.length ? { availableModels: models } : {}),
      message: "连接成功，鉴权通过",
      json: true,
    };
  } catch (e) {
    if (isAbortError(e)) {
      return {
        ok: false,
        latency: 0,
        code: "timeout",
        message: `连接超时（>${p.timeout_ms / 1000}s），请确认服务已启动且网络畅通`,
        hint: "可检查服务是否正常运行、端口是否被占用/拦截，或在高级参数中增大超时时间。",
        json: false,
      };
    }

    if (e instanceof ProviderError) {
      if (e.status === 401 || e.status === 403) {
        return {
          ok: false,
          latency: 0,
          code: "auth_error",
          message: `鉴权失败（HTTP ${e.status}）：请检查 API Key 是否正确或有效`,
          hint: "请在模型配置中核对 API Key（Bearer Token）、权限范围或账户余额。",
          json: false,
        };
      }
      if (e.status === 404) {
        return {
          ok: false,
          latency: 0,
          code: "model_not_found",
          message: `未找到模型或接口（HTTP 404）：请检查 Base URL 与模型名称「${p.model_name}」`,
          hint:
            p.protocol === "ollama"
              ? `请确认 Base URL 为 Ollama 根地址（如 http://localhost:11434）且已拉取 ${p.model_name}。`
              : "请确认 Base URL 是否包含 /v1 前缀，以及该服务是否支持 /models 与所填模型名。",
          json: false,
        };
      }
      return {
        ok: false,
        latency: 0,
        code: "http_error",
        message: `服务返回 HTTP ${e.status}，请检查服务状态与请求地址`,
        hint:
          e.status === 429
            ? "请求过于频繁或额度不足（429），请稍后重试。"
            : "请检查服务端日志与 Base URL 配置。",
        json: false,
      };
    }

    if (isNetworkOrCorsError(e)) {
      const isLocal =
        p.protocol === "ollama" ||
        /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(base);
      return {
        ok: false,
        latency: 0,
        code: "cors_or_network",
        message: isLocal
          ? "无法连接到本地服务（可能被浏览器 CORS 跨域拦截或服务未启动）"
          : "网络请求被拦截（可能存在 CORS 跨域限制或网络不可达）",
        hint: isLocal
          ? `若服务已启动仍报此错，请设置环境变量 OLLAMA_ORIGINS="*" 后重启服务，并确认地址 ${base} 可访问。`
          : "浏览器端直连需目标 API 允许当前页面 Origin 的 CORS 跨域请求，或通过本地/私有代理转发。",
        json: false,
      };
    }

    return {
      ok: false,
      latency: 0,
      code: "unknown",
      message: `连接失败：${e instanceof Error ? e.message : "未知错误"}`,
      json: false,
    };
  }
}

export function defaultModels(): ModelProvider[] {
  const now = new Date().toISOString();
  return [
    {
      id: "model_local_ollama",
      name: "本地 Ollama（默认）",
      type: "local",
      protocol: "ollama",
      base_url: "http://localhost:11434",
      api_key: "",
      model_name: "qwen2.5:7b",
      temperature: 0.3,
      max_tokens: 2048,
      timeout_ms: 30000,
      enabled: false,
      created_at: now,
    },
    {
      id: "model_external_openai",
      name: "外部 OpenAI Compatible（默认关闭）",
      type: "external",
      protocol: "openai_compatible",
      base_url: "https://api.openai.com/v1",
      api_key: "",
      model_name: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 2048,
      timeout_ms: 30000,
      enabled: false,
      created_at: now,
    },
  ];
}

export type { RouteStrategy };
