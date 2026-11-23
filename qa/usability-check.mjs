import { createServer } from "vite";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

await mkdir(".export-qa", { recursive: true });
const server = await createServer({ server: { host: "127.0.0.1", port: 0, strictPort: false } });
await server.listen();
const browser = await chromium.launch(process.env.QA_BROWSER ? { executablePath: process.env.QA_BROWSER } : {});
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  await context.addInitScript(() =>
    localStorage.setItem("opalcv-usage-guide", JSON.stringify({ version: 1, decision: "skipped" }))
  );
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const origin = server.resolvedUrls.local[0];

  // 1. Workbench loads cleanly & empty Applications state works
  await page.goto(origin);
  await page.getByRole("heading", { name: "工作台", exact: true }).waitFor();
  await page.locator('button.dock-icon[aria-label="投递记录"]').first().click();
  await page.getByRole("heading", { name: "投递记录", exact: true }).waitFor();
  await page.screenshot({ path: ".export-qa/usability-empty-applications.png" });

  // 2. Seed master resume + tailored JD version via store
  await page.locator('button.dock-icon[aria-label="工作台"]').first().click();
  const fixture = await page.evaluate(async () => {
    const { useApp } = await import("/src/lib/store.ts");
    const { buildSampleResume } = await import("/src/lib/samples.ts");
    const source = useApp.getState().createResume(buildSampleResume("ai", "experienced"), "审查回归主简历");
    const id = useApp
      .getState()
      .createJobVersion(
        source,
        "回归示例公司",
        "AI 应用工程师",
        "AI 应用工程师。负责企业 RAG 知识库和 Python 服务。要求具备 LangChain、向量数据库及 vLLM 部署经验。"
      );
    const resume = useApp.getState().resumes.find((r) => r.id === id);
    return { id, source, before: JSON.stringify(resume) };
  });

  await page.goto(origin + "#/home");
  await page.getByText("回归示例公司 · AI 应用工程师").first().waitFor();
  await page.screenshot({ path: ".export-qa/usability-home.png" });

  // 3. Editor split view, floating Style/Layout popovers, and non-overlapping AI/JD panel across desktop widths
  await page.goto(origin + "#/editor/" + fixture.id);
  await page.getByRole("textbox", { name: "姓名", exact: true }).waitFor();

  // Floating Style & Layout popovers
  await page.getByRole("button", { name: "外观", exact: true }).click();
  await page.getByText("主题色", { exact: true }).waitFor();
  await page.getByRole("button", { name: "排版", exact: true }).click();
  await page.getByRole("dialog", { name: "排版设置", exact: true }).waitFor();
  await page.keyboard.press("Escape");

  for (const width of [1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 960 });
    await page.getByRole("button", { name: "AI 建议", exact: true }).click();
    const closePanel = page.getByRole("button", { name: "关闭 AI 与 JD 面板", exact: true });
    await closePanel.waitFor();
    const panel = page.locator("aside").filter({ has: closePanel });
    const fieldBounds = await page.getByRole("textbox", { name: "目标职位", exact: true }).boundingBox();
    const panelBounds = await panel.boundingBox();
    assert(fieldBounds && panelBounds && fieldBounds.x + fieldBounds.width <= panelBounds.x + 2, `${width}: panel covers form`);
    if (width === 1440) await page.screenshot({ path: ".export-qa/usability-desktop.png" });
    await closePanel.click();
  }
  await page.setViewportSize({ width: 1440, height: 960 });

  const afterPanels = await page.evaluate(async (id) => {
    const { useApp } = await import("/src/lib/store.ts");
    return useApp.getState().resumes.find((r) => r.id === id);
  }, fixture.id);
  assert.deepEqual(afterPanels, JSON.parse(fixture.before));

  // 4. Export dialog validation + DOCX download
  await page.getByRole("button", { name: "导出", exact: true }).click();
  await page.getByRole("dialog", { name: "检查并导出", exact: true }).waitFor();
  assert((await page.getByRole("textbox", { name: "导出文件名称", exact: true }).inputValue()).includes("回归示例公司"));
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "下载 DOCX", exact: true }).click(),
  ]);
  assert(download.suggestedFilename().includes("回归示例公司"));
  await page.getByRole("dialog").getByRole("button", { name: "关闭", exact: true }).click();

  // 5. Applications create + status update (GlassSelect menuitemradio)
  await page.locator('button.dock-icon[aria-label="投递记录"]').first().click();
  await page.getByRole("button", { name: "新增记录", exact: true }).click();
  const dialogInputs = page.locator('div[role="dialog"] input');
  await dialogInputs.nth(0).fill("回归示例公司");
  await dialogInputs.nth(1).fill("AI 应用工程师");
  await page.getByRole("button", { name: "保存记录", exact: true }).click();
  await page.getByRole("button", { name: "更新进度", exact: true }).first().click();
  await page.locator('button[aria-label="当前状态"]').first().click();
  await page.locator('[role="menuitemradio"]').filter({ hasText: /面试中/ }).first().click();
  await page.getByRole("textbox", { name: "追加反馈", exact: true }).fill("虚构反馈：准备技术面试");
  await page.getByRole("button", { name: "保存进度", exact: true }).click();
  await page.screenshot({ path: ".export-qa/usability-applications.png" });

  // 6. Models & Privacy guardrail + local passphrase encryption
  await page.locator('button.dock-icon[aria-label="模型与隐私"]').first().click();
  await page.getByRole("heading", { name: "模型与隐私", exact: true }).waitFor();
  await page.locator('button[role="switch"]').first().click();
  await page.getByRole("button", { name: "我了解风险，开启", exact: true }).waitFor();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.locator('input[aria-label="本地主密码"]').fill("qa-passphrase");
  await page.getByRole("button", { name: "启用加密", exact: true }).click();
  await page.getByText("加密已启用", { exact: true }).waitFor();

  // 7. Mobile viewport (375px) zero horizontal overflow
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(origin + "#/home");
  await page.getByRole("heading", { name: "工作台", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  await page.screenshot({ path: ".export-qa/usability-home-mobile.png" });

  await page.goto(origin + "#/editor/" + fixture.id);
  await page.getByRole("textbox", { name: "姓名", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 375);
  await page.screenshot({ path: ".export-qa/usability-mobile.png" });

  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify(
      {
        desktopWidths: [1280, 1440, 1920],
        floatingStyleLayoutPopovers: true,
        noPanelOverlap: true,
        noImplicitEdits: true,
        exportDocx: true,
        applicationsProgressUpdate: true,
        privacyGuardrailAndPassphrase: true,
        mobileZeroOverflow: true,
        errors,
      },
      null,
      2
    )
  );
} catch (error) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) {
    await page.screenshot({ path: ".export-qa/usability-failure.png" }).catch(() => {});
    await writeFile(".export-qa/usability-failure-dom.txt", await page.content()).catch(() => {});
  }
  throw error;
} finally {
  await browser.close();
  await server.close();
}
