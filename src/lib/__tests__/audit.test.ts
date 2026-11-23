import { describe, it, expect, vi } from "vitest";
import { auditResume, enhanceAuditWithAI, fixCjkSpacing } from "../audit";
import type { ModelProvider, Resume } from "../../types";

function makeTestResume(overrides?: Partial<Resume["data"]>): Resume {
  return {
    id: "res_audit_1",
    title: "测试简历",
    template_id: "classic",
    theme: { primary_color: "#0f766e", font_size: 14 },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    data: {
      basic_info: {
        name: "张三",
        title: "产品经理",
        email: "test@example.com",
        phone: "13800138000",
        location: "上海",
        website: "",
      },
      sections: [
        {
          section_id: "sec_work",
          type: "work_experience",
          title: "工作经历",
          visible: true,
          order: 1,
          blocks: [
            {
              block_id: "blk_work_1",
              type: "work_experience_item",
              title: "甲公司",
              subtitle: "高级产品经理",
              start_date: "2020-01",
              end_date: "2021-06",
              location: "上海",
              description: "",
              bullets: [
                "负责SaaS产品规划，覆盖 20 万用户，转化率提升 18%。",
                "负责企业内部协同平台建设，推动跨部门流程落地。",
              ],
              skills: [],
              links: [],
              visible: true,
              order: 1,
            },
            {
              block_id: "blk_work_2",
              type: "work_experience_item",
              title: "乙公司",
              subtitle: "产品总监",
              start_date: "2022-02",
              end_date: "至今",
              location: "北京",
              description: "",
              bullets: [
                "负责商业化增长体系搭建，达成营收增长 35%。",
                "协调研发与运营团队完成版本迭代上线。",
              ],
              skills: [],
              links: [],
              visible: true,
              order: 2,
            },
          ],
        },
        {
          section_id: "sec_proj",
          type: "project_experience",
          title: "项目经历",
          visible: true,
          order: 2,
          blocks: [
            {
              block_id: "blk_proj_1",
              type: "project_experience_item",
              title: "智能数据分析平台",
              subtitle: "项目负责人",
              start_date: "2023-01",
              end_date: "2023-08",
              location: "",
              description: "基于React与SQL构建自助分析看板",
              bullets: [
                "搭建指标体系并推动业务方日常使用。",
              ],
              skills: [],
              links: [],
              visible: true,
              order: 1,
            },
          ],
        },
      ],
      metadata: {
        source: "empty",
        created_at: "2026-01-01T00:00:00Z",
      },
      ...overrides,
    },
  };
}

describe("auditResume：全简历体检引擎（R6/F5）", () => {
  it("检测时间线断层（>3 个月），并精确标注 sectionId 与 blockId", () => {
    const resume = makeTestResume();
    const report = auditResume(resume);

    const gaps = report.issues.filter((i) => i.category === "timeline_gap");
    expect(gaps.length).toBe(1);
    expect(gaps[0].sectionId).toBe("sec_work");
    expect(gaps[0].blockId).toBe("blk_work_2");
    expect(gaps[0].message).toContain("8 个月");
  });

  it("时间线连续或间隔 <=3 个月时不误报断层", () => {
    const resume = makeTestResume();
    resume.data.sections[0].blocks[1].start_date = "2021-09"; // 2021-06 -> 2021-09 = 3 个月
    const report = auditResume(resume);
    expect(report.counts.timeline_gap).toBe(0);
  });

  it("检测跨条目及单条目内重复开头动词", () => {
    const resume = makeTestResume();
    const report = auditResume(resume);

    const verbs = report.issues.filter((i) => i.category === "repeated_verb");
    expect(verbs.length).toBeGreaterThanOrEqual(1);
    expect(verbs.some((v) => v.message.includes("负责"))).toBe(true);
    for (const v of verbs) {
      expect(v.sectionId).toBeTruthy();
      expect(v.blockId).toBeTruthy();
    }
  });

  it("检测中英文/数字混排缺空格，并提供 fixCjkSpacing 辅助修复", () => {
    const resume = makeTestResume();
    const report = auditResume(resume);

    const spacing = report.issues.filter((i) => i.category === "cjk_spacing");
    expect(spacing.length).toBe(2); // blk_work_1 ("负责SaaS产品") & blk_proj_1 ("基于React与SQL构建")
    expect(spacing.map((s) => s.blockId)).toEqual(
      expect.arrayContaining(["blk_work_1", "blk_proj_1"])
    );
    expect(fixCjkSpacing("使用React开发3个模块")).toBe("使用 React 开发 3 个模块");
  });

  it("检测缺失量化成果指标的经历要点", () => {
    const resume = makeTestResume();
    const report = auditResume(resume);

    const metrics = report.issues.filter((i) => i.category === "missing_metric");
    expect(metrics.length).toBe(3);
    for (const m of metrics) {
      expect(m.sectionId).toBeTruthy();
      expect(m.blockId).toBeTruthy();
    }
  });

  it("每条体检结果都必须包含 sectionId 和 blockId 以便点击定位", () => {
    const report = auditResume(makeTestResume());
    expect(report.total).toBeGreaterThan(0);
    for (const issue of report.issues) {
      expect(issue.sectionId).toBeTruthy();
      expect(issue.blockId).toBeTruthy();
    }
  });
});

describe("enhanceAuditWithAI：可选 AI 深度建议与隐私门控", () => {
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

  it("未启用外部模型或未通过隐私确认时绝不发送外部请求", async () => {
    const resume = makeTestResume();
    const report = auditResume(resume);
    const chatFn = vi.fn();

    const declined = await enhanceAuditWithAI(resume, report, {
      models: [externalProvider],
      privacy: { allowExternal: true, route: "ask_before_external" },
      confirmExternal: async () => false,
      chatFn,
    });
    expect(declined.usedAI).toBe(false);
    expect(declined.reason).toBe("external_declined");
    expect(declined.pendingProvider?.id).toBe("ext_1");
    expect(chatFn).not.toHaveBeenCalled();
  });

  it("经显式确认后返回结构化 AI 改进建议", async () => {
    const resume = makeTestResume();
    const report = auditResume(resume);
    const chatFn = vi.fn().mockResolvedValue(
      JSON.stringify({
        suggestions: [
          {
            sectionId: "sec_work",
            blockId: "blk_work_1",
            category: "missing_metric",
            advice: "第二条协同平台建设可补充覆盖部门数量或审批耗时缩短比例。",
            example: "推动跨部门流程落地，覆盖 X 个部门，审批耗时缩短 X%（请按实际补充）",
          },
        ],
      })
    );

    const res = await enhanceAuditWithAI(resume, report, {
      models: [externalProvider],
      privacy: { allowExternal: true, route: "ask_before_external" },
      confirmedExternal: true,
      chatFn,
    });

    expect(chatFn).toHaveBeenCalledTimes(1);
    expect(res.usedAI).toBe(true);
    expect(res.reason).toBe("ai");
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].blockId).toBe("blk_work_1");
  });
});
