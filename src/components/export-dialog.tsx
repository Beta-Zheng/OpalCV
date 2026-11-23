import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Resume } from "../types";
import { useAppSlice } from "../lib/store";
import { useT } from "../lib/i18n";
import { createResumeBackup } from "../lib/backup";
import { inspectResume } from "../lib/workflow";
import {
  generateDocx,
  generatePdf,
  resumeMarkdown,
  resumeText,
  downloadBlob,
} from "../lib/export";
import { downloadText, fmtDateCompact, nowISO } from "../lib/utils";
import type { PageLayout } from "../lib/pagination";
import ResumePreview from "./resume-preview";
import { A4Sheet } from "./template";
import { Btn, Modal, ModalHeader, useActionMenu } from "./ui";
import { IconChevronDown, IconDownload, IconPrinter } from "./icons";

export default function ExportDialog({
  resume,
  onClose,
  onLocate,
  onAdjustLayout,
  onRecordApplication,
}: {
  resume: Resume;
  onClose: () => void;
  onLocate: (sectionId: string, blockId?: string) => void;
  onAdjustLayout: () => void;
  onRecordApplication: () => void;
}) {
  const app = useAppSlice(
    "resumes",
    "jds",
    "suggestions",
    "snapshots",
    "applications",
    "coverLetters",
    "models",
    "privacy",
    "toast",
    "captureSnapshot"
  );
  const t = useT();
  const [plan, setPlan] = useState<{
    source: Resume;
    pages: PageLayout[];
  } | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useActionMenu(moreOpen, setMoreOpen, moreRef);

  const issues = inspectResume(resume).filter(
    (issue) => !ignored.includes(issue.id)
  );
  const ready = plan?.source === resume;
  const [filename, setFilename] = useState(() =>
    [
      resume.data.basic_info.name || t("简历", "Resume"),
      resume.target?.company,
      resume.target?.job_title || resume.data.basic_info.title,
      fmtDateCompact(nowISO()),
    ]
      .filter(Boolean)
      .join("_")
  );
  const safeName =
    filename
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[.\s]+$/g, "")
      .slice(0, 120) || "Resume";

  const capture = (label: string) => {
    app.captureSnapshot(resume.id, label, "export");
    setPrepared(true);
  };

  const print = async () => {
    if (!ready) return;
    const previous = document.title;
    setBusy(true);
    try {
      await Promise.race([
        document.fonts.ready,
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (
        planRef.current?.source !== resume ||
        planRef.current.pages.some((p) => p.oversized)
      ) {
        app.toast(
          "warn",
          t(
            "分页待更新或有过长条目，请检查后再打印",
            "Pagination is updating or an entry exceeds one page"
          )
        );
        return;
      }
      capture("PDF 导出准备");
      document.title = safeName;
      window.print();
    } catch {
      app.toast(
        "err",
        t(
          "无法打开打印，请尝试下载 DOCX 或 Markdown",
          "Could not open print dialog; try DOCX or Markdown"
        )
      );
    } finally {
      document.title = previous;
      setBusy(false);
    }
  };

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const pageResumes =
        planRef.current?.source === resume && planRef.current.pages.length > 0
          ? planRef.current.pages.map((p) => p.resume)
          : undefined;
      const pdfBytes = await generatePdf(resume, pageResumes);
      downloadBlob(
        `${safeName}.pdf`,
        new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" })
      );
      capture("PDF 导出准备");
      app.toast("ok", t("已生成并下载 PDF 文件", "PDF downloaded"));
    } catch {
      app.toast(
        "err",
        t(
          "PDF 导出失败，请尝试系统打印或下载 DOCX",
          "PDF export failed; try Print or DOCX"
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const word = async () => {
    setBusy(true);
    try {
      const content = await generateDocx(resume);
      downloadBlob(
        `${safeName}.docx`,
        new Blob([content], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        })
      );
      capture("DOCX 导出准备");
      app.toast("ok", t("已生成可编辑的 Word 文档", "DOCX downloaded"));
    } catch {
      app.toast(
        "err",
        t("Word 导出失败，内容已保留", "DOCX export failed; content preserved")
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} width="max-w-6xl" bare>
      <ModalHeader
        title={t("检查并导出", "Review & Export")}
        onClose={onClose}
      />
      <div className="grid max-h-[64vh] grid-cols-1 overflow-y-auto px-5 pb-4 gap-4 lg:grid-cols-[276px_minmax(0,1fr)]">
        <aside className="soft-panel flex flex-col justify-between gap-4 rounded-[22px] p-4">
          <div>
            <h4 className="mb-3 text-[13px] font-bold text-ink-900">
              {t("投递前检查", "Pre-Flight Check")}
            </h4>
            {issues.length ? (
              <ul className="space-y-2">
                {[...issues]
                  .sort(
                    (a, b) =>
                      Number(b.severity === "warning") -
                      Number(a.severity === "warning")
                  )
                  .map((issue) => (
                    <li
                      key={issue.id}
                      className={`rounded-xl p-2.5 text-[12.5px] leading-relaxed ${
                        issue.severity === "warning"
                          ? "bg-danger-100/80 text-danger-700"
                          : "bg-surface text-ink-600"
                      }`}
                    >
                      <span className="mb-0.5 block text-[11.5px] font-semibold">
                        {issue.severity === "warning"
                          ? t("需要核对", "Needs Review")
                          : t("可选建议", "Suggestion")}
                      </span>
                      <span>{issue.message}</span>
                      <div className="mt-1.5 flex flex-wrap gap-2.5 text-[12px]">
                        {issue.sectionId && (
                          <button
                            type="button"
                            className="font-medium underline underline-offset-2"
                            onClick={() => {
                              onLocate(issue.sectionId!, issue.blockId);
                              onClose();
                            }}
                          >
                            {t("定位修改", "Locate")}
                          </button>
                        )}
                        {issue.severity === "info" && (
                          <button
                            type="button"
                            className="opacity-75 hover:opacity-100"
                            onClick={() => setIgnored((ids) => [...ids, issue.id])}
                          >
                            {t("本次忽略", "Dismiss")}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-ok-bg px-3 py-2.5 text-[12.5px] font-medium text-ok">
                {t(
                  "基础字段完整，可直接导出",
                  "All key fields look good — ready to export"
                )}
              </p>
            )}
          </div>

          <div className="space-y-2.5">
            {ready && (
              <p className="text-[12px] text-ink-500">
                {t(
                  `当前共 ${plan.pages.length} 页${plan.pages.length > 1 ? "，可按需压缩为 1 页" : ""}`,
                  `${plan.pages.length} ${plan.pages.length > 1 ? "pages" : "page"}`
                )}
              </p>
            )}
            {ready && plan.pages.some((p) => p.oversized) && (
              <p role="alert" className="text-[12px] text-danger-700">
                {t(
                  "单个条目超过一页，请拆分后再打印。DOCX / Markdown 仍可下载。",
                  "One entry exceeds a single page. Split it before printing."
                )}
              </p>
            )}
            <Btn
              size="sm"
              className="w-full justify-center"
              disabled={busy}
              onClick={onAdjustLayout}
            >
              {t("智能调整篇幅", "Smart Fit Pages")}
            </Btn>
          </div>
        </aside>

        <div className="min-w-0 overflow-hidden rounded-[22px] bg-subtle/40">
          <ResumePreview
            resume={resume}
            onLayout={(pages) => setPlan({ source: resume, pages })}
          />
        </div>
      </div>

      {/* 无框底部导出栏（液态玻璃输入框 + 统一 .glass-tip 更多格式菜单） */}
      <div className="flex flex-wrap items-center justify-end gap-2.5 px-5 pb-5 pt-1">
        <label className="mr-auto flex min-w-0 flex-1 basis-56 items-center gap-2 text-[12px] text-ink-500">
          <span className="shrink-0 font-medium">{t("文件名", "Filename")}</span>
          <input
            aria-label={t("导出文件名称", "Export filename")}
            className="liquid-input w-full rounded-full px-3.5 py-1.5 text-[13px] text-ink-900 placeholder:text-ink-400"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
        </label>

        <div className="relative" ref={moreRef}>
          <Btn
            variant="ghost"
            size="sm"
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            disabled={busy}
            onClick={() => setMoreOpen((v) => !v)}
          >
            {t("更多格式", "More Formats")}
            <IconChevronDown
              size={13}
              className={`transition-transform duration-150 ${moreOpen ? "rotate-180" : ""}`}
            />
          </Btn>
          {moreOpen && (
            <div
              role="menu"
              aria-label={t("更多导出格式", "More export formats")}
              className="glass-tip absolute bottom-full right-0 z-30 mb-2 flex w-52 flex-col gap-0.5 rounded-2xl p-1.5"
            >
              <button
                type="button"
                role="menuitem"
                disabled={busy || !ready || !!plan?.pages.some((p) => p.oversized)}
                onClick={() => {
                  setMoreOpen(false);
                  void print();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-ink-800 transition-colors hover:bg-subtle disabled:opacity-45"
              >
                <IconPrinter size={14} className="shrink-0 text-ink-500" />
                <span>{t("浏览器高清打印（矢量 PDF）", "Browser Print (Vector PDF)")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMoreOpen(false);
                  downloadText(`${safeName}.md`, resumeMarkdown(resume), "text/markdown");
                  capture("Markdown 导出准备");
                  app.toast("ok", t("已导出 Markdown 文件", "Markdown downloaded"));
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-ink-800 transition-colors hover:bg-subtle disabled:opacity-45"
              >
                <IconDownload size={14} className="shrink-0 text-ink-500" />
                <span>{t("导出 Markdown (.md)", "Export Markdown (.md)")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMoreOpen(false);
                  downloadText(`${safeName}.txt`, resumeText(resume), "text/plain");
                  capture("TXT 导出准备");
                  app.toast("ok", t("已导出纯文本文件", "Plain text downloaded"));
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-ink-800 transition-colors hover:bg-subtle disabled:opacity-45"
              >
                <IconDownload size={14} className="shrink-0 text-ink-500" />
                <span>{t("导出纯文本 (.txt)", "Export Plain Text (.txt)")}</span>
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={busy}
                onClick={() => {
                  setMoreOpen(false);
                  downloadText(
                    `${safeName}.json`,
                    JSON.stringify(createResumeBackup(app, resume.id), null, 2)
                  );
                  capture("JSON 导出准备");
                  app.toast("ok", t("已导出单份 JSON 备份", "JSON backup downloaded"));
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] font-medium text-ink-800 transition-colors hover:bg-subtle disabled:opacity-45"
              >
                <IconDownload size={14} className="shrink-0 text-ink-500" />
                <span>{t("单份备份 (.json)", "Backup JSON (.json)")}</span>
              </button>
            </div>
          )}
        </div>

        <Btn size="sm" disabled={busy} onClick={() => void word()}>
          {t("下载 DOCX", "Download DOCX")}
        </Btn>
        <Btn
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => void downloadPdf()}
        >
          <IconDownload size={14} />
          {busy ? t("正在导出…", "Exporting…") : t("下载 PDF", "Download PDF")}
        </Btn>
      </div>

      {prepared && (
        <div className="mx-5 mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-brand-50/70 px-4 py-2.5 text-[12.5px] text-ink-700">
          <span>
            {t(
              "已自动保存本次导出快照，是否顺手记录一条投递进度？",
              "Export snapshot saved. Want to log an application?"
            )}
          </span>
          <Btn size="sm" variant="primary" onClick={onRecordApplication}>
            {t("记录投递", "Log Application")}
          </Btn>
        </div>
      )}

      {ready &&
        createPortal(
          <div className="print-only">
            {plan.pages.map((page, i) => (
              <div className="resume-print-page" key={i}>
                <A4Sheet resume={page.resume} forPrint />
              </div>
            ))}
          </div>,
          document.body
        )}
    </Modal>
  );
}
