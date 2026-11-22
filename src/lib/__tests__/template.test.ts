import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A4Sheet } from "../../components/template";
import { TEMPLATES, type Resume } from "../../types";
import { testBlock, testResume } from "./fixtures";

const ALL_TEMPLATE_IDS = [
  "modern_single_column",
  "swiss_grid",
  "executive_sidebar",
  "classic_ats",
  "academic_photo",
  "latex_minimal",
  "campus_compact",
] as const;

function fullSampleResume(templateId: string): Resume {
  const base = testResume();
  base.template_id = templateId;
  base.target = { company: "Acme Tech", job_title: "Frontend Intern" };
  base.data.basic_info = {
    name: "张明",
    title: "前端研发工程师",
    email: "ming@example.com",
    phone: "13800138000",
    location: "上海",
    website: "github.com/ming",
    custom_fields: [{ label: "到岗时间", value: "一周内" }],
  };
  base.data.sections = [
    {
      section_id: "sec_summary",
      type: "summary",
      title: "个人总结",
      visible: true,
      order: 0,
      blocks: [
        { ...testBlock(), block_id: "blk_sum", type: "summary", title: "", subtitle: "", start_date: "", end_date: "", bullets: [], skills: [], description: "专注高性能 Web 应用开发", order: 0 },
      ],
    },
    {
      section_id: "sec_work",
      type: "work_experience",
      title: "工作经历",
      visible: true,
      order: 1,
      blocks: [
        { ...testBlock(), block_id: "blk_work", type: "work_experience_item", title: "星辰科技", subtitle: "前端实习生", start_date: "2025-06", end_date: "2025-09", location: "杭州", bullets: ["重构首屏加载，LCP 降低 35%"], skills: [], order: 0 },
      ],
    },
    {
      section_id: "sec_proj",
      type: "project_experience",
      title: "项目经历",
      visible: true,
      order: 2,
      blocks: [
        { ...testBlock(), block_id: "blk_proj", type: "project_experience_item", title: "简历工作台", subtitle: "核心作者", start_date: "2025-01", end_date: "2025-05", bullets: ["实现多模板实时预览"], skills: ["TypeScript", "React"], order: 0 },
      ],
    },
    {
      section_id: "sec_edu",
      type: "education",
      title: "教育经历",
      visible: true,
      order: 3,
      blocks: [
        { ...testBlock(), block_id: "blk_edu", type: "education_item", title: "复旦大学", subtitle: "计算机科学与技术 · 本科", start_date: "2022-09", end_date: "2026-06", description: "GPA 3.85/4.0", bullets: [], skills: [], order: 0 },
      ],
    },
    {
      section_id: "sec_skills",
      type: "skills",
      title: "专业技能",
      visible: true,
      order: 4,
      blocks: [
        { ...testBlock(), block_id: "blk_skill", type: "skill_group", title: "前端栈", subtitle: "", start_date: "", end_date: "", bullets: [], skills: ["React", "TypeScript", "Vite"], order: 0 },
      ],
    },
    {
      section_id: "sec_cert",
      type: "certifications",
      title: "证书奖项",
      visible: true,
      order: 5,
      blocks: [
        { ...testBlock(), block_id: "blk_cert", type: "certification", title: "全国大学生程序设计竞赛银奖", subtitle: "ICPC", start_date: "2024-11", end_date: "", bullets: [], skills: [], order: 0 },
      ],
    },
    {
      section_id: "sec_hidden",
      type: "custom",
      title: "隐藏模块",
      visible: false,
      order: 6,
      blocks: [
        { ...testBlock(), block_id: "blk_hidden", type: "custom_text", title: "不应出现", subtitle: "", start_date: "", end_date: "", bullets: [], skills: [], order: 0 },
      ],
    },
  ];
  return base;
}

describe("模板注册", () => {
  it("包含全部 5 个模板（含 latex_minimal 与 campus_compact）", () => {
    const ids = TEMPLATES.map((t) => t.template_id);
    for (const id of ALL_TEMPLATE_IDS) {
      expect(ids).toContain(id);
    }
    expect(TEMPLATES.find((t) => t.template_id === "latex_minimal")?.name).toBe("海外英文极简 / LaTeX 风格");
    expect(TEMPLATES.find((t) => t.template_id === "campus_compact")?.name).toBe("校招紧凑一页");
  });
});

describe("基本信息格式与预览一致", () => {
  it.each(ALL_TEMPLATE_IDS)("%s 不显示加粗标记，保留姓名与职位", (template) => {
    const resume = testResume();
    resume.template_id = template;
    resume.data.basic_info.name = "**验证姓名**";
    resume.data.basic_info.title = "**前端工程师**";
    const markup = renderToStaticMarkup(createElement(A4Sheet, { resume }));
    expect(markup).not.toContain("**");
    expect(markup).toContain("验证姓名");
    expect(markup).toContain("前端工程师");
    expect(markup).toContain("<strong");
  });
});

it.each(ALL_TEMPLATE_IDS)("%s 确认栏目用途不隐藏只有标题的现有内容", (template) => {
  const resume = testResume();
  resume.template_id = template;
  resume.data.sections[0].type = "summary";
  resume.data.sections[0].blocks = resume.data.sections[0].blocks.slice(0, 1).map((b) => ({ ...b, title: "保留原有标题", description: "", bullets: [] }));
  expect(renderToStaticMarkup(createElement(A4Sheet, { resume }))).toContain("保留原有标题");
});

describe("新模板完整渲染校验", () => {
  it.each(["latex_minimal", "campus_compact"] as const)("%s 完整渲染所有可见模块与条目并过滤隐藏内容", (templateId) => {
    const resume = fullSampleResume(templateId);
    const markup = renderToStaticMarkup(createElement(A4Sheet, { resume }));

    // 基本信息与联系方式
    expect(markup).toContain("张明");
    expect(markup).toContain("前端研发工程师");
    expect(markup).toContain("ming@example.com");
    expect(markup).toContain("13800138000");
    expect(markup).toContain("github.com/ming");
    expect(markup).toContain("到岗时间：一周内");

    // 全部可见模块与条目内容
    expect(markup).toContain("专注高性能 Web 应用开发");
    expect(markup).toContain("星辰科技");
    expect(markup).toContain("2025-06 – 2025-09");
    expect(markup).toContain("重构首屏加载，LCP 降低 35%");
    expect(markup).toContain("简历工作台");
    expect(markup).toContain("复旦大学");
    expect(markup).toContain("GPA 3.85/4.0");
    expect(markup).toContain("TypeScript");
    expect(markup).toContain("Vite");
    expect(markup).toContain("全国大学生程序设计竞赛银奖");

    // 隐藏模块不渲染
    expect(markup).not.toContain("隐藏模块");
    expect(markup).not.toContain("不应出现");
  });

  it("latex_minimal 使用居中头部、全宽底线与文本技能", () => {
    const resume = fullSampleResume("latex_minimal");
    const markup = renderToStaticMarkup(createElement(A4Sheet, { resume }));
    expect(markup).toContain("text-center");
    expect(markup).toContain("border-bottom:1px solid #111");
    expect(markup).toContain("text-transform:uppercase");
    expect(markup).toContain("React, TypeScript, Vite");
    expect(markup).toContain("Noto Serif SC");
  });

  it("campus_compact 将教育经历置顶突出并渲染胶囊技能标签", () => {
    const resume = fullSampleResume("campus_compact");
    const markup = renderToStaticMarkup(createElement(A4Sheet, { resume }));
    expect(markup).toContain("Acme Tech");
    expect(markup).toContain("rounded-full");
    // 教育经历（order=3）在 campus_compact 中排在工作经历（order=1）之前
    const eduIdx = markup.indexOf("data-resume-section=\"sec_edu\"");
    const workIdx = markup.indexOf("data-resume-section=\"sec_work\"");
    const sumIdx = markup.indexOf("data-resume-section=\"sec_summary\"");
    expect(sumIdx).toBeGreaterThan(-1);
    expect(eduIdx).toBeGreaterThan(sumIdx);
    expect(workIdx).toBeGreaterThan(eduIdx);
  });
});
