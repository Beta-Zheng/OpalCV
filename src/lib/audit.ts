/* ------------------------------------------------------------------
 * 全简历体检引擎（R6/F5 Full-Resume Audit）
 * - 本地规则扫描（离线可用）：
 *   (a) 时间线断层（工作经历间隔 > 3 个月）
 *   (b) 要点动词重复（跨条目或单条目内高频重复开头动词）
 *   (c) 中英文/数字混排缺空格（CJK 与 Latin/digits 紧邻）
 *   (d) 缺失量化成果指标（基于 hasAchievementMetric）
 * - 每条问题均携带 sectionId 与 blockId，支持编辑器一键定位
 * - 可选 AI 深度改进建议：严格受 pre-send 隐私确认门控
 * ------------------------------------------------------------------ */
import type { Block, ModelProvider, Resume, Section } from "../types";
import type { PrivacyLike } from "./ai-types";
import { buildResumeSummary, chat, selectProvider } from "./ai";
import { clamp, hasAchievementMetric, nowISO, stripHtml } from "./utils";

export type AuditCategory =
  | "timeline_gap"
  | "repeated_verb"
  | "cjk_spacing"
  | "missing_metric";

export type AuditSeverity = "warning" | "info";

export interface AuditIssue {
  id: string;
  category: AuditCategory;
  severity: AuditSeverity;
  sectionId: string;
  blockId: string;
  bulletIndex?: number;
  blockTitle: string;
  sectionTitle: string;
  message: string;
  detail: string;
  suggestion: string;
  snippet?: string;
}

export interface AuditReport {
  issues: AuditIssue[];
  counts: Record<AuditCategory, number>;
  total: number;
  score: number;
  scannedBlocks: number;
  scannedBullets: number;
  computed_at: string;
}

export interface AuditAISuggestion {
  blockId?: string;
  sectionId?: string;
  category?: AuditCategory;
  advice: string;
  example?: string;
}

export interface AuditAIOptions {
  models: ModelProvider[];
  privacy: PrivacyLike;
  confirmedExternal?: boolean;
  confirmExternal?: (provider: ModelProvider) => Promise<boolean>;
  signal?: AbortSignal;
  chatFn?: typeof chat;
}

export interface AuditAIResult {
  suggestions: AuditAISuggestion[];
  usedAI: boolean;
  reason: "rules" | "external_declined" | "ai" | "ai_fallback";
  providerName?: string;
  pendingProvider?: ModelProvider;
  error?: string;
}

/* ---------------- (a) 时间线断层检测 ---------------- */

function parseYearMonth(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(\d{4})[-./年](\d{1,2})/.exec(s);
  if (m) {
    const year = Number(m[1]);
    const mon = Number(m[2]);
    if (mon >= 1 && mon <= 12) return year * 12 + (mon - 1);
  }
  const yOnly = /^(\d{4})$/.exec(s);
  if (yOnly) return Number(yOnly[1]) * 12;
  return null;
}

function isPresentDate(raw: string): boolean {
  return /^(至今|现在|目前|present|now|current)$/i.test(raw.trim());
}

function scanTimelineGaps(sections: Section[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const now = new Date();
  const currentMonth = now.getFullYear() * 12 + now.getMonth();

  const entries: Array<{
    section: Section;
    block: Block;
    start: number;
    end: number;
  }> = [];

  for (const s of sections) {
    if (!s.visible || s.type !== "work_experience") continue;
    for (const b of s.blocks) {
      if (!b.visible) continue;
      const start = parseYearMonth(b.start_date);
      const end = isPresentDate(b.end_date)
        ? currentMonth
        : parseYearMonth(b.end_date);
      if (start !== null && end !== null && end >= start) {
        entries.push({ section: s, block: b, start, end });
      }
    }
  }

  entries.sort((a, b) => a.start - b.start || a.end - b.end);

  let maxEndSoFar: { end: number; block: Block } | null = null;
  for (const cur of entries) {
    if (maxEndSoFar) {
      const gapMonths = cur.start - maxEndSoFar.end;
      if (gapMonths > 3) {
        const prevTitle = maxEndSoFar.block.title || "上一段经历";
        const curTitle = cur.block.title || "该段经历";
        issues.push({
          id: `gap_${cur.block.block_id}`,
          category: "timeline_gap",
          severity: "warning",
          sectionId: cur.section.section_id,
          blockId: cur.block.block_id,
          blockTitle: curTitle,
          sectionTitle: cur.section.title,
          message: `时间线存在 ${gapMonths} 个月空档（> 3 个月）`,
          detail: `「${prevTitle}」（结束于 ${maxEndSoFar.block.end_date}）与「${curTitle}」（开始于 ${cur.block.start_date}）之间间隔 ${gapMonths} 个月。`,
          suggestion:
            "若期间有全职进修、自由职业、个人项目或备考经历，建议补充说明以消除 HR 对空档期的疑虑。",
        });
      }
    }
    if (!maxEndSoFar || cur.end > maxEndSoFar.end) {
      maxEndSoFar = { end: cur.end, block: cur.block };
    }
  }

  return issues;
}

/* ---------------- (b) 动词重复检测 ---------------- */

const ZH_LEADING_VERBS = [
  "负责",
  "主导",
  "参与",
  "设计",
  "开发",
  "搭建",
  "实现",
  "优化",
  "重构",
  "推动",
  "推进",
  "制定",
  "规划",
  "管理",
  "协调",
  "统筹",
  "建立",
  "完善",
  "提升",
  "降低",
  "完成",
  "撰写",
  "分析",
  "调研",
  "梳理",
  "维护",
  "部署",
  "测试",
  "解决",
  "支持",
  "协助",
  "带领",
  "指导",
  "落地",
  "执行",
  "运营",
  "策划",
  "拓展",
  "跟进",
  "监控",
  "核对",
  "构建",
  "打造",
  "封装",
  "引入",
];

const VERB_ALTERNATIVES: Record<string, string[]> = {
  负责: ["主导", "统筹", "推进", "落地", "搭建"],
  主导: ["统筹", "牵头", "策划", "推动", "架构"],
  参与: ["协同", "协助", "配合", "落地", "支持"],
  开发: ["构建", "实现", "搭建", "重构", "封装"],
  优化: ["重构", "改进", "加速", "降本", "升级"],
  设计: ["规划", "定义", "构建", "架构", "制定"],
  responsible: ["Led", "Owned", "Drove", "Spearheaded"],
  built: ["Architected", "Engineered", "Developed", "Launched"],
  developed: ["Engineered", "Implemented", "Delivered", "Designed"],
  led: ["Spearheaded", "Directed", "Orchestrated", "Guided"],
  managed: ["Directed", "Coordinated", "Supervised", "Streamlined"],
};

function extractLeadingVerb(bulletText: string): string | null {
  const clean = stripHtml(bulletText)
    .replace(/^[-•·*\d.、)\s]+/, "")
    .trim();
  if (!clean) return null;

  for (const v of ZH_LEADING_VERBS) {
    if (clean.startsWith(v)) return v;
  }

  const zhMatch = /^([\u4e00-\u9fa5]{2})/.exec(clean);
  if (zhMatch) return zhMatch[1];

  const enMatch = /^([a-zA-Z]{2,16})\b/.exec(clean);
  if (enMatch) return enMatch[1].toLowerCase();

  return null;
}

function scanRepeatedVerbs(sections: Section[]): AuditIssue[] {
  const occurrences = new Map<
    string,
    Array<{
      section: Section;
      block: Block;
      bulletIndex: number;
      text: string;
    }>
  >();

  for (const s of sections) {
    if (
      !s.visible ||
      !["work_experience", "project_experience", "summary", "custom"].includes(
        s.type
      )
    )
      continue;
    for (const b of s.blocks) {
      if (!b.visible) continue;
      b.bullets.forEach((raw, idx) => {
        const clean = stripHtml(raw).trim();
        if (clean.length <= 4) return;
        const verb = extractLeadingVerb(clean);
        if (!verb) return;
        const list = occurrences.get(verb) ?? [];
        list.push({ section: s, block: b, bulletIndex: idx, text: clean });
        occurrences.set(verb, list);
      });
    }
  }

  const issues: AuditIssue[] = [];
  for (const [verb, list] of occurrences.entries()) {
    const byBlock = new Map<string, number>();
    for (const item of list) {
      byBlock.set(item.block.block_id, (byBlock.get(item.block.block_id) ?? 0) + 1);
    }
    const hasSameBlockRepeat = [...byBlock.values()].some((n) => n >= 2);
    if (list.length < 3 && !hasSameBlockRepeat) continue;

    // 针对出现次数最多的条目（或超出阈值的条目）生成定位问题
    const seenBlocks = new Set<string>();
    for (const item of list) {
      const blockCount = byBlock.get(item.block.block_id) ?? 0;
      if (list.length < 3 && blockCount < 2) continue;
      if (seenBlocks.has(item.block.block_id)) continue;
      seenBlocks.add(item.block.block_id);

      const alts = VERB_ALTERNATIVES[verb] ?? ["统筹", "推进", "构建", "落地"];
      issues.push({
        id: `verb_${verb}_${item.block.block_id}`,
        category: "repeated_verb",
        severity: "info",
        sectionId: item.section.section_id,
        blockId: item.block.block_id,
        bulletIndex: item.bulletIndex,
        blockTitle: item.block.title || item.section.title,
        sectionTitle: item.section.title,
        message: `开头动词「${verb}」重复使用（全简历 ${list.length} 次）`,
        detail: `「${item.block.title || item.section.title}」中多次以「${verb}」开头，例如：「${item.text.slice(0, 42)}${item.text.length > 42 ? "…" : ""}」。`,
        suggestion: `建议替换为更精准的动词（如：${alts.join(" / ")}），提升表达层次感。`,
        snippet: item.text.slice(0, 60),
      });
    }
  }

  return issues;
}

/* ---------------- (c) 中英文/数字缺空格检测 ---------------- */

const CJK_LATIN_RE = /[\u4e00-\u9fa5][A-Za-z0-9]|[A-Za-z0-9][\u4e00-\u9fa5]/g;

export function findCjkSpacingMatches(text: string): string[] {
  const clean = stripHtml(text);
  const matches: string[] = [];
  const re = new RegExp(CJK_LATIN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean)) !== null) {
    const start = Math.max(0, m.index - 4);
    const end = Math.min(clean.length, m.index + 6);
    matches.push(clean.slice(start, end).trim());
  }
  return matches;
}

export function fixCjkSpacing(text: string): string {
  return text
    .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, "$1 $2")
    .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, "$1 $2");
}

function scanCjkSpacing(sections: Section[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  for (const s of sections) {
    if (!s.visible || s.type === "basic_info") continue;
    for (const b of s.blocks) {
      if (!b.visible) continue;
      const fields: Array<{ label: string; text: string; bulletIndex?: number }> = [
        { label: "标题", text: b.title },
        { label: "副标题", text: b.subtitle },
        { label: "描述", text: b.description },
        ...b.bullets.map((t, i) => ({
          label: `要点 ${i + 1}`,
          text: t,
          bulletIndex: i,
        })),
      ];
      const hitSnippets: string[] = [];
      let firstBulletIndex: number | undefined;
      for (const f of fields) {
        const hits = findCjkSpacingMatches(f.text);
        if (hits.length) {
          if (firstBulletIndex === undefined && f.bulletIndex !== undefined) {
            firstBulletIndex = f.bulletIndex;
          }
          for (const h of hits) {
            if (!hitSnippets.includes(h) && hitSnippets.length < 4) {
              hitSnippets.push(h);
            }
          }
        }
      }
      if (hitSnippets.length) {
        issues.push({
          id: `space_${b.block_id}`,
          category: "cjk_spacing",
          severity: "info",
          sectionId: s.section_id,
          blockId: b.block_id,
          bulletIndex: firstBulletIndex,
          blockTitle: b.title || s.title,
          sectionTitle: s.title,
          message: `中英文/数字之间缺少空格（${hitSnippets.length} 处）`,
          detail: `在「${b.title || s.title}」中检测到未留空格片段：${hitSnippets.map((x) => `「${x}」`).join("、")}。`,
          suggestion: "建议在中文与英文/数字之间添加半角空格（如「使用 React 开发」「提升 30%」），排版更清晰。",
          snippet: hitSnippets.join(" / "),
        });
      }
    }
  }
  return issues;
}

/* ---------------- (d) 缺失量化指标检测 ---------------- */

function scanMissingMetrics(sections: Section[]): {
  issues: AuditIssue[];
  scannedBlocks: number;
  scannedBullets: number;
} {
  const issues: AuditIssue[] = [];
  let scannedBlocks = 0;
  let scannedBullets = 0;

  for (const s of sections) {
    if (!s.visible) continue;
    for (const b of s.blocks) {
      if (!b.visible) continue;
      scannedBlocks++;
      const isExpSection =
        s.type === "work_experience" || s.type === "project_experience";

      b.bullets.forEach((raw, idx) => {
        const clean = stripHtml(raw).trim();
        if (clean.length <= 6) return;
        scannedBullets++;
        if (isExpSection && !hasAchievementMetric(clean)) {
          issues.push({
            id: `metric_${b.block_id}_${idx}`,
            category: "missing_metric",
            severity: "warning",
            sectionId: s.section_id,
            blockId: b.block_id,
            bulletIndex: idx,
            blockTitle: b.title || s.title,
            sectionTitle: s.title,
            message: `要点 ${idx + 1} 缺少量化成果指标`,
            detail: `「${clean.slice(0, 56)}${clean.length > 56 ? "…" : ""}」未识别到比例、规模、耗时或业务指标。`,
            suggestion:
              "建议补充可验证的数据维度（如：性能提升 X%、覆盖 X 万用户、耗时缩短 X ms、成本降低 X%）。",
            snippet: clean.slice(0, 60),
          });
        }
      });
    }
  }

  return { issues, scannedBlocks, scannedBullets };
}

/* ---------------- 主入口：一键全简历体检 ---------------- */

export function auditResume(resume: Resume): AuditReport {
  const sections = [...resume.data.sections].sort((a, b) => a.order - b.order);

  const gapIssues = scanTimelineGaps(sections);
  const verbIssues = scanRepeatedVerbs(sections);
  const spacingIssues = scanCjkSpacing(sections);
  const { issues: metricIssues, scannedBlocks, scannedBullets } =
    scanMissingMetrics(sections);

  const issues = [
    ...gapIssues,
    ...metricIssues,
    ...verbIssues,
    ...spacingIssues,
  ];

  const counts: Record<AuditCategory, number> = {
    timeline_gap: gapIssues.length,
    repeated_verb: verbIssues.length,
    cjk_spacing: spacingIssues.length,
    missing_metric: metricIssues.length,
  };

  // 健康度评分（仅作本地参考）：每项 warning -8，info -3
  const penalty = issues.reduce(
    (sum, item) => sum + (item.severity === "warning" ? 8 : 3),
    0
  );
  const score = clamp(100 - penalty, 15, 100);

  return {
    issues,
    counts,
    total: issues.length,
    score,
    scannedBlocks,
    scannedBullets,
    computed_at: nowISO(),
  };
}

/* ---------------- 可选 AI 深度改进建议（隐私门控） ---------------- */

function parseAuditAIJSON(raw: string): AuditAISuggestion[] {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型未返回 JSON 对象");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<
    string,
    unknown
  >;
  const rawList = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const result: AuditAISuggestion[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.advice !== "string" || !rec.advice.trim()) continue;
    result.push({
      blockId: typeof rec.blockId === "string" ? rec.blockId : undefined,
      sectionId: typeof rec.sectionId === "string" ? rec.sectionId : undefined,
      category:
        rec.category === "timeline_gap" ||
        rec.category === "repeated_verb" ||
        rec.category === "cjk_spacing" ||
        rec.category === "missing_metric"
          ? rec.category
          : undefined,
      advice: rec.advice.trim(),
      example:
        typeof rec.example === "string" && rec.example.trim()
          ? rec.example.trim()
          : undefined,
    });
  }
  return result;
}

/**
 * 基于本地体检结果，可选调用 AI 生成高价值改进建议。
 * 外部模型严格遵守 pre-send 隐私确认门控：未显式确认绝不发出外部请求。
 */
export async function enhanceAuditWithAI(
  resume: Resume,
  report: AuditReport,
  options: AuditAIOptions
): Promise<AuditAIResult> {
  const sel = selectProvider(options.models, options.privacy);

  if (sel.kind === "rules") {
    return { suggestions: [], usedAI: false, reason: "rules" };
  }

  if (sel.kind === "confirm_external") {
    let ok = options.confirmedExternal === true;
    if (!ok && options.confirmExternal) {
      ok = await options.confirmExternal(sel.provider);
    }
    if (!ok) {
      return {
        suggestions: [],
        usedAI: false,
        reason: "external_declined",
        pendingProvider: sel.provider,
      };
    }
  }

  const transport = options.chatFn ?? chat;
  const topFindings = report.issues.slice(0, 10).map((i) => ({
    category: i.category,
    sectionId: i.sectionId,
    blockId: i.blockId,
    blockTitle: i.blockTitle,
    message: i.message,
    snippet: i.snippet,
  }));

  const messages = [
    {
      role: "system",
      content:
        "你是资深简历评审专家。基于提供的简历摘要和本地规则体检发现，给出可执行、不编造事实的改进建议。不要编造数字。严格只输出合法 JSON 对象，不要 Markdown。",
    },
    {
      role: "user",
      content: [
        `简历摘要：\n${buildResumeSummary(resume.data).slice(0, 2500)}`,
        "",
        `本地体检发现（共 ${report.total} 项，节选前 ${topFindings.length} 项）：\n${JSON.stringify(topFindings)}`,
        "",
        `输出严格 JSON 格式：`,
        `{"suggestions":[{"blockId":"对应blockId或省略","sectionId":"对应sectionId或省略","category":"timeline_gap|repeated_verb|cjk_spacing|missing_metric","advice":"具体可执行的改进建议","example":"不编造数字的改写示范或补充提示"}]}`,
      ].join("\n"),
    },
  ];

  try {
    const raw = await transport(sel.provider, messages, options.signal);
    const suggestions = parseAuditAIJSON(raw);
    return {
      suggestions,
      usedAI: true,
      reason: "ai",
      providerName: sel.provider.name,
    };
  } catch (err) {
    return {
      suggestions: [],
      usedAI: false,
      reason: "ai_fallback",
      error: err instanceof Error ? err.message : "AI 体检建议生成失败",
    };
  }
}
