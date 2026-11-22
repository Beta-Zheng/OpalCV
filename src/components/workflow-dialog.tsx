import { useState } from "react";
import type { AIAction, CoverLetter, Resume } from "../types";
import { ACTION_LABELS, TEMPLATES } from "../types";
import { useAppSlice } from "../lib/store";
import { actionLabel, templateNameLabel, useT, useUiLang } from "../lib/i18n";
import { diffLines, downloadText, fmtTime } from "../lib/utils";
import { resumeText } from "../lib/export";
import {
  blockHasContent,
  createCoverLetterDraft,
  coverLetterEvidence,
} from "../lib/workflow";
import { selectProvider } from "../lib/ai";
import { A4Sheet } from "./template";
import { Btn, Confirm, GlassSelect, Modal, ModalHeader } from "./ui";
import SnapshotView from "./snapshot-view";

export type WorkflowTool =
  | "target"
  | "versions"
  | "module"
  | "letter"
  | "templates"
  | "source";
export default function WorkflowDialog({
  tool,
  resume,
  onClose,
  onAIStart,
}: {
  tool: WorkflowTool;
  resume: Resume;
  onClose: () => void;
  onAIStart: (sectionId: string, blockId: string) => void;
}) {
  const app = useAppSlice(
    "models",
    "privacy",
    "jds",
    "snapshots",
    "coverLetters",
    "go",
    "toast",
    "createJobVersion",
    "captureSnapshot",
    "restoreSnapshot",
    "requestSectionSuggestions",
    "patchBlock",
    "saveCoverLetter",
    "setTemplate"
  );
  const uiLang = useUiLang();
  const t = useT();
  const titles: Record<WorkflowTool, string> = {
    target: t("为岗位创建版本", "Tailor for Job"),
    versions: t("版本快照与比较", "Version Snapshots & Compare"),
    module: t("优化当前模块", "Batch Polish Section"),
    letter: t("求职信", "Cover Letter"),
    templates: t("选择模板", "Choose Template"),
    source: t("导入原文", "Imported Source Text"),
  };
  const [company, setCompany] = useState(resume.target?.company ?? "");
  const [role, setRole] = useState(
    resume.target?.job_title ?? resume.data.basic_info.title
  );
  const [jd, setJD] = useState(app.jds[resume.id]?.raw_text ?? "");
  const [label, setLabel] = useState("");
  const [compare, setCompare] = useState<string | null>(null);
  const [viewSnapshot, setViewSnapshot] = useState<string | null>(null);
  const [restore, setRestore] = useState<string | null>(null);
  const selectable = resume.data.sections.filter(
    (s) =>
      s.visible &&
      s.type !== "basic_info" &&
      s.blocks.some((b) => b.visible && blockHasContent(b))
  );
  const [sectionId, setSectionId] = useState(selectable[0]?.section_id ?? "");
  const section = selectable.find((s) => s.section_id === sectionId);
  const [selected, setSelected] = useState<string[]>(
    section?.blocks
      .filter((b) => b.visible && blockHasContent(b))
      .map((b) => b.block_id) ?? []
  );
  const [action, setAction] = useState<AIAction>("polish");
  const [scaleFact, setScaleFact] = useState("");
  const [timeFact, setTimeFact] = useState("");
  const [resultFact, setResultFact] = useState("");
  const [letter, setLetter] = useState<CoverLetter>(
    app.coverLetters[resume.id] ??
      createCoverLetterDraft(resume, company, role, { jd: app.jds[resume.id] })
  );
  const [regenerate, setRegenerate] = useState(false);
  const rules = selectProvider(app.models, app.privacy).kind === "rules";
  const availableEvidence = coverLetterEvidence(resume, app.jds[resume.id]);
  const [letterEvidence, setLetterEvidence] = useState(
    availableEvidence.slice(0, 3)
  );
  const [motivation, setMotivation] = useState("");
  const [contribution, setContribution] = useState("");
  const snapshots = app.snapshots.filter((s) => s.resume_id === resume.id);
  const compared = snapshots.find((s) => s.id === compare);
  const saveLetter = () => {
    app.saveCoverLetter({ ...letter, company, job_title: role });
    app.toast("ok", "求职信已保存到本机");
  };
  return (
    <Modal
      open
      onClose={onClose}
      width={
        tool === "templates" || tool === "versions" ? "max-w-4xl" : "max-w-2xl"
      }
    >
      <ModalHeader
        title={titles[tool]}
        infoTip={
          tool === "versions"
            ? t(
                "保留最近 20 份近期快照，初始及投递关联快照长期保留。停止编辑 30 秒或离开编辑页时自动记录变化；恢复前自动保存当前版本。",
                "Keeps up to 20 recent snapshots; initial and application-linked snapshots are retained permanently. Auto-saves after 30s idle or leaving the editor."
              )
            : tool === "target"
            ? t(
                "为该岗位创建独立简历副本，主简历保持不变。",
                "Creates an independent tailored copy for this role while keeping your master resume untouched."
              )
            : tool === "module"
            ? t(
                "AI 建议需确认后才会写入；使用外部模型前会逐次提示确认。",
                "AI suggestions require approval before writing; external models prompt for confirmation."
              )
            : undefined
        }
        onClose={onClose}
      />
      <div className="px-6 pb-6">
        {tool === "target" && (
          <div className="flex flex-col gap-3">
            <label className="text-[12px]">
              {t("公司", "Company")}
              <input
                className="field-input mt-1"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </label>
            <label className="text-[12px]">
              {t("目标职位", "Target Role")}
              <input
                className="field-input mt-1"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </label>
            <label className="text-[12px]">
              {t("岗位 JD", "Job Description")}
              <textarea
                className="field-input mt-1"
                rows={7}
                value={jd}
                onChange={(e) => setJD(e.target.value)}
              />
            </label>
            <Btn
              variant="primary"
              disabled={!company.trim() || !role.trim()}
              onClick={() => {
                const id = app.createJobVersion(resume.id, company, role, jd);
                if (id) {
                  onClose();
                  app.go({ name: "editor", resumeId: id });
                  app.toast("ok", t("岗位版本已创建", "Tailored job copy created"));
                }
              }}
            >
              {t("创建并打开岗位版本", "Create & Open Tailored Copy")}
            </Btn>
          </div>
        )}
        {tool === "versions" && (
          <>
            <div className="mb-4 flex gap-2.5">
              <input
                className="liquid-input min-w-0 flex-1 rounded-full px-4 py-2 text-[13.5px] text-ink-900 placeholder:text-ink-400"
                aria-label={t("快照名称", "Snapshot name")}
                placeholder={t("如：投递前最终版", "e.g., Final before Google submission")}
                maxLength={128}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
              <Btn
                variant="primary"
                className="shrink-0"
                onClick={() => {
                  app.captureSnapshot(resume.id, label || t("手动快照", "Manual Snapshot"));
                  setLabel("");
                  app.toast("ok", t("版本快照已保存", "Snapshot saved"));
                }}
              >
                {t("保存快照", "Save Snapshot")}
              </Btn>
            </div>
            <div className="flex flex-col gap-2.5">
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className="soft-panel flex flex-wrap items-center justify-between gap-2.5 rounded-2xl px-4 py-3"
                >
                  <span className="text-[13px] font-medium text-ink-900">
                    {s.label}
                    <span className="ml-2 font-mono text-[11.5px] font-normal text-ink-400">
                      {new Date(s.created_at).toLocaleDateString()} {fmtTime(s.created_at)}
                    </span>
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                      {
                        {
                          initial: t("初始", "Initial"),
                          auto: t("自动", "Auto"),
                          manual: t("手动", "Manual"),
                          export: t("导出准备", "Export"),
                        }[s.kind]
                      }
                    </span>
                    {s.summary && (
                      <span className="mt-1 block text-[12px] font-normal text-ink-500">
                        {s.summary}
                      </span>
                    )}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <Btn size="sm" onClick={() => setViewSnapshot(s.id)}>{t("查看", "View")}</Btn>
                    <Btn size="sm" onClick={() => setCompare(s.id)}>{t("比较", "Compare")}</Btn>
                    <Btn size="sm" onClick={() => setRestore(s.id)}>{t("恢复", "Restore")}</Btn>
                  </div>
                </div>
              ))}
              {!snapshots.length && (
                <p className="text-[12px] text-ink-400">
                  {t("暂无快照，保存后可以比较和恢复。", "No snapshots yet. Save one to compare or restore later.")}
                </p>
              )}
            </div>
            {compared && (
              <div className="mt-4">
                <p className="mb-2 text-[12px] font-bold">
                  {compared.label} → {t("当前简历（文本差异）", "Current Resume (Text Diff)")}
                </p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-paper-50 p-3 text-[12px]">
                  {diffLines(
                    resumeText(compared.resume).split("\n"),
                    resumeText(resume).split("\n")
                  ).map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.kind === "add"
                          ? "bg-brand-50 text-brand-800"
                          : line.kind === "del"
                          ? "bg-danger-100 text-danger-700"
                          : "text-ink-500"
                      }
                    >
                      {line.kind === "add"
                        ? "+ "
                        : line.kind === "del"
                        ? "− "
                        : "  "}
                      {line.text}
                    </div>
                  ))}
                </pre>
                <p className="mt-2 text-[12px] text-ink-500">
                  {t("模板：", "Template: ")}{templateNameLabel(compared.resume.template_id, compared.resume.template_id, uiLang)} → {templateNameLabel(resume.template_id, resume.template_id, uiLang)} ·{" "}
                  {t("字号：", "Size: ")}{compared.resume.theme.font_size} → {resume.theme.font_size} ·{" "}
                  {t("语言：", "Locale: ")}{compared.resume.locale ?? "zh"} → {resume.locale ?? "zh"}
                </p>
              </div>
            )}
          </>
        )}
        {tool === "module" && (
          <div className="flex flex-col gap-3">
            <div className="text-[12px] text-ink-500">
              <span className="mb-1.5 block font-medium">{t("选择模块", "Select Section")}</span>
              <GlassSelect
                ariaLabel={t("选择模块", "Select section")}
                className="w-full"
                value={sectionId}
                onChange={(v) => {
                  const next = selectable.find((s) => s.section_id === v);
                  setSectionId(v);
                  setSelected(
                    next?.blocks
                      .filter((b) => b.visible && blockHasContent(b))
                      .map((b) => b.block_id) ?? []
                  );
                }}
                options={selectable.map((s) => ({
                  value: s.section_id,
                  label: s.title,
                }))}
              />
            </div>
            <div className="text-[12px] text-ink-500">
              <span className="mb-1.5 block font-medium">{t("优化动作", "Action")}</span>
              <GlassSelect
                ariaLabel={t("优化动作", "Action")}
                className="w-full"
                value={action}
                onChange={(v) => setAction(v as AIAction)}
                options={Object.entries(ACTION_LABELS)
                  .filter(([id]) => !(rules && ["rewrite", "expand", "translate"].includes(id)))
                  .map(([id, meta]) => ({
                    value: id,
                    label: actionLabel(id, meta.label, uiLang),
                  }))}
              />
            </div>
            <div className="rounded-lg border border-line p-3">
              {section?.blocks
                .filter((b) => b.visible && blockHasContent(b))
                .map((b) => (
                  <label
                    key={b.block_id}
                    className="mb-2 flex gap-2 text-[12px]"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(b.block_id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, b.block_id]
                            : selected.filter((id) => id !== b.block_id)
                        )
                      }
                    />
                    {b.title || b.description.slice(0, 40) || "该条目"}
                  </label>
                ))}
            </div>
            <p className="text-[12px] text-ink-500">
              {t(
                `计划生成 ${selected.length} 条建议，按顺序处理；你可以逐条接受或拒绝。取消会停止剩余队列。`,
                `${selected.length} suggestion(s) queued sequentially. Approve or reject each one individually.`
              )}
            </p>
            {action === "quantify" && (
              <div className="rounded-lg bg-paper-50 p-3">
                <p className="mb-2 text-[12px] font-bold">
                  {t("先补充真实事实（仅选择一个条目时可写入）", "Add real facts first (enabled when 1 entry is selected)")}
                </p>
                {[
                  [t("规模", "Scale"), scaleFact, setScaleFact],
                  [t("耗时 / 时间", "Timeline"), timeFact, setTimeFact],
                  [t("结果", "Result"), resultFact, setResultFact],
                ].map(([name, value, setter]) => (
                  <label key={String(name)} className="mb-2 block text-[12px]">
                    {String(name)}
                    <input
                      className="field-input mt-1"
                      value={String(value)}
                      onChange={(e) =>
                        (setter as (s: string) => void)(e.target.value)
                      }
                    />
                  </label>
                ))}
                <Btn
                  disabled={
                    selected.length !== 1 ||
                    ![scaleFact, timeFact, resultFact].some((s) => s.trim())
                  }
                  onClick={() => {
                    const b = section?.blocks.find(
                      (b) => b.block_id === selected[0]
                    );
                    if (!b || !section) return;
                    const facts = [
                      [t("规模", "Scale"), scaleFact],
                      [t("时间", "Timeline"), timeFact],
                      [t("结果", "Result"), resultFact],
                    ]
                      .filter(([, value]) => value.trim())
                      .map(([name, value]) => `${name}${t("：", ": ")}${value.trim()}`);
                    app.patchBlock(resume.id, section.section_id, b.block_id, {
                      bullets: [...b.bullets, ...facts],
                    });
                    setScaleFact("");
                    setTimeFact("");
                    setResultFact("");
                    app.toast("ok", t("已补充你提供的事实", "Facts added to entry"));
                  }}
                >
                  {t("补充到条目", "Append to Entry")}
                </Btn>
              </div>
            )}
            <Btn
              variant="primary"
              disabled={
                !selected.length ||
                (action === "jd_match" && !app.jds[resume.id])
              }
              onClick={() => {
                app.requestSectionSuggestions(
                  resume.id,
                  sectionId,
                  action,
                  selected
                );
                onAIStart(sectionId, selected[0]);
                onClose();
              }}
            >
              {t("按计划生成建议", "Generate Suggestions")}
            </Btn>
          </div>
        )}
        {tool === "letter" && (
          <div className="flex flex-col gap-3">
            <p className="text-[12px] text-ink-500">
              {t("选择经历，补充动机，再生成草稿。", "Select highlights, add motivation, then generate a draft.")}
            </p>
            <p className="text-[12px] text-ink-500">
              {t("当前草稿：", "Draft language: ")}
              {letter.locale === "en" ? t("英文", "English") : t("中文", "Chinese")} ·{" "}
              {t("更换版式不会翻译已有内容。", "Switching layout locale does not translate existing text.")}
            </p>
            <label className="text-[12px]">
              {t("为何应聘这家公司（英文信请填写英文）", "Why this company?")}
              <textarea
                aria-label={t("应聘动机", "Motivation")}
                className="field-input mt-1"
                value={motivation}
                onChange={(e) => setMotivation(e.target.value)}
                placeholder={t("具体产品、业务或团队吸引你的原因，避免空泛赞美", "Specific products, mission, or team challenges that excite you")}
              />
            </label>
            <label className="text-[12px]">
              {t("你能带来的贡献（只写真实能力）", "How you can contribute")}
              <textarea
                aria-label={t("岗位贡献", "Contribution")}
                className="field-input mt-1"
                value={contribution}
                onChange={(e) => setContribution(e.target.value)}
                placeholder={t("把真实经历与当前岗位要解决的问题连接起来", "Connect your track record to the role's key challenges")}
              />
            </label>
            <fieldset className="max-h-40 overflow-auto rounded-lg border border-line p-2">
              <legend className="text-[12px]">
                {t("选择最多三条经历证据（按 JD 相关词项排序）", "Select up to 3 highlights (ranked by JD relevance)")}
              </legend>
              {availableEvidence.map((text, i) => (
                <label key={i} className="mb-2 flex gap-2 text-[12px]">
                  <input
                    type="checkbox"
                    checked={letterEvidence.includes(text)}
                    disabled={
                      !letterEvidence.includes(text) &&
                      letterEvidence.length >= 3
                    }
                    onChange={(e) =>
                      setLetterEvidence(
                        e.target.checked
                          ? [...letterEvidence, text]
                          : letterEvidence.filter((x) => x !== text)
                      )
                    }
                  />
                  {text}
                </label>
              ))}
            </fieldset>
            {letter.locale === "en" && /[\u4e00-\u9fff]/.test(letter.body) && (
              <p role="status" className="text-[12px] text-seal-700">
                {t(
                  "正文仍含中文经历。可先用模型翻译对应条目并确认，再生成英文求职信；切换版式不会翻译内容。",
                  "Draft still contains Chinese text. Translate those resume entries first, then regenerate."
                )}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <label className="text-[12px]">
                {t("公司", "Company")}
                <input
                  className="field-input mt-1"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </label>
              <label className="text-[12px]">
                {t("职位", "Role")}
                <input
                  className="field-input mt-1"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                />
              </label>
            </div>
            <Btn onClick={() => setRegenerate(true)}>
              {t("按当前简历重新生成草稿", "Regenerate Draft from Resume")}
            </Btn>
            <textarea
              aria-label={t("求职信正文", "Cover letter body")}
              className="field-input"
              rows={14}
              value={letter.body}
              onChange={(e) => setLetter({ ...letter, body: e.target.value })}
            />
            <div className="flex gap-2">
              <Btn variant="primary" onClick={saveLetter}>
                {t("保存求职信", "Save Cover Letter")}
              </Btn>
              <Btn
                onClick={() => {
                  saveLetter();
                  downloadText(
                    `cover-letter-${
                      resume.data.basic_info.name || "resume"
                    }.txt`,
                    letter.body,
                    "text/plain"
                  );
                }}
              >
                {t("下载 TXT", "Download TXT")}
              </Btn>
            </div>
          </div>
        )}
        {tool === "templates" && (
          <div className="grid gap-4 sm:grid-cols-3">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.template_id}
                className={`rounded-xl border p-3 text-left ${
                  resume.template_id === tpl.template_id
                    ? "border-brand-500 bg-brand-50"
                    : "border-line"
                }`}
                onClick={() => {
                  app.setTemplate(resume.id, tpl.template_id);
                  onClose();
                }}
              >
                <div className="mx-auto mb-3 h-[180px] w-[130px] overflow-hidden rounded bg-white">
                  <div
                    style={{
                      transform: "scale(0.164)",
                      transformOrigin: "top left",
                      width: 794,
                    }}
                  >
                    <A4Sheet
                      resume={{ ...resume, template_id: tpl.template_id }}
                    />
                  </div>
                </div>
                <p className="text-[13px] font-bold">
                  {templateNameLabel(tpl.template_id, tpl.name, uiLang)}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                  {tpl.description}
                </p>
              </button>
            ))}
          </div>
        )}
        {tool === "source" && (
          <>
            <p className="mb-2 text-[12px] text-ink-500">
              {resume.data.metadata.reviewed_at
                ? t(
                    "导入时已完成核对；原文保存在本机，不参与 PDF / DOCX 导出。",
                    "Verified on import. Source text stays local and is excluded from PDF/DOCX exports."
                  )
                : t("可将原文与当前条目对照核对。", "Compare original source text against parsed entries.")}
            </p>
            <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-xl bg-paper-50 p-4 text-[12px]">
              {resume.data.metadata.source_text ||
                t("这份简历没有保存导入原文。", "No imported source text saved for this resume.")}
            </pre>
          </>
        )}
      </div>
      {viewSnapshot && app.snapshots.find((s) => s.id === viewSnapshot) && (
        <SnapshotView
          snapshot={app.snapshots.find((s) => s.id === viewSnapshot)!}
          onClose={() => setViewSnapshot(null)}
        />
      )}
      <Confirm
        open={!!restore}
        title={t("恢复该快照？", "Restore this snapshot?")}
        desc={t(
          "将恢复内容、模板与 JD，并保留恢复前的自动快照；当前简历的 AI 建议会清除。",
          "Restores content, template, and JD while saving a backup snapshot first. Pending AI suggestions will be cleared."
        )}
        confirmText={t("恢复版本", "Restore")}
        onConfirm={() => {
          if (restore && app.restoreSnapshot(restore))
            app.toast("ok", t("快照已恢复", "Snapshot restored"));
          setRestore(null);
        }}
        onCancel={() => setRestore(null)}
      />
      <Confirm
        open={regenerate}
        title={t("重新生成求职信草稿？", "Regenerate cover letter draft?")}
        desc={t(
          "将替换当前编辑框中的文字，已保存版本会在你再次保存时更新。",
          "Replaces the current editor text. Your saved copy updates only when you save again."
        )}
        confirmText={t("重新生成", "Regenerate")}
        onConfirm={() => {
          setLetter(
            createCoverLetterDraft(resume, company, role, {
              jd: app.jds[resume.id],
              evidence: letterEvidence,
              motivation,
              contribution,
            })
          );
          setRegenerate(false);
        }}
        onCancel={() => setRegenerate(false)}
      />
    </Modal>
  );
}
