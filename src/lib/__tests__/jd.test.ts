import { describe, it, expect, vi } from "vitest";
import { parseJD, parseJDSemantically, matchResume } from "../jd";
import { SAMPLE_JD_TEXT } from "../samples";
import type { ModelProvider } from "../../types";

describe("parseJD：JD 结构化解析", () => {
  const jd = parseJD(SAMPLE_JD_TEXT, "resume_001");

  it("提取岗位名称", () => {
    expect(jd.structured.job_title).toContain("工程师");
  });

  it("按「岗位职责 / 任职要求」拆分条目", () => {
    expect(jd.structured.responsibilities.length).toBeGreaterThanOrEqual(3);
    expect(jd.structured.requirements.length).toBeGreaterThanOrEqual(3);
  });

  it("从技能词典中识别技能关键词", () => {
    const s = jd.structured.skills.map((x) => x.toLowerCase());
    expect(s).toContain("rag");
    expect(s).toContain("prompt");
    expect(s).toContain("python");
    expect(s).toContain("lora");
  });

  it("提取学历与年限要求", () => {
    expect(jd.structured.education).toBe("本科");
    expect(jd.structured.experience_years).toBe(3);
  });

  it("JD 绑定到指定简历且保留原文", () => {
    expect(jd.resume_id).toBe("resume_001");
    expect(jd.raw_text).toBe(SAMPLE_JD_TEXT);
    expect(jd.jd_id).toMatch(/^jd_/);
  });
  it('连续段落与无编号职责要求仍可解析，保留同一行标题后的内容', () => {
    const paragraph=parseJD('AI 应用工程师。负责企业 RAG 知识库和 Python 服务。要求具备 LangChain、向量数据库经验。能够说明项目稳定性。','r1');
    expect(paragraph.structured.job_title).toBe('AI 应用工程师');
    expect(paragraph.structured.responsibilities).toContain('负责企业 RAG 知识库和 Python 服务');
    expect(paragraph.structured.requirements).toEqual(expect.arrayContaining(['具备 LangChain、向量数据库经验','能够说明项目稳定性']));
    const inline=parseJD('工程师\n岗位职责：开发接口\n维护系统\n任职要求：熟悉 Python\n具备服务经验','r1');
    expect(inline.structured.responsibilities).toEqual(['开发接口','维护系统']);
    expect(inline.structured.requirements).toEqual(['熟悉 Python','具备服务经验']);
  });
});

describe("matchResume：简历匹配分析", () => {
  it("JD 要求 Java 而简历没有时，missing_skills 必须包含 Java（PRD FR-07 验收标准）", () => {
    const jd = parseJD("后端工程师\n任职要求：\n1. 精通 Java、Spring、MySQL；\n2. 熟悉 Redis、Kafka。", "r1");
    const report = matchResume("熟悉 python 和 django 开发", jd);
    expect(report.missing_skills.map((s) => s.toLowerCase())).toContain("java");
  });

  it("全部技能命中时技能匹配分为 100", () => {
    const jd = parseJD("前端工程师\n要求：熟悉 React、TypeScript。", "r1");
    const report = matchResume("react typescript 开发经验", jd);
    expect(report.skill_match_score).toBe(100);
    expect(report.missing_skills).toHaveLength(0);
  });

  it("输出四维评分与综合分，且均在 0-100 区间", () => {
    const jd = parseJD(SAMPLE_JD_TEXT, "r1");
    const report = matchResume("react typescript vite 性能优化 微前端 前端监控 node.js webpack", jd);
    for (const k of ["overall_score", "skill_match_score", "keyword_coverage_score", "experience_relevance_score", "writing_quality_score"] as const) {
      expect(report[k]).toBeGreaterThanOrEqual(0);
      expect(report[k]).toBeLessThanOrEqual(100);
    }
    expect(report.suggestions.length).toBeGreaterThan(0);
  });
});

describe("parseJD：非研发通用岗位词典与规则覆盖（R5/F4）", () => {
  it("识别商业分析、产品、运营、设计、市场与数据财会岗位技能与标题", () => {
    const biz = parseJD(
      "高级商业分析经理\n岗位职责：负责 SaaS 商业化变现、P&L 预算管理与竞品分析。\n任职要求：熟悉 SQL、Tableau、OKR 与 ROI 测算，3-5年相关经验，硕士优先。",
      "r_biz"
    );
    expect(biz.structured.job_title).toBe("高级商业分析经理");
    expect(biz.structured.experience_years).toBe(3);
    expect(biz.structured.education).toBe("硕士");
    const bizSkills = biz.structured.skills.map((s) => s.toLowerCase());
    expect(bizSkills).toEqual(
      expect.arrayContaining(["商业分析", "saas", "商业化", "p&l", "预算管理", "竞品分析", "sql", "tableau", "okr", "roi"])
    );

    const pmOps = parseJD(
      "高级产品运营专家\n岗位职责：主导 PRD 撰写、A/B测试、用户增长与私域流量精细化运营。\n任职要求：精通 Figma、Axure、漏斗分析与内容营销，具备 SEO/SEM 经验。",
      "r_pm"
    );
    const pmSkills = pmOps.structured.skills.map((s) => s.toLowerCase());
    expect(pmSkills).toEqual(
      expect.arrayContaining(["prd", "a/b测试", "用户增长", "私域流量", "精细化运营", "figma", "axure", "漏斗分析", "内容营销", "seo", "sem"])
    );

    const finDesign = parseJD(
      "资深财务分析与风控顾问\n岗位职责：负责财务建模、合并报表、风险控制与尽职调查。\n任职要求：持有 CPA 或 CFA 证书，熟练使用 Excel、Power BI、SAP 与 Blender。",
      "r_fin"
    );
    expect(finDesign.structured.job_title).toContain("顾问");
    const finSkills = finDesign.structured.skills.map((s) => s.toLowerCase());
    expect(finSkills).toEqual(
      expect.arrayContaining(["财务分析", "财务建模", "合并报表", "风险控制", "尽职调查", "cpa", "cfa", "excel", "power bi", "sap", "blender"])
    );
  });
});

describe("parseJDSemantically：混合语义解析与隐私门控", () => {
  const externalProvider: ModelProvider = {
    id: "ext_1",
    name: "OpenAI",
    type: "external",
    protocol: "openai_compatible",
    base_url: "https://api.openai.com/v1",
    api_key: "sk-test",
    model_name: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 1000,
    timeout_ms: 5000,
    enabled: true,
    created_at: "2026-01-01T00:00:00Z",
  };

  const localProvider: ModelProvider = {
    ...externalProvider,
    id: "loc_1",
    name: "Local Ollama",
    type: "local",
    protocol: "ollama",
    base_url: "http://localhost:11434",
    api_key: "",
    model_name: "qwen2.5",
  };

  it("无启用模型时完全离线运行本地规则引擎", async () => {
    const chatFn = vi.fn();
    const res = await parseJDSemantically(
      "产品经理\n要求：熟悉 PRD、A/B测试与 SQL。",
      "r1",
      {
        models: [],
        privacy: { allowExternal: false, route: "local_first" },
        chatFn,
      }
    );
    expect(res.usedAI).toBe(false);
    expect(res.reason).toBe("rules");
    expect(chatFn).not.toHaveBeenCalled();
    expect(res.semantic.source).toBe("local");
    expect(res.jd.structured.skills.map((s) => s.toLowerCase())).toContain("prd");
  });

  it("外部模型未通过隐私确认时绝不发出外部请求", async () => {
    const chatFn = vi.fn();
    const res = await parseJDSemantically(
      "增长产品经理\n要求：熟悉用户增长与漏斗分析。",
      "r1",
      {
        models: [externalProvider],
        privacy: { allowExternal: true, route: "ask_before_external" },
        confirmExternal: async () => false,
        chatFn,
      }
    );
    expect(res.usedAI).toBe(false);
    expect(res.reason).toBe("external_declined");
    expect(res.pendingProvider?.id).toBe("ext_1");
    expect(chatFn).not.toHaveBeenCalled();
  });

  it("外部模型经显式确认后提取结构化胜任力与同义词", async () => {
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        role_category: "增长产品",
        competencies: [
          {
            name: "实验驱动增长",
            category: "core",
            synonyms: ["A/B实验", "灰度测试", "Growth Hacking"],
            evidence_hint: "给出转化率提升幅度和样本量",
          },
        ],
        synonyms: {
          用户增长: ["拉新促活", "留存提升"],
        },
      })
    );

    const res = await parseJDSemantically(
      "增长产品经理\n要求：熟悉用户增长与实验迭代。",
      "r1",
      {
        models: [externalProvider],
        privacy: { allowExternal: true, route: "ask_before_external" },
        confirmedExternal: true,
        chatFn,
      }
    );

    expect(chatFn).toHaveBeenCalledTimes(1);
    expect(res.usedAI).toBe(true);
    expect(res.reason).toBe("ai");
    expect(res.semantic.source).toBe("ai");
    expect(res.semantic.competencies[0].name).toBe("实验驱动增长");
    expect(res.semantic.synonyms["实验驱动增长"]).toContain("A/B实验");
    expect(res.semantic.synonyms["用户增长"]).toContain("拉新促活");
  });

  it("本地模型返回非法 JSON 时安全回退本地规则结果", async () => {
    const chatFn = vi.fn().mockResolvedValue("not valid json");
    const res = await parseJDSemantically(
      "商业分析师\n要求：熟悉商业分析与 SQL。",
      "r1",
      {
        models: [localProvider],
        privacy: { allowExternal: false, route: "local_only" },
        chatFn,
      }
    );
    expect(chatFn).toHaveBeenCalledTimes(1);
    expect(res.usedAI).toBe(false);
    expect(res.reason).toBe("ai_fallback");
    expect(res.jd.structured.skills).toContain("商业分析");
  });
});
