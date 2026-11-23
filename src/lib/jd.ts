import { stripHtml, hasAchievementMetric } from "./utils";
/* ------------------------------------------------------------------
 * JD 解析与匹配：混合策略（本地规则引擎 + 可选 AI 语义深度解析）
 * - 本地规则引擎不依赖大模型即可离线完成全部解析与匹配
 * - AI 语义解析严格受 pre-send 隐私确认流程门控
 * ------------------------------------------------------------------ */
import type {
  JD,
  JDStructured,
  MatchReport,
  ModelProvider,
  Resume,
} from "../types";
import type { PrivacyLike } from "./ai-types";
import { chat, selectProvider } from "./ai";
import { uid, nowISO, resumeToText, clamp, containsTerm } from "./utils";

export const SKILL_DICT = [
  // 软件工程 & 技术栈
  "react",
  "vue",
  "angular",
  "svelte",
  "next.js",
  "nextjs",
  "nuxt",
  "typescript",
  "javascript",
  "es6",
  "node.js",
  "nodejs",
  "deno",
  "bun",
  "webpack",
  "vite",
  "rollup",
  "esbuild",
  "babel",
  "tailwind",
  "tailwindcss",
  "sass",
  "less",
  "css",
  "html",
  "html5",
  "jquery",
  "redux",
  "zustand",
  "mobx",
  "pinia",
  "graphql",
  "apollo",
  "微前端",
  "qiankun",
  "monorepo",
  "pnpm",
  "npm",
  "yarn",
  "ci/cd",
  "git",
  "github",
  "gitlab",
  "docker",
  "k8s",
  "kubernetes",
  "nginx",
  "linux",
  "java",
  "spring",
  "springboot",
  "spring boot",
  "mybatis",
  "maven",
  "gradle",
  "kotlin",
  "scala",
  "python",
  "django",
  "flask",
  "fastapi",
  "pandas",
  "numpy",
  "pytorch",
  "tensorflow",
  "go",
  "golang",
  "gin",
  "c++",
  "c#",
  ".net",
  "rust",
  "php",
  "laravel",
  "ruby",
  "rails",
  "swift",
  "objective-c",
  "flutter",
  "dart",
  "react native",
  "小程序",
  "微信小程序",
  "uniapp",
  "uni-app",
  "electron",
  "taro",
  "websocket",
  "grpc",
  "rabbitmq",
  "kafka",
  "rocketmq",
  "mysql",
  "postgresql",
  "postgres",
  "mongodb",
  "redis",
  "elasticsearch",
  "es",
  "clickhouse",
  "hive",
  "spark",
  "flink",
  "hadoop",
  "数据仓库",
  "etl",
  "llm",
  "rag",
  "prompt",
  "langchain",
  "aigc",
  "机器学习",
  "深度学习",
  "nlp",
  "计算机视觉",
  "算法",
  "前端监控",
  "性能优化",
  "ssr",
  "服务端渲染",
  "自动化测试",
  "单元测试",
  "jest",
  "vitest",
  "cypress",
  "playwright",
  "storybook",
  "架构设计",
  "分布式",
  "高并发",
  "高可用",
  "微服务",
  "中台",
  "devops",
  "sre",
  "aws",
  "阿里云",
  "腾讯云",
  "serverless",
  "低代码",
  "可视化",
  "echarts",
  "d3",
  "three.js",
  "webgl",
  "canvas",
  "svg",
  "音视频",
  "webrtc",
  // 大模型应用栈
  "vllm",
  "lora",
  "sft",
  "微调",
  "agent",
  "智能体",
  "milvus",
  "faiss",
  "pgvector",
  "向量数据库",
  "rerank",
  "重排",
  "llama-factory",
  "deepseek",
  "qwen",
  "通义千问",
  "chatgpt",
  "openai",
  "多模态",
  "embedding",
  "嵌入",
  "微调数据集",

  // 通用商业与管理（General Business）
  "商业分析",
  "战略规划",
  "商业模式",
  "市场调研",
  "竞品分析",
  "商务拓展",
  "bd",
  "客户关系管理",
  "crm",
  "招投标",
  "合同管理",
  "供应链",
  "采购",
  "成本控制",
  "预算管理",
  "roi",
  "kpi",
  "okr",
  "p&l",
  "b2b",
  "b2c",
  "saas",
  "生态合作",
  "渠道管理",
  "渠道拓展",
  "销售漏斗",
  "复购率",
  "客单价",
  "gmv",
  "ltv",
  "cac",
  "arr",
  "mrr",
  "商业化",
  "变现",
  "项目管理",
  "敏捷",
  "scrum",
  "跨部门协作",
  "流程优化",
  "stakeholder",

  // 产品（Product）
  "产品设计",
  "需求分析",
  "产品规划",
  "产品路线图",
  "roadmap",
  "prd",
  "原型设计",
  "交互设计",
  "用户研究",
  "用户画像",
  "漏斗分析",
  "a/b测试",
  "ab test",
  "埋点",
  "用户增长",
  "增长黑客",
  "留存率",
  "转化率",
  "dau",
  "mau",
  "需求池",
  "版本迭代",
  "axure",
  "墨刀",
  "mockplus",
  "xmind",
  "b端产品",
  "c端产品",
  "商业产品",
  "策略产品",
  "数据产品",

  // 运营（Operations）
  "用户运营",
  "内容运营",
  "活动运营",
  "社群运营",
  "新媒体运营",
  "私域流量",
  "电商运营",
  "店铺运营",
  "商品运营",
  "直播运营",
  "投放运营",
  "渠道运营",
  "数据运营",
  "精细化运营",
  "裂变",
  "拉新",
  "促活",
  "sop",
  "质量管理",
  "项目交付",
  "客户成功",
  "售后服务",
  "工单系统",
  "跨境电商",
  "亚马逊",
  "独立站",
  "抖音",
  "小红书",
  "公众号",

  // 设计（Design）
  "figma",
  "sketch",
  "ui设计",
  "ux设计",
  "ui/ux",
  "视觉设计",
  "平面设计",
  "品牌设计",
  "动效设计",
  "3d设计",
  "设计规范",
  "设计系统",
  "design system",
  "交互原型",
  "可用性测试",
  "用户体验",
  "photoshop",
  "illustrator",
  "after effects",
  "premiere",
  "cinema 4d",
  "c4d",
  "blender",
  "adobe xd",
  "framer",
  "zeplin",
  "蓝湖",
  "mastergo",
  "即时设计",

  // 市场与营销（Marketing）
  "品牌营销",
  "整合营销",
  "数字营销",
  "内容营销",
  "事件营销",
  "口碑营销",
  "效果广告",
  "信息流投放",
  "seo",
  "sem",
  "aso",
  "媒介采买",
  "kol",
  "koc",
  "达人合作",
  "公关",
  "文案策划",
  "创意策划",
  "市场推广",
  "获客",
  "线索转化",
  "mql",
  "营销自动化",
  "hubspot",
  "巨量引擎",
  "广点通",
  "舆情监控",

  // 数据与金融财会（Data / Finance）
  "数据分析",
  "数据挖掘",
  "商业智能",
  "bi",
  "sql",
  "excel",
  "vba",
  "tableau",
  "power bi",
  "powerbi",
  "finebi",
  "looker",
  "spss",
  "sas",
  "r语言",
  "stata",
  "统计分析",
  "归因分析",
  "预测模型",
  "风险控制",
  "风控",
  "反欺诈",
  "信用评估",
  "财务分析",
  "财务建模",
  "审计",
  "税务",
  "会计",
  "cpa",
  "cfa",
  "acca",
  "投融资",
  "尽职调查",
  "估值建模",
  "dcf",
  "合并报表",
  "erp",
  "sap",
  "用友",
  "金蝶",
  "资金管理",
  "量化交易",
];

const STOPWORDS = new Set([
  "我们",
  "你们",
  "他们",
  "可以",
  "需要",
  "熟悉",
  "了解",
  "精通",
  "掌握",
  "优先",
  "具有",
  "具备",
  "相关",
  "经验",
  "能力",
  "工作",
  "岗位",
  "职责",
  "任职",
  "要求",
  "本科",
  "硕士",
  "及以上",
  "以上",
  "学历",
  "专业",
  "公司",
  "团队",
  "项目",
  "系统",
  "平台",
  "使用",
  "采用",
  "进行",
  "以及",
  "或者",
  "并且",
  "能够",
  "良好",
  "较强",
  "丰富",
  "年以上",
  "年以",
  "热爱",
  "责任心",
  "沟通",
  "协作",
  "精神",
  "意识",
  "the",
  "and",
  "with",
  "for",
  "you",
  "will",
  "are",
  "our",
  "have",
  "has",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "is",
]);

function tokenize(text: string): string[] {
  const matches =
    text
      .toLowerCase()
      .match(/[\u4e00-\u9fa5]{2,6}|[a-z][a-z0-9+#./-]{1,18}/g) || [];
  return matches.filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function detectSkills(text: string): string[] {
  const lower = ` ${text.toLowerCase()} `;
  const found: string[] = [];
  for (const s of SKILL_DICT) {
    const needle = s.toLowerCase();
    const re = new RegExp(
      `(^|[^a-z0-9])${needle.replace(
        /[.*+?^${}()|[\]\\/]/g,
        "\\$&"
      )}($|[^a-z0-9])`,
      "i"
    );
    if (re.test(lower) && !found.includes(s)) found.push(s);
  }
  return found;
}

/** 解析 JD：岗位名 / 职责 / 要求 / 技能 / 关键词 / 学历 / 年限 */
export function parseJD(rawText: string, resumeId: string): JD {
  const lines = rawText
    .split(/\r?\n|[。；;]/)
    .map((l) => l.trim())
    .filter(Boolean);
  const lower = rawText.toLowerCase();

  // 岗位名：首个含岗位词的行，否则第一行
  const titleLine =
    lines.find(
      (l) =>
        l.length <= 50 &&
        /(工程师|经理|专家|架构|开发|设计|运营|分析师|顾问|总监|主管|专员|助理|策划|文案|编辑|买手|销售|商务|BD|财务|会计|审计|风控|法务|人事|HR|BP|产品|UI|UX|交互|视觉|品牌|市场|公关|投放|媒介|实习|研究员|engineer|manager|developer|designer|analyst|director|lead|specialist|coordinator|consultant|strategist|marketer|planner|accountant|auditor|recruiter|pm|po)/i.test(
          l
        )
    ) ||
    lines[0] ||
    "";
  const job_title = titleLine.replace(/^[#\-*•·\d.、)\s]+/, "").slice(0, 40);

  const responsibilities: string[] = [];
  const requirements: string[] = [];
  let mode: "none" | "resp" | "req" = "none";
  for (const l of lines) {
    const respHeading = /^(?:岗位职责|工作职责|工作内容|岗位描述|职位描述|你的工作|key\s+responsibilities|responsibilities|what\s+you(?:'ll|\s+will)\s+do)\s*[:：]?\s*(.*)$/i.exec(l);
    const reqHeading = /^(?:任职要求|岗位要求|职位要求|任职条件|我们希望你|任职资格|加分项|要求|preferred\s+qualifications|minimum\s+qualifications|qualifications|requirements|skills)\s*[:：]?\s*(.*)$/i.exec(l);
    if (respHeading) {
      mode = "resp";
      if (respHeading[1]) responsibilities.push(respHeading[1]);
      continue;
    }
    if (reqHeading) {
      mode = "req";
      if (reqHeading[1]) requirements.push(reqHeading[1]);
      continue;
    }
    const isItem = /^(\d+[.、)]|[-•·*])\s*/.test(l);
    const stripped = l.replace(/^(\d+[.、)]|[-•·*])\s*/, "");
    if (/^(负责|参与|承担|主导|制定|统筹|推动|策划|撰写|开展|manage|lead|own|drive|design|build)/i.test(stripped)) responsibilities.push(stripped);
    else if (/^(需|须|熟悉|精通|掌握|具备|能够|有\d|require|must|prefer|proficient)/i.test(stripped)) requirements.push(stripped);
    else if (mode === "resp" && (isItem || l !== titleLine)) responsibilities.push(stripped);
    else if (mode === "req" && (isItem || l !== titleLine)) requirements.push(stripped);
  }
  if (!requirements.length) {
    for (const l of lines) {
      if (
        /(优先|经验|熟悉|精通|了解|掌握|本科|硕士|学历|require|experience|bachelor|master)/i.test(l) &&
        l !== titleLine
      )
        requirements.push(l.replace(/^(\d+[.、)]|[-•·*])\s*/, ""));
    }
  }

  const skills = detectSkills(rawText);

  // 关键词：技能优先 + 高频领域词
  const freq = new Map<string, number>();
  for (const t of tokenize(rawText)) freq.set(t, (freq.get(t) || 0) + 1);
  const hot = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t);
  const keywords = [...skills, ...hot.filter((h) => !skills.includes(h))].slice(
    0,
    24
  );

  const eduM = lower.match(/(博士|硕士|研究生|本科|大专|bachelor|master|phd|mba)/);
  const yearM =
    rawText.match(/(\d{1,2})\s*(?:[-~～至]\s*\d{1,2}\s*)?年[以+]?[上]?/) ||
    rawText.match(/(\d{1,2})\+?\s*years?\s*(?:of\s+)?(?:experience)?/i);

  const structured: JDStructured = {
    job_title,
    responsibilities: responsibilities.slice(0, 12),
    requirements: requirements.slice(0, 12),
    skills,
    keywords,
    education: eduM ? eduM[0] : "",
    experience_years: yearM ? Number(yearM[1]) : null,
  };

  return {
    jd_id: uid("jd"),
    resume_id: resumeId,
    raw_text: rawText,
    structured,
    created_at: nowISO(),
  };
}

/* ---------------- 混合 AI 语义 JD 解析（R5/F4） ---------------- */

export interface JDCompetency {
  name: string;
  category: "core" | "domain" | "soft" | "tool";
  synonyms: string[];
  evidence_hint?: string;
}

export interface JDStructuredSemantic {
  role_category: string;
  competencies: JDCompetency[];
  synonyms: Record<string, string[]>;
  source: "local" | "ai";
  provider_name?: string;
}

export interface ParseJDAIOptions {
  models: ModelProvider[];
  privacy: PrivacyLike;
  /** 外部模型发送前必须显式确认；未确认绝不发出外部请求 */
  confirmedExternal?: boolean;
  confirmExternal?: (provider: ModelProvider) => Promise<boolean>;
  signal?: AbortSignal;
  /** 可选注入，便于单元测试 mock */
  chatFn?: typeof chat;
}

export interface HybridJDResult {
  jd: JD;
  semantic: JDStructuredSemantic;
  usedAI: boolean;
  reason: "rules" | "external_declined" | "ai" | "ai_fallback";
  pendingProvider?: ModelProvider;
  error?: string;
}

const LOCAL_SYNONYM_MAP: Record<string, string[]> = {
  "商业分析": ["业务分析", "经营分析", "BA"],
  "数据分析": ["数据洞察", "指标分析", "BI分析"],
  "用户增长": ["增长黑客", "拉新促活", "Growth"],
  "用户研究": ["用研", "用户调研", "UX Research"],
  "a/b测试": ["AB实验", "灰度实验", "对照实验"],
  "ab test": ["A/B测试", "灰度实验", "对照实验"],
  "prd": ["需求文档", "产品需求文档"],
  "okrs": ["OKR", "目标管理"],
  "okr": ["KPI", "目标与关键成果"],
  "crm": ["客户关系管理", "Salesforce", "纷享销客"],
  "sql": ["MySQL", "PostgreSQL", "数据查询"],
  "bi": ["商业智能", "Tableau", "Power BI", "FineBI"],
  "figma": ["Sketch", "MasterGo", "即时设计"],
  "seo": ["搜索引擎优化", "自然流量"],
  "sem": ["竞价推广", "付费搜索"],
  "财务分析": ["经营分析", "FP&A", "财务建模"],
  "风控": ["风险控制", "反欺诈", "信用评估"],
  "k8s": ["kubernetes", "容器编排"],
  "rag": ["检索增强生成", "知识库问答"],
};

export function buildLocalSemantic(jd: JD): JDStructuredSemantic {
  const synonyms: Record<string, string[]> = {};
  const competencies: JDCompetency[] = jd.structured.skills.slice(0, 12).map((s) => {
    const key = s.toLowerCase();
    const syns = LOCAL_SYNONYM_MAP[key] ?? [];
    if (syns.length) synonyms[s] = syns;
    return {
      name: s,
      category: "tool",
      synonyms: syns,
    };
  });
  return {
    role_category: jd.structured.job_title || "通用岗位",
    competencies,
    synonyms,
    source: "local",
  };
}

function parseSemanticJSON(raw: string): {
  role_category?: string;
  competencies: JDCompetency[];
  synonyms: Record<string, string[]>;
} {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("模型未返回 JSON 对象");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  const rawComps = Array.isArray(parsed.competencies) ? parsed.competencies : [];
  const competencies: JDCompetency[] = [];
  const synonyms: Record<string, string[]> = {};
  for (const item of rawComps) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== "string" || !rec.name.trim()) continue;
    const name = rec.name.trim();
    const cat = rec.category;
    const category: JDCompetency["category"] =
      cat === "core" || cat === "domain" || cat === "soft" || cat === "tool"
        ? cat
        : "core";
    const syns = Array.isArray(rec.synonyms)
      ? rec.synonyms.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    const hint = typeof rec.evidence_hint === "string" ? rec.evidence_hint.trim() : undefined;
    competencies.push({ name, category, synonyms: syns, evidence_hint: hint });
    if (syns.length) synonyms[name] = syns;
  }
  if (parsed.synonyms && typeof parsed.synonyms === "object" && !Array.isArray(parsed.synonyms)) {
    for (const [k, v] of Object.entries(parsed.synonyms as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        const list = v.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
        if (list.length) synonyms[k] = [...new Set([...(synonyms[k] ?? []), ...list])];
      }
    }
  }
  return {
    role_category: typeof parsed.role_category === "string" ? parsed.role_category.trim() : undefined,
    competencies,
    synonyms,
  };
}

/**
 * 混合 JD 解析：本地规则优先；当有可用模型且满足隐私策略（外部模型需显式确认）时，
 * 额外提取结构化胜任力（competencies）与同义词（synonyms）。
 */
export async function parseJDSemantically(
  rawText: string,
  resumeId: string,
  options: ParseJDAIOptions
): Promise<HybridJDResult> {
  const localJd = parseJD(rawText, resumeId);
  const localSemantic = buildLocalSemantic(localJd);
  const sel = selectProvider(options.models, options.privacy);

  if (sel.kind === "rules") {
    return { jd: localJd, semantic: localSemantic, usedAI: false, reason: "rules" };
  }

  if (sel.kind === "confirm_external") {
    let ok = options.confirmedExternal === true;
    if (!ok && options.confirmExternal) {
      ok = await options.confirmExternal(sel.provider);
    }
    if (!ok) {
      return {
        jd: localJd,
        semantic: localSemantic,
        usedAI: false,
        reason: "external_declined",
        pendingProvider: sel.provider,
      };
    }
  }

  const transport = options.chatFn ?? chat;
  const messages = [
    {
      role: "system",
      content:
        "你是招聘与岗位胜任力分析专家。请从招聘 JD 中提取结构化核心胜任力（competencies）与常见同义词/等价表述（synonyms），覆盖技术、商业、产品、运营、设计、市场或数据财会等任意行业。严格只输出合法 JSON 对象，不要 Markdown。",
    },
    {
      role: "user",
      content: [
        `目标岗位 JD 原文：\n${rawText.slice(0, 4000)}`,
        "",
        `本地已提取参考：岗位名=${localJd.structured.job_title}，技能=${localJd.structured.skills.join("、")}`,
        "",
        `输出严格 JSON 格式：`,
        `{"role_category":"岗位大类","competencies":[{"name":"胜任力名称","category":"core|domain|soft|tool","synonyms":["同义词1","同义词2"],"evidence_hint":"简历中可体现的证据方向"}],"synonyms":{"原词":["同义词1"]}}`,
      ].join("\n"),
    },
  ];

  try {
    const raw = await transport(sel.provider, messages, options.signal);
    const aiParsed = parseSemanticJSON(raw);
    const mergedSkills = [...localJd.structured.skills];
    for (const c of aiParsed.competencies) {
      if (
        (c.category === "tool" || c.category === "domain" || c.category === "core") &&
        !mergedSkills.some((s) => s.toLowerCase() === c.name.toLowerCase()) &&
        mergedSkills.length < 28
      ) {
        mergedSkills.push(c.name);
      }
    }
    const mergedSynonyms: Record<string, string[]> = { ...localSemantic.synonyms };
    for (const [k, v] of Object.entries(aiParsed.synonyms)) {
      mergedSynonyms[k] = [...new Set([...(mergedSynonyms[k] ?? []), ...v])];
    }
    const enrichedJd: JD = {
      ...localJd,
      structured: {
        ...localJd.structured,
        skills: mergedSkills,
        keywords: [...new Set([...mergedSkills, ...localJd.structured.keywords])].slice(0, 28),
      },
    };
    return {
      jd: enrichedJd,
      semantic: {
        role_category: aiParsed.role_category || localSemantic.role_category,
        competencies: aiParsed.competencies.length
          ? aiParsed.competencies
          : localSemantic.competencies,
        synonyms: mergedSynonyms,
        source: "ai",
        provider_name: sel.provider.name,
      },
      usedAI: true,
      reason: "ai",
    };
  } catch (err) {
    return {
      jd: localJd,
      semantic: localSemantic,
      usedAI: false,
      reason: "ai_fallback",
      error: err instanceof Error ? err.message : "AI 语义解析失败，已回退本地规则",
    };
  }
}

/* ---------------- 匹配分析 ---------------- */

/** Related tools are evidence to inspect, never an automatic skills pass. */
export function relatedSkillTools(text: string, term: string): string[] {
  if (containsTerm(text, term)) return [];
  if (!/^(向量数据库|vector databases?)$/i.test(term.trim())) return [];
  return ['Milvus', 'Qdrant', 'Weaviate', 'Chroma', 'Pinecone'].filter(tool => containsTerm(text, tool));
}

function pct(matched: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((matched / total) * 100);
}

export function matchResume(
  resumeText: string,
  jd: JD,
  achievementText = resumeText
): MatchReport {
  const skills = jd.structured.skills;
  const kws = jd.structured.keywords;

  const matchedSkills = skills.filter((s) => containsTerm(resumeText, s));
  const matchedKws = kws.filter((k) => containsTerm(resumeText, k));

  const skill_match_score = skills.length
    ? pct(matchedSkills.length, skills.length)
    : pct(matchedKws.length, Math.max(1, kws.length));
  const keyword_coverage_score = pct(
    matchedKws.length,
    Math.max(1, kws.length)
  );

  // 经历相关性：任职要求行的词元在简历中的命中比例
  const reqLines = jd.structured.requirements.length
    ? jd.structured.requirements
    : jd.structured.responsibilities;
  let expSum = 0;
  let expN = 0;
  for (const line of reqLines.slice(0, 10)) {
    const toks = tokenize(line).slice(0, 8);
    if (!toks.length) continue;
    const hit = toks.filter((t) => containsTerm(resumeText, t)).length;
    expSum += hit / toks.length;
    expN++;
  }
  const experience_relevance_score = expN
    ? Math.round((expSum / expN) * 100)
    : 50;

  // Expression checks use actual achievement clauses; version numbers do not count.
  const bullets = achievementText
    .split(/\n/)
    .filter((l) => l.trim().length > 6);
  const withNum = bullets.filter(hasAchievementMetric).length;
  const goodLen = bullets.filter(
    (b) => b.length >= 10 && b.length <= 100
  ).length;
  const writing_quality_score = bullets.length
    ? Math.round(
        (70 * withNum) / bullets.length + (30 * goodLen) / bullets.length
      )
    : 0;

  const overall_score = Math.round(
    skill_match_score * 0.35 +
      keyword_coverage_score * 0.25 +
      experience_relevance_score * 0.25 +
      writing_quality_score * 0.15
  );

  const missing_skills = skills
    .filter((s) => !containsTerm(resumeText, s) && !relatedSkillTools(resumeText, s).length)
    .slice(0, 10);
  const related_skills = skills.map(term => ({ term, tools: relatedSkillTools(resumeText, term) })).filter(item => item.tools.length);
  const missing_keywords = kws
    .filter((k) => !containsTerm(resumeText, k) && !missing_skills.includes(k) && !relatedSkillTools(resumeText, k).length)
    .slice(0, 12);

  const suggestions: string[] = [];
  if (missing_skills.length)
    suggestions.push(
      `待核对技能：JD 提取到 ${
        jd.structured.skills.length
      } 项技能，未直接匹配 ${missing_skills
        .slice(0, 5)
        .join("、")}，请先核对相关经历，不能据此认定能力缺失`
    );
  if (related_skills.length) suggestions.push(`相关工具证据待确认：${related_skills.map(item => `${item.term}（${item.tools.join('、')}）`).join('；')}，请核对具体职责和实际使用范围，无需重复堆砌同义词`);
  if (missing_keywords.length)
    suggestions.push(
      `关键词覆盖不足：可在项目/工作描述的 bullets 中自然融入「${missing_keywords
        .slice(0, 4)
        .join("、")}」等词`
    );
  if (experience_relevance_score < 60)
    suggestions.push(
      "经历相关性偏低：建议调整工作经历 bullets 的表述顺序，把与目标岗位职责重叠的内容前置"
    );
  if (writing_quality_score < 70)
    suggestions.push(
      `表达质量：有 ${
        bullets.length - withNum
      } 条描述尚未识别到成果指标（版本号不计入），可对核心成果补充比例、规模或耗时`
    );
  if (jd.structured.experience_years)
    suggestions.push(
      `JD 要求 ${jd.structured.experience_years} 年经验，请核对工作时间依据，不应仅修改个人总结年限`
    );
  if (!suggestions.length)
    suggestions.push("匹配度良好：保持当前结构，可针对不同公司微调岗位关键词");

  return {
    overall_score: clamp(overall_score, 0, 100),
    skill_match_score,
    keyword_coverage_score,
    experience_relevance_score,
    writing_quality_score,
    missing_skills,
    related_skills,
    missing_keywords,
    suggestions,
    computed_at: nowISO(),
  };
}

/** 便捷入口：基于结构化简历数据计算 */
export function matchResumeData(
  data: Parameters<typeof resumeToText>[0],
  jd: JD
): MatchReport {
  return matchResume(
    resumeToText(data),
    jd,
    data.sections
      .filter(
        (s) =>
          s.visible !== false &&
          ["work_experience", "project_experience", "summary"].includes(
            s.type ?? ""
          )
      )
      .flatMap((s) =>
        s.blocks
          .filter((b) => b.visible !== false)
          .flatMap((b) => [b.description, ...b.bullets])
      )
      .map(stripHtml)
      .filter(Boolean)
      .join("\n")
  );
}

export function jdEvidence(resume: Resume, jd: JD) {
  return [...new Set([...jd.structured.skills, ...jd.structured.keywords])].map(
    (term) => {
      const sourceLines = jd.raw_text
        .split(/\r?\n/)
        .filter((line) => containsTerm(line, term));
      const clauses = sourceLines
        .flatMap((line) => line.split(/[，,；;。]/))
        .filter((clause) => containsTerm(clause, term));
      const priority = clauses.some(
        (line) =>
          /(必须|要求|精通|掌握|must|required)/i.test(line) &&
          !/(优先|加分|preferred|nice.to.have)/i.test(line)
      )
        ? "必需"
        : clauses.some((line) =>
            /(优先|加分|preferred|nice.to.have)/i.test(line)
          )
        ? "优先"
        : "待确认";
      const matches = resume.data.sections
        .filter((s) => s.visible)
        .flatMap((s) =>
          s.blocks
            .filter((b) => b.visible)
            .flatMap((b) => {
              const text = [
                b.title,
                b.subtitle,
                b.description,
                ...b.bullets,
                ...b.skills,
              ].join(" ");
              return containsTerm(text, term)
                ? [
                    {
                      sectionId: s.section_id,
                      blockId: b.block_id,
                      title: b.title || s.title,
                    },
                  ]
                : [];
            })
        );
      const relatedMatches = resume.data.sections.filter(s => s.visible).flatMap(s => s.blocks.filter(b => b.visible).flatMap(b => {
        const tools = relatedSkillTools([b.title, b.subtitle, b.description, ...b.bullets, ...b.skills].join(' '), term);
        return tools.length ? [{ sectionId: s.section_id, blockId: b.block_id, title: b.title || s.title, tools }] : [];
      }));
      return { term, sourceLines, priority, matches, relatedMatches };
    }
  );
}

export function qualificationEvidence(resume: Resume, jd: JD) {
  const output: Array<{
    label: string;
    status: "有依据" | "存在差距" | "待确认";
    evidence: string;
  }> = [];
  const rank = (text: string) =>
    /博士|phd|doctor/i.test(text)
      ? 5
      : /硕士|master/i.test(text)
      ? 4
      : /本科|bachelor/i.test(text)
      ? 3
      : /大专|associate/i.test(text)
      ? 2
      : 0;
  if (jd.structured.education) {
    const education = resume.data.sections
      .filter((s) => s.visible && s.type === "education")
      .flatMap((s) => s.blocks.filter((b) => b.visible));
    const levels = education.map((b) =>
      rank([b.title, b.subtitle, b.description].join(" "))
    );
    const level = Math.max(0, ...levels);
    const needed = rank(jd.structured.education);
    output.push({
      label: `学历要求：${jd.structured.education}`,
      status:
        !level || !needed ? "待确认" : level >= needed ? "有依据" : "存在差距",
      evidence:
        education
          .map((b) => [b.title, b.subtitle].filter(Boolean).join(" · "))
          .join("；") || "简历中没有可见的教育信息",
    });
  }
  if (jd.structured.experience_years !== null) {
    const jobs = resume.data.sections
      .filter((s) => s.visible && s.type === "work_experience")
      .flatMap((s) => s.blocks.filter((b) => b.visible));
    const month = (date: string) => {
      const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(date);
      return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null;
    };
    const now = new Date();
    const current = now.getFullYear() * 12 + now.getMonth();
    const ranges: Array<[number, number]> = [];
    let uncertain = !jobs.length;
    for (const b of jobs) {
      const start = month(b.start_date);
      const end = /^(至今|现在|present|now)$/i.test(b.end_date)
        ? current
        : month(b.end_date);
      if (
        start === null ||
        end === null ||
        end < start ||
        end > current ||
        start > current
      )
        uncertain = true;
      else ranges.push([start, end]);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let months = 0;
    let merged: [number, number] | null = null;
    for (const range of ranges) {
      if (!merged) merged = [...range];
      else if (range[0] <= merged[1]) merged[1] = Math.max(merged[1], range[1]);
      else {
        months += merged[1] - merged[0];
        merged = [...range];
      }
    }
    if (merged) months += merged[1] - merged[0];
    const years = Math.floor((months / 12) * 10) / 10;
    output.push({
      label: `经验要求：${jd.structured.experience_years} 年`,
      status: uncertain
        ? "待确认"
        : years >= jd.structured.experience_years
        ? "有依据"
        : "存在差距",
      evidence: uncertain
        ? "存在未填写或非年月格式的日期，需要人工确认"
        : `可见工作经历去除重叠后约 ${years} 年；项目与实习是否计入需按岗位要求确认`,
    });
  }
  return output;
}
