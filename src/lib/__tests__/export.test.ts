import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractRawText } from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  generateDocx,
  generatePdf,
  parseInlineRuns,
  resumeText,
} from "../export";
import type { BulletStyleKey } from "../../types";
import { testBlock, testResume } from "./fixtures";

// 1x1 transparent PNG data URL for avatar embedding tests
const SAMPLE_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const mammothInput = (buf: ArrayBuffer) =>
  ({ arrayBuffer: buf, buffer: new Uint8Array(buf) }) as unknown as {
    arrayBuffer: ArrayBuffer;
  };

describe("本地文档导出", () => {
  it("TXT 保留大小写、顺序和数字，并排除隐藏内容", () => {
    const r = testResume();
    r.data.sections[0].blocks[0].bullets = ["React API <b>20%</b>"];
    expect(resumeText(r)).toContain("React API 20%");
    r.data.sections[0].visible = false;
    expect(resumeText(r)).not.toContain("React");
  });

  it("生成的 DOCX 可由独立解析器读取，XML 特殊字符不破坏内容", async () => {
    const r = testResume();
    r.locale = "en";
    r.data.basic_info.name = "A & B <Team>";
    const output = await generateDocx(r);
    const parsed = await extractRawText(mammothInput(output));
    expect(parsed.value).toContain("A & B <Team>");
    expect(parsed.value).toContain("Experience");
    expect(parsed.value).toContain("Present");
    expect(parsed.value).toContain("耗时降低约 20%");
  });

  it("parseInlineRuns 与 DOCX 保留 <strong>/<b>/<em>/<i> 行内富文本格式", async () => {
    const runs = parseInlineRuns(
      "Prefix <strong>bold</strong> <b>b2</b> <em>italic</em> <i>i2</i> <strong><em>both</em></strong>"
    );
    expect(runs.find((x) => x.text === "bold")?.bold).toBe(true);
    expect(runs.find((x) => x.text === "b2")?.bold).toBe(true);
    expect(runs.find((x) => x.text === "italic")?.italic).toBe(true);
    expect(runs.find((x) => x.text === "i2")?.italic).toBe(true);
    const both = runs.find((x) => x.text === "both");
    expect(both?.bold).toBe(true);
    expect(both?.italic).toBe(true);

    const r = testResume();
    r.data.sections[0].blocks[0].description =
      "主导 <strong>核心架构</strong> 与 <em>性能优化</em> 升级";
    r.data.sections[0].blocks[0].bullets = [
      "使用 <b>TypeScript</b> 和 <i>Vitest</i> 提升质量",
    ];
    const buf = await generateDocx(r);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");
    expect(docXml).toMatch(/<w:b\/>[\s\S]*?核心架构/);
    expect(docXml).toMatch(/<w:i\/>[\s\S]*?性能优化/);
    expect(docXml).toMatch(/<w:b\/>[\s\S]*?TypeScript/);
    expect(docXml).toMatch(/<w:i\/>[\s\S]*?Vitest/);
  });

  it("DOCX 将 primary_color 应用于姓名、标题和分隔线", async () => {
    const r = testResume();
    r.theme.primary_color = "#1e88e5";
    const buf = await generateDocx(r);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");
    expect(docXml).toContain('<w:color w:val="1E88E5"/>');
    expect(docXml).toContain('w:color="1E88E5"');
  });

  it("DOCX 正确渲染全部 7 种 bullet_style 及 bullet_marks 过滤", async () => {
    const styles: Array<[BulletStyleKey, string]> = [
      ["disc", "● "],
      ["diamond", "◆ "],
      ["arrow", "→ "],
      ["square", "▪ "],
      ["check", "✓ "],
      ["circle", "○ "],
      ["ordered", "1. "],
    ];
    for (const [style, expected] of styles) {
      const r = testResume();
      r.theme.bullet_style = style;
      r.data.sections[0].blocks[0].bullets = ["第一条", "第二条", "第三条"];
      r.data.sections[0].blocks[0].bullet_marks = [true, false, true];
      const buf = await generateDocx(r);
      const parsed = await extractRawText(mammothInput(buf));
      expect(parsed.value).toContain(`${expected}第一条`);
      if (style === "ordered") {
        expect(parsed.value).toContain("2. 第三条");
        expect(parsed.value).not.toContain("3. 第三条");
      }
    }
  });

  it("DOCX 嵌入 base64 avatar_url 到 word/media 与关系文件", async () => {
    const r = testResume();
    r.template_id = "academic_photo";
    r.data.avatar_url = SAMPLE_PNG_DATA_URL;
    r.theme.avatar_scale = 1.2;
    const buf = await generateDocx(r);
    const zip = await JSZip.loadAsync(buf);

    expect(zip.file("word/media/avatar.png")).toBeTruthy();
    const rels = await zip
      .file("word/_rels/document.xml.rels")!
      .async("string");
    expect(rels).toContain('Id="rIdAvatar"');
    expect(rels).toContain('Target="media/avatar.png"');

    const contentTypes = await zip
      .file("[Content_Types].xml")!
      .async("string");
    expect(contentTypes).toContain('Extension="png"');
    expect(contentTypes).toContain('ContentType="image/png"');

    const docXml = await zip.file("word/document.xml")!.async("string");
    expect(docXml).toContain('r:embed="rIdAvatar"');

    const parsed = await extractRawText(mammothInput(buf));
    expect(parsed.value).toContain("测试");
  });

  it("DOCX 在双栏模板（academic_photo / two_column）下生成无边框双栏表格结构", async () => {
    const r = testResume();
    r.template_id = "academic_photo";
    const eduBlock = testBlock();
    eduBlock.block_id = "edu_1";
    eduBlock.title = "某某大学";
    eduBlock.subtitle = "计算机科学";
    r.data.sections.push({
      section_id: "sec_edu",
      type: "education",
      title: "教育经历",
      visible: true,
      order: 1,
      blocks: [eduBlock],
    });

    const buf = await generateDocx(r);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");
    expect(docXml).toContain("<w:tbl>");
    expect(docXml).toContain("<w:gridCol");
    const cellMatches = docXml.match(/<w:tc>/g) ?? [];
    expect(cellMatches.length).toBeGreaterThanOrEqual(2);

    const parsed = await extractRawText(mammothInput(buf));
    expect(parsed.value).toContain("教育经历");
    expect(parsed.value).toContain("工作经历");
  });

  it("generatePdf 直接生成可下载的 %PDF-1.4 文件并可被 pdfjs 解析", async () => {
    const r = testResume();
    r.locale = "en";
    r.data.basic_info.name = "Jane Doe";
    r.data.basic_info.title = "Staff Engineer";
    r.data.basic_info.email = "jane@example.com";
    r.data.sections[0].title = "Experience";
    r.data.sections[0].blocks[0].title = "Acme Corp";
    r.data.sections[0].blocks[0].subtitle = "Lead";
    r.data.sections[0].blocks[0].bullets = [
      "Reduced latency by <strong>40%</strong> across APIs",
    ];

    const pdfBytes = await generatePdf(r);
    const header = new TextDecoder().decode(pdfBytes.slice(0, 8));
    expect(header).toMatch(/^%PDF-1\.4/);
    const tail = new TextDecoder().decode(pdfBytes.slice(-16));
    expect(tail).toContain("%%EOF");

    const doc = await getDocument({
      data: pdfBytes,
      useWorkerFetch: false,
      isEvalSupported: false,
    }).promise;
    expect(doc.numPages).toBe(1);
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    const extracted = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    expect(extracted).toContain("Jane Doe");
    expect(extracted).toContain("Acme Corp");
    expect(extracted).toContain("40%");
  });
});
