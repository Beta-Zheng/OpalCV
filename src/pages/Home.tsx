import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Resume, ResumeData, SourceKind } from "../types";
import { AUDIENCE_LABELS, TEMPLATES } from "../types";
import {
  ACCEPT_EXTS,
  MAX_FILE_SIZE,
  extractFileText,
  structureResume,
  emptyResume,
  type SupportedExt,
} from "../lib/parser";
import { buildSampleResume, SAMPLE_CATALOG } from "../lib/samples";
import { nowISO, timeAgo, fmtDate } from "../lib/utils";
import { useAppSlice } from "../lib/store";
import {
  groupResumeFamilies,
  completion,
  inspectResume,
  sectionHasContent,
} from "../lib/workflow";
import { Btn, Confirm, GlassSelect, Modal, ModalHeader } from "../components/ui";
import Logo from "../components/logo";
import ImportReview from "../components/import-review";
import { APPLICATION_LABELS, applicationStats, TERMINAL_STATUSES } from "../lib/applications";
import { audienceLabel, templateNameLabel, UI_COPY, useT, useUiLang } from "../lib/i18n";
import ResumeThumbnail from "../components/resume-thumbnail";
import {
  IconArchive,
  IconArrowRight,
  IconChevronDown,
  IconChevronUp,
  IconEdit,
  IconFile,
  IconLayers,
  IconQuickBlank,
  IconQuickImport,
  IconQuickSample,
  IconRefresh,
  IconTarget,
  IconUpload,
} from "../components/icons";

function ResumeKindBadge({
  resume,
  verbose = false,
}: {
  resume: Resume;
  verbose?: boolean;
}) {
  const t = useT();
  if (resume.target) {
    return (
      <span className="chip resume-badge-target inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
        <IconTarget size={11} className="shrink-0" />
        {verbose ? t("岗位版本", "Tailored") : t("岗位", "Job")}
      </span>
    );
  }
  if (resume.copy_source_id) {
    return (
      <span className="chip resume-badge-copy inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
        <IconLayers size={11} className="shrink-0" />
        {verbose ? t("独立副本", "Copy") : t("副本", "Copy")}
      </span>
    );
  }
  return (
    <span className="chip resume-badge-master inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
      <IconFile size={11} className="shrink-0" />
      {verbose ? t("通用简历", "Master") : t("通用", "Master")}
    </span>
  );
}

type CreateTab = "start" | "file" | "paste" | "samples" | "blank";
type SampleLangFilter = "all" | "zh" | "en";

export default function Home() {
  const app = useAppSlice(
    "resumes",
    "jds",
    "suggestions",
    "snapshots",
    "applications",
    "go",
    "createResume",
    "archiveResume",
    "duplicateResume"
  );
  const uiLang = useUiLang();
  const copy = UI_COPY[uiLang];
  const t = useT();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<CreateTab>("start");
  const [audience, setAudience] =
    useState<NonNullable<Resume["audience"]>>("experienced");
  const [locale, setLocale] = useState<"zh" | "en">("zh");
  const [sampleLang, setSampleLang] = useState<SampleLangFilter>("all");
  const [blankTemplate, setBlankTemplate] = useState<string>("modern_single_column");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<{
    data: ResumeData;
    raw: string;
    multiColumn: boolean;
  } | null>(null);
  const [del, setDel] = useState<Resume | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("updated");
  const [showFilters, setShowFilters] = useState(() => app.resumes.length > 5);
  const [view, setView] = useState<'list' | 'cards'>('list');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const ticket = useRef(0);
  const running = useRef(false);
  useEffect(() => {
    const onOpenCreate = () => {
      setOpen(true);
      setTab("start");
      setError("");
      setReview(null);
    };
    window.addEventListener("touchstonecv-open-create", onOpenCreate);
    return () => {
      window.removeEventListener("touchstonecv-open-create", onOpenCreate);
      ticket.current++;
      running.current = false;
    };
  }, []);
  const sorted = app.resumes
    .filter((r) => (filter === "archived" ? !!r.archived_at : !r.archived_at))
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : b.updated_at.localeCompare(a.updated_at)
    );
  const list = sorted.filter(
    (r) =>
      (filter === "all" ||
        filter === "archived" ||
        (filter === "master" ? !r.target : !!r.target)) &&
      [
        r.title,
        r.data.basic_info.name,
        r.data.basic_info.title,
        r.target?.company ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase())
  );
  const latest = app.resumes
    .filter((r) => !r.archived_at)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
  const due = app.applications.filter(a => a.follow_up_at && a.follow_up_at <= fmtDate(nowISO()) && !TERMINAL_STATUSES.includes(a.status));
  const pending = app.suggestions.filter(s => s.status === 'success' && !s.resolution && app.resumes.some(r => r.id === s.resume_id && !r.archived_at));
  const pendingResumes = app.resumes.filter(r => pending.some(s => s.resume_id === r.id));
  const families = groupResumeFamilies(list, app.resumes);

  const openCreate = (next: CreateTab = "start") => {
    setOpen(true);
    setTab(next);
    setError("");
    setReview(null);
  };
  const close = () => {
    ticket.current++;
    running.current = false;
    setBusy(false);
    setOpen(false);
    setReview(null);
    setError("");
  };
  const create = (
    data: ResumeData,
    title?: string,
    overrideLocale?: "zh" | "en",
    templateId?: string
  ) => {
    const id = app.createResume(data, title, {
      audience,
      locale: overrideLocale ?? locale,
      ...(templateId ? { template_id: templateId } : {}),
    });
    close();
    app.go({ name: "editor", resumeId: id });
  };
  const structure = (
    raw: string,
    source: SourceKind,
    sourceName?: string,
    multiColumn = false
  ) => {
    if (!raw.trim()) throw new Error("简历内容不能为空");
    if (raw.length > 100_000)
      throw new Error("文本过长，请精简至 10 万字符以内后再导入");
    const data = structureResume(raw, source, sourceName);
    if (
      !data.sections.some(sectionHasContent) &&
      !(data.basic_info.name || data.basic_info.email || data.basic_info.phone)
    )
      throw new Error(
        "未识别到简历内容，可从空白简历开始。原文仍保留在输入框中。"
      );
    data.metadata.source_text = raw;
    setReview({ data, raw, multiColumn });
  };
  const handleFile = async (file: File) => {
    if (running.current) return;
    running.current = true;
    const id = ++ticket.current;
    setBusy(true);
    setError("");
    try {
      const ext = (
        file.name.split(".").pop() ?? ""
      ).toLowerCase() as SupportedExt;
      if (!ACCEPT_EXTS.includes(ext))
        throw new Error("仅支持 PDF、DOCX、MD、TXT 文件");
      if (file.size > MAX_FILE_SIZE)
        throw new Error("请使用不超过 10 MB 的文件");
      const result = await extractFileText(file, ext);
      if (id !== ticket.current) return;
      if (!result.ok || !result.text)
        throw new Error(result.error || "未提取到文本，请尝试粘贴原文");
      setPaste(result.text);
      structure(result.text, "file", file.name, !!result.maybeMultiColumn);
    } catch (e) {
      if (id === ticket.current)
        setError(e instanceof Error ? e.message : "解析失败");
    } finally {
      if (id === ticket.current) {
        setBusy(false);
        running.current = false;
      }
    }
  };
  return (
    <div
      className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-16 pt-7 sm:px-6"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (busy || review) return;
        const f = e.dataTransfer.files[0];
        if (f) {
          openCreate("file");
          void handleFile(f);
        }
      }}
    >
      {dragging && (
        <div
          aria-live="polite"
          className="border-flow pointer-events-none fixed inset-4 z-40 flex flex-col items-center justify-center rounded-2xl border-2 text-center shadow-2xl"
        >
          <IconUpload size={32} className="text-brand-600" />
          <p className="mt-2 text-[16px] font-semibold text-brand-800">
            {t("松开以导入简历文件", "Drop file to import resume")}
          </p>
          <p className="mt-1 text-[12px] text-brand-700">
            {t("支持 PDF、DOCX、MD、TXT（≤ 10 MB），导入后先校对再创建", "Supports PDF, DOCX, MD, TXT (≤ 10 MB). Review parsed fields before creating.")}
          </p>
        </div>
      )}
      <header className="flex flex-wrap items-center justify-between gap-4 pb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">
            {copy.homeTitle}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="liquid-input flex items-center gap-2 rounded-full px-3.5 py-2">
            <input
              aria-label="搜索简历"
              className="w-40 bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-ink-400 sm:w-52"
              placeholder={uiLang === "en" ? "Search name, company, role…" : "搜索姓名、公司或职位…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
                className="text-[11px] text-ink-400 hover:text-ink-900"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 无框粉彩快捷入口（液态玻璃双层叠影图标 + 标题，无多余白底框） */}
      <section aria-label="快速开始" className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {[
          {
            icon: <IconQuickImport size={34} className="drop-shadow-[0_4px_10px_rgba(244,63,94,0.16)]" />,
            title: copy.importResume,
            bg: "pastel-rose",
            tab: "file" as const,
          },
          {
            icon: <IconQuickSample size={34} className="drop-shadow-[0_4px_10px_rgba(99,102,241,0.18)]" />,
            title: copy.samples,
            bg: "pastel-violet",
            tab: "samples" as const,
          },
          {
            icon: <IconQuickBlank size={34} className="drop-shadow-[0_4px_10px_rgba(245,158,11,0.16)]" />,
            title: copy.startBlank,
            bg: "pastel-amber",
            tab: "start" as const,
          },
        ].map(({ icon, title, bg, tab: nextTab }) => (
          <button
            key={title}
            type="button"
            onClick={() => openCreate(nextTab)}
            className={`group flex h-[68px] min-w-0 items-center gap-3.5 rounded-[22px] px-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${bg}`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center transition-transform duration-200 group-hover:scale-105">
              {icon}
            </span>
            <span className="truncate text-[15px] font-semibold leading-5 text-ink-900">
              {title}
            </span>
          </button>
        ))}
      </section>

      {latest && !query && filter === "all" && (
        <section
          aria-label="继续创作"
          className="soft-panel group grid overflow-hidden rounded-[26px] transition-transform duration-200 hover:-translate-y-0.5 sm:grid-cols-[200px_minmax(0,1fr)]"
        >
          <button
            type="button"
            aria-label={`继续编辑：${latest.title}`}
            onClick={() => app.go({ name: "editor", resumeId: latest.id })}
            className="text-left"
          >
            <ResumeThumbnail
              resume={latest}
              className="h-44 rounded-none border-0 sm:h-full"
            />
          </button>
          <div className="flex min-w-0 flex-col justify-between gap-4 p-5 sm:p-6">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip rounded-full bg-brand-50 px-2.5 text-brand-700">
                  <span className="sp-dot" aria-hidden="true" />
                  {t("最近编辑", "Recently Edited")}
                </span>
                <ResumeKindBadge resume={latest} verbose />
                <span className="text-[12px] text-ink-400">
                  {timeAgo(latest.updated_at)}
                </span>
              </div>
              <h2 className="mt-2 truncate text-[19px] font-bold tracking-tight text-ink-900">
                {latest.title}
              </h2>
              <p className="mt-1 truncate text-[13px] text-ink-500">
                {latest.target
                  ? `${latest.target.company} · ${latest.target.job_title}`
                  : latest.data.basic_info.title || t("目标职位待填写", "Target role pending")}
                {" · "}
                {templateNameLabel(
                  latest.template_id,
                  TEMPLATES.find((tp) => tp.template_id === latest.template_id)?.name ?? "现代单栏",
                  uiLang
                )}
              </p>
              <div className="mt-3 max-w-sm">
                <div className="mb-1 flex items-center justify-between text-[12px] text-ink-500">
                  <span>{t("完整度", "Completeness")}</span>
                  <span className="font-mono font-medium text-ink-700">{completion(latest)}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-ink-200/50">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${completion(latest)}%`,
                      backgroundImage: "linear-gradient(90deg, #38BDF8, #6366F1, #C084FC)",
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                title={t("继续编辑", "Continue editing")}
                aria-label={`${t("继续编辑", "Continue editing")}: ${latest.title}`}
                onClick={() => app.go({ name: "editor", resumeId: latest.id })}
                className="tool-btn h-9 w-9 rounded-full bg-surface text-brand-600 shadow-xs hover:bg-brand-50 hover:text-brand-700"
              >
                <IconEdit size={15} />
              </button>
              <button
                type="button"
                title={t("复制副本", "Duplicate")}
                aria-label={`${t("复制副本", "Duplicate")}: ${latest.title}`}
                onClick={() => {
                  const id = app.duplicateResume(latest.id);
                  if (id) app.go({ name: "editor", resumeId: id });
                }}
                className="tool-btn h-9 w-9 rounded-full bg-surface text-ink-600 shadow-xs hover:bg-paper-200 hover:text-ink-900"
              >
                <IconLayers size={15} />
              </button>
            </div>
          </div>
        </section>
      )}
      {(due.length > 0 || pending.length > 0) && (
        <PendingTicker
          items={[
            ...due.map((a) => ({
              id: `due-${a.id}`,
              kind: "due" as const,
              text: t(
                `${a.company} · ${a.role} · 投递待跟进`,
                `${a.company} · ${a.role} · Follow-up due`
              ),
              badge: t("跟进", "Follow-up"),
              onClick: () => app.go({ name: "applications", dueOnly: true }),
            })),
            ...pendingResumes.map((r) => {
              const count = pending.filter((s) => s.resume_id === r.id).length;
              return {
                id: `ai-${r.id}`,
                kind: "ai" as const,
                text: t(
                  `${r.title} · ${count} 条 AI 建议待确认`,
                  `${r.title} · ${count} AI suggestion${count > 1 ? "s" : ""} pending`
                ),
                badge: t("AI 建议", "AI Polish"),
                onClick: () => app.go({ name: "editor", resumeId: r.id, panel: "ai" }),
              };
            }),
          ]}
        />
      )}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold tracking-tight text-ink-900">
            {copy.myResumes}
            {list.length > 0 && (
              <span className="ml-1.5 font-mono text-[12.5px] font-normal text-ink-400">
                {list.length}
              </span>
            )}
          </h2>
          {app.resumes.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {showFilters && (
                <>
                  <GlassSelect
                    ariaLabel={t("简历类型", "Resume type")}
                    className="w-32"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "all", label: t("全部版本", "All Resumes") },
                      { value: "master", label: t("通用简历", "Master") },
                      { value: "target", label: t("岗位版本", "Tailored") },
                      { value: "archived", label: t("已归档", "Archived") },
                    ]}
                  />
                  <GlassSelect
                    ariaLabel={t("排序简历", "Sort resumes")}
                    className="w-32"
                    value={sort}
                    onChange={setSort}
                    options={[
                      { value: "updated", label: t("最近更新", "Recently Updated") },
                      { value: "title", label: t("名称排序", "By Name") },
                    ]}
                  />
                </>
              )}
              <div
                className="liquid-glass relative flex items-center gap-0.5 rounded-full p-1"
                role="group"
                aria-label="视图与筛选"
              >
                <button
                  type="button"
                  title="列表视图"
                  aria-label="列表视图"
                  aria-pressed={view === "list"}
                  onClick={() => setView("list")}
                  className={`flex h-7 w-8 items-center justify-center rounded-full transition-all ${
                    view === "list"
                      ? "glass-lens"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="卡片视图"
                  aria-label="卡片视图"
                  aria-pressed={view === "cards"}
                  onClick={() => setView("cards")}
                  className={`flex h-7 w-8 items-center justify-center rounded-full transition-all ${
                    view === "cards"
                      ? "glass-lens"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="3" width="7" height="7" rx="1.5" />
                    <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    <rect x="3" y="14" width="7" height="7" rx="1.5" />
                  </svg>
                </button>
                <button
                  type="button"
                  title="筛选与排序"
                  aria-label="筛选与排序"
                  aria-expanded={showFilters}
                  onClick={() => setShowFilters((v) => !v)}
                  className={`relative flex h-7 w-8 items-center justify-center rounded-full transition-all ${
                    showFilters || filter !== "all"
                      ? "glass-lens"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M3 6h18M7 12h10M10 18h4" />
                  </svg>
                  {(query || filter !== "all") && (
                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-600" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
        {!list.length ? (
          <div className="soft-panel rounded-[26px] px-6 py-14 text-center">
            {!app.resumes.length && !query && filter === "all" ? (
              <EmptyTypewriter />
            ) : (
              <>
                <IconFile size={28} className="mx-auto text-ink-400" />
                <p className="mt-3 text-[15px] font-semibold text-ink-800">
                  {query || filter !== "all"
                    ? t("没有符合条件的简历", "No matching resumes")
                    : t("暂无在用简历", "No active resumes")}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  {query || filter !== "all" ? (
                    <Btn size="sm" onClick={() => { setQuery(""); setFilter("all"); }}>
                      {t("清除筛选", "Clear Filters")}
                    </Btn>
                  ) : (
                    <>
                      <Btn size="sm" onClick={() => { setFilter("archived"); setShowFilters(true); }}>
                        {t("查看已归档", "View Archived")}
                      </Btn>
                      <Btn size="sm" variant="primary" onClick={() => openCreate()}>
                        {t("新建简历", "New Resume")}
                      </Btn>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
          {families.map(family => <section key={family.id} aria-label={`简历组：${family.title}`}>
          {families.length > 1 && family.resumes.length > 1 && (
            <h3 className="mb-2 text-[12px] font-medium text-ink-400">
              {family.title} · {family.resumes.length}
            </h3>
          )}
          <ul className={view === 'list' ? 'divide-y divide-line/50 overflow-hidden rounded-[22px] soft-panel' : 'grid gap-4 md:grid-cols-2 xl:grid-cols-3'}>
            {family.resumes.map((r) => {
              const problems = inspectResume(r).filter(
                (i) => i.severity === "warning"
              );
              const appCount = app.applications.filter(
                (a) => a.resume_id === r.id
              ).length;
              const subRole = r.target
                ? `${r.target.company} · ${r.target.job_title}`
                : r.data.basic_info.title;
              const showRole = !!subRole && subRole !== r.title;
              return (
                <li
                  key={r.id}
                  className={
                    view === "list"
                      ? "group flex min-w-0 items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-surface/70"
                      : "soft-panel group flex min-w-0 flex-col overflow-hidden rounded-[22px] transition-transform duration-200 hover:-translate-y-0.5"
                  }
                >
                  <button
                    type="button"
                    className={
                      view === "list"
                        ? "flex min-w-0 flex-1 items-center gap-3.5 text-left"
                        : "w-full min-w-0 text-left"
                    }
                    aria-label={`打开简历：${r.title}`}
                    onClick={() => app.go({ name: "editor", resumeId: r.id })}
                  >
                    {view === "cards" ? (
                      <ResumeThumbnail resume={r} />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-8 shrink-0 flex-col justify-center gap-1 rounded-lg bg-surface px-1.5 shadow-xs"
                      >
                        <span className="h-1 w-3.5 rounded-full bg-ink-800/70" />
                        <span className="h-0.5 w-full rounded-full bg-brand-500/60" />
                        <span className="h-0.5 w-4/5 rounded-full bg-ink-300/60" />
                      </span>
                    )}
                    <div className={view === "cards" ? "px-4 pt-3.5" : "min-w-0 flex-1"}>
                      <div className="flex items-center gap-2">
                        <p
                          title={r.title}
                          className="truncate text-[15px] font-semibold text-ink-900"
                        >
                          {r.title}
                        </p>
                        <ResumeKindBadge resume={r} />
                        {r.archived_at && (
                          <span className="chip resume-badge-archived inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium">
                            <IconArchive size={11} className="shrink-0" />
                            {t("归档", "Archived")}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[12px] text-ink-400">
                        {showRole ? `${subRole} · ` : ""}
                        {timeAgo(r.updated_at)}
                      </p>
                    </div>
                  </button>

                  <div
                    className={
                      view === "list"
                        ? "flex shrink-0 items-center gap-3"
                        : "mx-4 mb-3.5 mt-3 flex items-center justify-between"
                    }
                  >
                    {/* 仅非零态显示的极简微指标（颜色圆点 / 图标 + 纯数字） */}
                    <div className="flex items-center gap-2.5 text-[12px] font-mono text-ink-500">
                      {problems.length > 0 && (
                        <span
                          title={t(`${problems.length} 项待核对`, `${problems.length} to review`)}
                          className="inline-flex items-center gap-1 text-seal-600"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-seal-500" />
                          {problems.length}
                        </span>
                      )}
                      {appCount > 0 && (
                        <span
                          title={t(`${appCount} 条投递记录`, `${appCount} applications`)}
                          className="inline-flex items-center gap-1 text-brand-600"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m22 2-7 20-4-9-9-4Z" />
                            <path d="M22 2 11 13" />
                          </svg>
                          {appCount}
                        </span>
                      )}
                    </div>

                    {/* 右侧操作图标：平时轻退，悬停清晰浮现 */}
                    <div className="flex items-center gap-1 opacity-75 transition-opacity sm:opacity-35 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button
                        type="button"
                        className="tool-btn h-8 w-8 rounded-full bg-surface text-brand-600 hover:bg-brand-50 hover:text-brand-700"
                        title={r.id === latest?.id ? t("继续编辑", "Continue editing") : t("编辑简历", "Edit resume")}
                        aria-label={`${t("编辑简历", "Edit resume")} ${r.title}`}
                        onClick={() => app.go({ name: "editor", resumeId: r.id })}
                      >
                        <IconEdit size={14} />
                      </button>
                      <button
                        type="button"
                        className="tool-btn h-8 w-8 rounded-full text-ink-500 hover:bg-surface hover:text-ink-900"
                        title={t("复制副本", "Duplicate")}
                        aria-label={`${t("复制简历", "Duplicate")} ${r.title}`}
                        onClick={() => app.duplicateResume(r.id)}
                      >
                        <IconLayers size={14} />
                      </button>
                      <button
                        type="button"
                        className="tool-btn h-8 w-8 rounded-full text-ink-500 hover:bg-surface hover:text-ink-900"
                        title={r.archived_at ? t("恢复", "Restore") : t("归档", "Archive")}
                        aria-label={`${
                          r.archived_at ? t("取消归档", "Restore") : t("归档简历", "Archive")
                        } ${r.title}`}
                        onClick={() =>
                          r.archived_at
                            ? app.archiveResume(r.id, false)
                            : setDel(r)
                        }
                      >
                        {r.archived_at ? (
                          <IconRefresh size={14} />
                        ) : (
                          <IconArchive size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          </section>)}
          </div>
        )}
      </section>

      {/* 工作台底部：面试跟进与投递进度图表模块 */}
      <InterviewProgressSection
        applications={app.applications}
        today={fmtDate(nowISO())}
        uiLang={uiLang}
        onOpenApplications={(dueOnly) => app.go({ name: "applications", dueOnly })}
      />

      <Modal
        open={open}
        onClose={close}
        width={review ? "max-w-5xl" : "max-w-xl"}
      >
        <ModalHeader
          title={
            review
              ? t("核对解析结果", "Review Parsed Fields")
              : tab === "samples"
                ? t("精品示例", "Curated Samples")
                : tab === "file" || tab === "paste"
                  ? t("导入简历", "Import Resume")
                  : t("创建简历", "New Resume")
          }
          sub={
            review
              ? t("确认字段后再创建；可以返回原文重新解析", "Confirm extracted fields before creating")
              : undefined
          }
          onClose={close}
        />
        <div className="px-5 pb-5">
          {review ? (
            <ImportReview
              data={review.data}
              sourceText={review.raw}
              multiColumn={review.multiColumn}
              onChange={(data) => setReview({ ...review, data })}
              onBack={() => {
                setReview(null);
                setTab("paste");
              }}
              onConfirm={() =>
                create(
                  {
                    ...review.data,
                    metadata: {
                      ...review.data.metadata,
                      reviewed_at: nowISO(),
                    },
                  },
                  review.data.basic_info.name || t("导入简历", "Imported Resume")
                )
              }
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
                <div
                  className="liquid-glass inline-flex items-center gap-0.5 rounded-full p-1"
                  role="radiogroup"
                  aria-label={t("求职场景", "Career stage")}
                >
                  {(["experienced", "student", "internship"] as const).map((id) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={audience === id}
                      onClick={() => setAudience(id)}
                      className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-all ${
                        audience === id
                          ? "glass-lens text-ink-900"
                          : "text-ink-500 hover:text-ink-900"
                      }`}
                    >
                      {audienceLabel(id, AUDIENCE_LABELS[id], uiLang)}
                    </button>
                  ))}
                </div>
                {(tab === "file" || tab === "paste") && (
                  <div
                    className="liquid-glass inline-flex items-center gap-0.5 rounded-full p-1"
                    role="tablist"
                    aria-label={t("导入方式", "Import method")}
                  >
                    {(
                      [
                        ["file", t("上传文件", "Upload File")],
                        ["paste", t("粘贴文本", "Paste Text")],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        onClick={() => setTab(id)}
                        className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-all ${
                          tab === id
                            ? "glass-lens text-ink-900"
                            : "text-ink-500 hover:text-ink-900"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {tab === "samples" && (
                  <div
                    className="liquid-glass inline-flex items-center gap-0.5 rounded-full p-1"
                    role="radiogroup"
                    aria-label={t("示例语言", "Sample language")}
                  >
                    {(
                      [
                        ["all", t("全部", "All")],
                        ["zh", "中文"],
                        ["en", "EN"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={sampleLang === id}
                        onClick={() => setSampleLang(id)}
                        className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-all ${
                          sampleLang === id
                            ? "glass-lens text-ink-900"
                            : "text-ink-500 hover:text-ink-900"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                {tab === "start" && (
                  <div
                    className="liquid-glass inline-flex items-center gap-0.5 rounded-full p-1"
                    role="radiogroup"
                    aria-label={t("版式语言", "Resume language")}
                  >
                    {(
                      [
                        ["zh", "中文"],
                        ["en", "EN"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={locale === id}
                        onClick={() => setLocale(id)}
                        className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-all ${
                          locale === id
                            ? "glass-lens text-ink-900"
                            : "text-ink-500 hover:text-ink-900"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {tab === "start" && (
                <div className="grid grid-cols-2 gap-3">
                  {(
                    [
                      ["file", t("上传已有简历", "Upload Resume"), "PDF / DOCX / MD / TXT", "pastel-rose"],
                      ["paste", t("粘贴文本", "Paste Text"), t("复制已有简历全文", "Paste plain resume text"), "pastel-indigo"],
                      ["samples", t("从示例开始", "Start from Sample"), t("按场景和岗位选择", "Pick by role & stage"), "pastel-violet"],
                    ] as const
                  ).map(([id, label, desc, bg]) => (
                    <button
                      key={id}
                      className={`${bg} rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5`}
                      onClick={() => setTab(id)}
                    >
                      <p className="text-[14px] font-bold text-ink-900">{label}</p>
                      <p className="mt-1 text-[12px] text-ink-500">{desc}</p>
                    </button>
                  ))}
                  <button
                    className="pastel-amber rounded-2xl p-4 text-left transition-transform hover:-translate-y-0.5"
                    onClick={() => setTab("blank")}
                  >
                    <p className="text-[14px] font-bold text-ink-900">{t("空白简历", "Blank Resume")}</p>
                    <p className="mt-1 text-[12px] text-ink-500">
                      {t("选模板后从零填写经历", "Pick a template and start fresh")}
                    </p>
                  </button>
                </div>
              )}
              {tab === "blank" && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-medium text-ink-700">
                      {t("选择空白简历的初始模板", "Choose a starting template")}
                    </p>
                    <Btn
                      variant="primary"
                      size="sm"
                      className="cta-ai rounded-full px-4"
                      onClick={() =>
                        create(
                          emptyResume(),
                          t("未命名简历", "Untitled Resume"),
                          locale,
                          blankTemplate
                        )
                      }
                    >
                      {t("使用所选模板创建", "Create Resume")}
                    </Btn>
                  </div>
                  <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">
                    {TEMPLATES.map((tpl) => {
                      const selected = blankTemplate === tpl.template_id;
                      const sampleData = buildSampleResume(
                        SAMPLE_CATALOG.find((s) => s.locale === locale)?.id ?? SAMPLE_CATALOG[0].id,
                        audience
                      );
                      const previewResume: Resume = {
                        id: "preview",
                        title: templateNameLabel(tpl.template_id, tpl.name, uiLang),
                        data: sampleData,
                        template_id: tpl.template_id,
                        theme: { primary_color: "#4F46E5", font_size: 14, font_family: "sans", density: "medium" },
                        created_at: "",
                        updated_at: "",
                        locale,
                        audience,
                      };
                      const localeTag =
                        tpl.recommendedLocale === "en"
                          ? { label: "EN", cls: "bg-brand-50 text-brand-700" }
                          : tpl.recommendedLocale === "both"
                          ? { label: t("中/EN", "ZH/EN"), cls: "bg-subtle text-ink-600" }
                          : { label: "中文", cls: "bg-rose-500/12 text-rose-600" };
                      return (
                        <button
                          key={tpl.template_id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setBlankTemplate(tpl.template_id)}
                          onDoubleClick={() =>
                            create(
                              emptyResume(),
                              t("未命名简历", "Untitled Resume"),
                              locale,
                              tpl.template_id
                            )
                          }
                          className={`group flex flex-col overflow-hidden rounded-2xl text-left transition-all hover:-translate-y-0.5 ${
                            selected ? "soft-panel ring-2 ring-brand-500/75" : "soft-panel hover:shadow-md"
                          }`}
                        >
                          <ResumeThumbnail resume={previewResume} />
                          <div className="flex items-center justify-between gap-1.5 p-2.5">
                            <span className="truncate text-[12.5px] font-semibold text-ink-900">
                              {templateNameLabel(tpl.template_id, tpl.name, uiLang)}
                            </span>
                            <span className={`chip shrink-0 rounded-full px-1.5 py-0 text-[10px] font-semibold ${localeTag.cls}`}>
                              {localeTag.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {tab === "file" && (
                <button
                  disabled={busy}
                  className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-line p-8 hover:border-brand-300 disabled:opacity-50"
                  onClick={() => fileRef.current?.click()}
                >
                  <IconUpload size={26} />
                  <p className="mt-2 text-[13px]">{t("选择文件，或拖拽到页面", "Choose a file or drop it here")}</p>
                  <p className="mt-1 text-[12px] text-ink-400">
                    {t("单个文件 ≤ 10 MB", "Max 10 MB per file")}
                  </p>
                </button>
              )}
              <input
                ref={fileRef}
                aria-label={t("上传简历文件", "Upload resume file")}
                type="file"
                className="hidden"
                accept=".pdf,.docx,.md,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              {tab === "paste" && (
                <>
                  <textarea
                    className="field-input"
                    rows={10}
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                    placeholder={t("粘贴姓名、联系方式、工作或项目经历、教育及技能…", "Paste name, contact info, experience, projects, education, and skills…")}
                  />
                  <div className="mt-3 flex justify-end">
                    <Btn
                      variant="primary"
                      disabled={!paste.trim() || busy}
                      onClick={() => {
                        setError("");
                        try {
                          structure(paste, "pasted_text");
                        } catch (e) {
                          setError(e instanceof Error ? e.message : t("解析失败", "Parse failed"));
                        }
                      }}
                    >
                      {t("解析并核对", "Parse & Review")}
                    </Btn>
                  </div>
                </>
              )}
              {tab === "samples" && (
                <div className="flex max-h-[380px] flex-col gap-2.5 overflow-y-auto pr-0.5">
                  {SAMPLE_CATALOG.filter(
                    (item) => sampleLang === "all" || item.locale === sampleLang
                  ).map((item) => {
                    const displayTitle =
                      uiLang === "en" ? item.titleEn : item.titleZh;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="soft-panel group flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-left transition-all hover:-translate-y-0.5 hover:bg-surface hover:shadow-sm"
                        onClick={() => {
                          const data = buildSampleResume(item.id, audience);
                          create(
                            data,
                            `${item.locale === "en" ? item.titleEn : item.titleZh} · ${audienceLabel(
                              audience,
                              AUDIENCE_LABELS[audience],
                              item.locale
                            )}`,
                            item.locale
                          );
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-[14px] font-semibold text-ink-900">
                              {displayTitle}
                            </p>
                            <span
                              className={`chip shrink-0 rounded-full px-2 py-0 text-[10.5px] font-semibold ${
                                item.locale === "en"
                                  ? "bg-brand-50 text-brand-700"
                                  : "bg-rose-500/12 text-rose-600"
                              }`}
                            >
                              {item.locale === "en" ? "EN" : "中文"}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-[12px] text-ink-500">
                            {item.companies.join(" · ")} ·{" "}
                            {audienceLabel(
                              audience,
                              AUDIENCE_LABELS[audience],
                              uiLang
                            )}
                          </p>
                        </div>
                        <IconArrowRight
                          size={15}
                          className="shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
                        />
                      </button>
                    );
                  })}
                </div>
              )}
              {busy && (
                <p role="status" className="mt-3 text-[12px] text-brand-700">
                  {t("正在提取并解析文件…", "Extracting & parsing file…")}
                </p>
              )}
              {error && (
                <div
                  role="alert"
                  className="mt-3 rounded-xl bg-danger-100 p-3 text-[12px] text-danger-700"
                >
                  <p>{error}</p>
                  <Btn
                    variant="ghost"
                    onClick={() => {
                      setTab("paste");
                      setError("");
                    }}
                  >
                    {t("改用粘贴文本", "Paste text instead")}
                  </Btn>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
      <Confirm
        open={!!del}
        title={t(`归档「${del?.title}」？`, `Archive "${del?.title}"?`)}
        desc={t(
          "从日常列表隐藏，简历、岗位关联、快照和投递记录均保留。可在已归档列表恢复。",
          "Hides from the main list while keeping all snapshots, JDs, and applications. You can restore it anytime from Archived."
        )}
        confirmText={t("归档", "Archive")}
        onConfirm={() => {
          if (del) app.archiveResume(del.id, true);
          setDel(null);
        }}
        onCancel={() => setDel(null)}
      />
    </div>
  );
}

function PendingTicker({
  items,
}: {
  items: Array<{
    id: string;
    kind: "due" | "ai";
    text: string;
    badge: string;
    onClick: () => void;
  }>;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const safeIndex = items.length ? index % items.length : 0;
  const current = items[safeIndex];

  useEffect(() => {
    if (items.length <= 1 || paused) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % items.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [items.length, paused]);

  if (!current) return null;

  const step = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + items.length) % items.length);
  };

  return (
    <section
      aria-label={t("待办事项", "Pending actions")}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pastel-aurora flex items-center gap-3 rounded-full px-4 py-2"
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-[12.5px] font-semibold text-ink-700">
          {t("待处理", "Action Needed")}
        </span>
        <span className="chip rounded-full bg-surface/90 px-1.5 py-0 font-mono text-[11px] font-semibold text-brand-700">
          {items.length}
        </span>
      </div>

      <div className="relative h-7 min-w-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.button
            key={current.id}
            type="button"
            initial={{ y: 14, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -14, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            onClick={current.onClick}
            className="group flex h-7 w-full items-center gap-2 rounded-full px-2 text-left transition-colors hover:bg-surface/65"
          >
            <span
              className={`chip shrink-0 rounded-full px-2 py-0 text-[10.5px] font-medium ${
                current.kind === "due"
                  ? "resume-badge-copy"
                  : "resume-badge-target"
              }`}
            >
              {current.kind === "ai" && <span className="sp-dot" aria-hidden="true" />}
              {current.badge}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-800 group-hover:text-brand-700">
              {current.text}
            </span>
            <IconArrowRight
              size={13}
              className="shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600"
            />
          </motion.button>
        </AnimatePresence>
      </div>

      {items.length > 1 && (
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden font-mono text-[11px] text-ink-400 sm:inline">
            {safeIndex + 1}/{items.length}
          </span>
          <button
            type="button"
            aria-label={t("上一条待办", "Previous item")}
            onClick={() => step(-1)}
            className="tool-btn h-6 w-6 rounded-full hover:bg-surface/80"
          >
            <IconChevronUp size={12} />
          </button>
          <button
            type="button"
            aria-label={t("下一条待办", "Next item")}
            onClick={() => step(1)}
            className="tool-btn h-6 w-6 rounded-full hover:bg-surface/80"
          >
            <IconChevronDown size={12} />
          </button>
        </div>
      )}
    </section>
  );
}

function EmptyTypewriter() {
  const uiLang = useUiLang();
  const lines = UI_COPY[uiLang].emptyLines;
  const [lineIndex, setLineIndex] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setLineIndex(0);
    setCharCount(0);
    setDeleting(false);
  }, [uiLang]);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const current = lines[lineIndex % lines.length];

    if (reduced) {
      setCharCount(current.length);
      const timer = window.setTimeout(() => {
        setLineIndex((i) => (i + 1) % lines.length);
      }, 3600);
      return () => window.clearTimeout(timer);
    }

    let delay = deleting ? 42 : 95;
    if (!deleting && charCount === current.length) {
      delay = 2200;
    } else if (deleting && charCount === 0) {
      delay = 360;
    }

    const timer = window.setTimeout(() => {
      if (!deleting) {
        if (charCount < current.length) {
          setCharCount((c) => c + 1);
        } else {
          setDeleting(true);
        }
      } else if (charCount > 0) {
        setCharCount((c) => c - 1);
      } else {
        setDeleting(false);
        setLineIndex((i) => (i + 1) % lines.length);
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [lineIndex, charCount, deleting, lines]);

  const text = lines[lineIndex % lines.length].slice(0, charCount);

  return (
    <div className="inline-flex max-w-full items-center justify-center gap-3.5">
      <Logo size={42} motion="lively" className="shrink-0" />
      <p
        aria-live="polite"
        className="liquid-glass min-h-[44px] w-[264px] rounded-[20px] rounded-tl-[6px] px-4 py-2.5 text-left text-[15px] font-medium leading-6 tracking-tight sm:w-[312px] sm:text-[15.5px]"
      >
        <span className="opal-typewriter-text">{text}</span>
        <span aria-hidden="true" className="opal-caret" />
      </p>
    </div>
  );
}

const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const EN_APP_LABELS: Record<import("../types").ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

const APP_STATUS_STYLE: Record<
  import("../types").ApplicationStatus,
  { dot: string; badge: string }
> = {
  saved: { dot: "bg-slate-400", badge: "bg-slate-500/10 text-ink-600" },
  applied: { dot: "bg-sky-500", badge: "bg-sky-500/12 text-sky-600" },
  interview: { dot: "bg-indigo-500", badge: "bg-indigo-500/12 text-indigo-600" },
  offer: { dot: "bg-emerald-500", badge: "bg-emerald-500/12 text-emerald-600" },
  rejected: { dot: "bg-rose-400", badge: "bg-rose-500/10 text-rose-600" },
  withdrawn: { dot: "bg-slate-400", badge: "bg-slate-500/10 text-ink-500" },
  closed: { dot: "bg-slate-400", badge: "bg-slate-500/10 text-ink-500" },
};

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmdLocal(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

function InterviewProgressSection({
  applications,
  today,
  uiLang,
  onOpenApplications,
}: {
  applications: import("../types").Application[];
  today: string;
  uiLang: "zh" | "en";
  onOpenApplications: (dueOnly?: boolean) => void;
}) {
  const stats = applicationStats(applications, today);
  const total = applications.length;

  // 统计每日求职活跃度（投递日期 + 每次状态/反馈事件日期）
  const dayCounts = new Map<string, number>();
  for (const app of applications) {
    if (app.applied_at) {
      const k = app.applied_at.slice(0, 10);
      dayCounts.set(k, (dayCounts.get(k) || 0) + 1);
    }
    for (const ev of app.events || []) {
      const k = fmtDate(ev.at);
      if (k) dayCounts.set(k, (dayCounts.get(k) || 0) + 1);
    }
  }

  // 生成近 24 周（约半年，固定 11px 精致小格，周一至周日）热力图网格
  const WEEKS = 24;
  const todayDate = parseYmdLocal(today);
  const dow = (todayDate.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
  const startMonday = new Date(todayDate);
  startMonday.setDate(todayDate.getDate() - dow - (WEEKS - 1) * 7);

  type HeatCell = {
    ymd: string;
    count: number;
    level: 0 | 1 | 2 | 3 | 4;
    isFuture: boolean;
    isToday: boolean;
  };
  const columns: HeatCell[][] = [];
  const monthMarkers: (string | null)[] = [];
  let activeDays = 0;
  let totalActions = 0;
  let prevMonth = -1;
  let lastLabelCol = -4;

  for (let w = 0; w < WEEKS; w++) {
    const col: HeatCell[] = [];
    let colMonthLabel: string | null = null;
    for (let r = 0; r < 7; r++) {
      const cur = new Date(startMonday);
      cur.setDate(startMonday.getDate() + w * 7 + r);
      const ymd = toLocalYmd(cur);
      const isFuture = ymd > today;
      const isToday = ymd === today;
      const count = isFuture ? 0 : (dayCounts.get(ymd) || 0);
      if (!isFuture && count > 0) {
        activeDays += 1;
        totalActions += count;
      }
      const level: 0 | 1 | 2 | 3 | 4 =
        count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
      if (r === 0) {
        const m = cur.getMonth();
        if (m !== prevMonth) {
          if (w - lastLabelCol >= 3) {
            colMonthLabel = uiLang === "en" ? EN_MONTHS[m] : `${m + 1}月`;
            lastLabelCol = w;
          }
          prevMonth = m;
        }
      }
      col.push({ ymd, count, level, isFuture, isToday });
    }
    columns.push(col);
    monthMarkers.push(colMonthLabel);
  }

  // 挑出最需要关注的 4 条投递（待跟进优先 → 面试中 → Offer → 已投递 → 最近更新）
  const priorityOf = (a: import("../types").Application) => {
    const isDue = !!a.follow_up_at && a.follow_up_at <= today && !TERMINAL_STATUSES.includes(a.status);
    if (isDue) return 0;
    if (a.status === "interview") return 1;
    if (a.status === "offer") return 2;
    if (a.status === "applied") return 3;
    if (a.status === "saved") return 4;
    return 5;
  };
  const spotlightApps = [...applications]
    .sort((a, b) => {
      const pa = priorityOf(a);
      const pb = priorityOf(b);
      if (pa !== pb) return pa - pb;
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    })
    .slice(0, 4);
  const activeCount = applications.filter((a) => !TERMINAL_STATUSES.includes(a.status)).length;

  const weekdayLabels = uiLang === "en" ? ["M", "", "W", "", "F", "", "S"] : ["一", "", "三", "", "五", "", "日"];

  return (
    <section aria-label={uiLang === "en" ? "Interview Progress" : "面试跟进"}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[17px] font-bold tracking-tight text-ink-900">
            {uiLang === "en" ? "Interview Progress" : "面试跟进"}
          </h2>
          {total > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] tabular-nums">
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-0.5 font-medium text-sky-600">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
                {uiLang === "en" ? `Applied ${stats.submitted}` : `已投递 ${stats.submitted}`}
              </span>
              {stats.interviews > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 font-medium text-indigo-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  {uiLang === "en" ? `Interview ${stats.interviews}` : `面试 ${stats.interviews}`}
                </span>
              )}
              {stats.offers > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2.5 py-0.5 font-medium text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {`Offer ${stats.offers}`}
                </span>
              )}
            </div>
          )}
          {stats.followups > 0 && (
            <button
              type="button"
              onClick={() => onOpenApplications(true)}
              className="rounded-full bg-amber-500/12 px-2.5 py-0.5 text-[11.5px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 tabular-nums"
            >
              {uiLang === "en"
                ? `${stats.followups} due`
                : `${stats.followups} 条待跟进`}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenApplications(false)}
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium text-ink-500 transition-colors hover:bg-subtle hover:text-ink-900"
        >
          {uiLang === "en" ? "Manage" : "管理投递"}
          <IconArrowRight size={13} />
        </button>
      </div>

      <div className="soft-panel rounded-[24px] p-4 sm:p-5">
        {/* 左右等重双卡（左：最近推进 / 待跟进清单；右：近 24 周 11px 紧凑热力图） */}
        <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_auto]">
          {/* 左卡：最近跟进与活跃岗位（顶部自然对齐，无多余留白） */}
          <div className="flex flex-col gap-2.5 rounded-[18px] bg-surface/75 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-500">
                {uiLang === "en" ? "Active Pipeline" : "最近推进"}
              </span>
              <span className="text-[11.5px] text-ink-400 tabular-nums">
                {total > 0
                  ? uiLang === "en"
                    ? `${activeCount} active · ${total} total`
                    : `${activeCount} 个进行中 · 共 ${total} 条`
                  : uiLang === "en"
                    ? "No records yet"
                    : "暂无记录"}
              </span>
            </div>

            {spotlightApps.length > 0 ? (
              <div className="space-y-1.5">
                {spotlightApps.map((app) => {
                  const isDue =
                    !!app.follow_up_at &&
                    app.follow_up_at <= today &&
                    !TERMINAL_STATUSES.includes(app.status);
                  const stStyle = APP_STATUS_STYLE[app.status] || APP_STATUS_STYLE.saved;
                  const stLabel =
                    uiLang === "en" ? EN_APP_LABELS[app.status] : APPLICATION_LABELS[app.status];
                  const latestAt =
                    app.events && app.events.length > 0
                      ? fmtDate(app.events[app.events.length - 1].at)
                      : fmtDate(app.updated_at);
                  const dateTag = isDue
                    ? uiLang === "en"
                      ? `Due ${app.follow_up_at.slice(5)}`
                      : `待跟进 ${app.follow_up_at.slice(5)}`
                    : (latestAt || app.applied_at || "").slice(5);
                  return (
                    <button
                      key={app.id}
                      type="button"
                      onClick={() => onOpenApplications(isDue)}
                      className="group flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-subtle/80"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${stStyle.dot}`} />
                        <span className="truncate text-[13px] font-semibold text-ink-800 group-hover:text-ink-900">
                          {app.company || (uiLang === "en" ? "Untitled" : "未命名公司")}
                        </span>
                        {app.role && (
                          <span className="truncate text-[12px] text-ink-400">
                            · {app.role}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stStyle.badge}`}
                        >
                          {stLabel}
                        </span>
                        {dateTag && (
                          <span
                            className={`text-[11px] tabular-nums ${
                              isDue ? "font-medium text-amber-600" : "text-ink-400"
                            }`}
                          >
                            {dateTag}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onOpenApplications(false)}
                className="flex flex-1 items-center justify-between rounded-xl bg-subtle/50 px-3.5 py-3 text-left transition-colors hover:bg-subtle"
              >
                <span className="text-[12.5px] text-ink-500">
                  {uiLang === "en"
                    ? "Track your applications, interviews, and follow-up dates here."
                    : "记录第一条投递与面试进度，在这里随时掌握跟进节奏。"}
                </span>
                <IconArrowRight size={14} className="ml-2 shrink-0 text-ink-400" />
              </button>
            )}
          </div>

          {/* 右卡：近 24 周紧凑热力图（固定 11px 方块） */}
          <div className="flex flex-col justify-between gap-2.5 rounded-[18px] bg-surface/75 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[12.5px] font-medium text-ink-500">
                {uiLang === "en" ? "24-Week Activity" : "近 24 周活跃度"}
              </span>
              <span className="text-[11px] text-ink-400 tabular-nums">
                {uiLang === "en"
                  ? `${activeDays}d active · ${totalActions} updates`
                  : `活跃 ${activeDays} 天 · ${totalActions} 次动态`}
              </span>
            </div>

            <div
              className="overflow-x-auto pb-0.5"
              role="img"
              aria-label={
                uiLang === "en"
                  ? `24-week job search activity heatmap with ${activeDays} active days`
                  : `近 24 周求职活跃热力图，共活跃 ${activeDays} 天`
              }
            >
              <div className="inline-block">
                {/* 月份刻度 */}
                <div className="mb-1 flex items-center gap-[3px] pl-[18px]">
                  {monthMarkers.map((label, idx) => (
                    <span
                      key={idx}
                      className="relative h-3 w-[11px] shrink-0 overflow-visible whitespace-nowrap text-[9.5px] leading-3 text-ink-400"
                    >
                      {label || ""}
                    </span>
                  ))}
                </div>

                {/* 星期标签 + 24×7 精致热力方块 */}
                <div className="flex items-start gap-1.5">
                  <div className="flex w-3 shrink-0 flex-col gap-[3px] text-right text-[9px] leading-[11px] text-ink-400">
                    {weekdayLabels.map((lbl, idx) => (
                      <span key={idx} className="h-[11px]">
                        {lbl}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-[3px]">
                    {columns.map((col, wIdx) => (
                      <div key={wIdx} className="flex flex-col gap-[3px]">
                        {col.map((cell) => {
                          const heatClass = cell.isFuture
                            ? "heat-future"
                            : `heat-${cell.level}`;
                          const tip = cell.isFuture
                            ? cell.ymd
                            : cell.count > 0
                              ? uiLang === "en"
                                ? `${cell.ymd} · ${cell.count} action${cell.count > 1 ? "s" : ""}`
                                : `${cell.ymd} · ${cell.count} 次投递/进展`
                              : uiLang === "en"
                                ? `${cell.ymd} · No activity`
                                : `${cell.ymd} · 无记录`;
                          return (
                            <div
                              key={cell.ymd}
                              title={tip}
                              className={`h-[11px] w-[11px] rounded-[2.5px] transition-transform duration-150 ${heatClass} ${
                                cell.isToday ? "heat-today" : ""
                              } ${!cell.isFuture ? "hover:scale-125" : ""}`}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 底部图例：与 11px 方块同尺寸 */}
            <div className="flex items-center justify-end gap-1 text-[10px] text-ink-400">
              <span>{uiLang === "en" ? "Less" : "少"}</span>
              <span className="heat-0 h-[10px] w-[10px] rounded-[2.5px]" />
              <span className="heat-1 h-[10px] w-[10px] rounded-[2.5px]" />
              <span className="heat-2 h-[10px] w-[10px] rounded-[2.5px]" />
              <span className="heat-3 h-[10px] w-[10px] rounded-[2.5px]" />
              <span className="heat-4 h-[10px] w-[10px] rounded-[2.5px]" />
              <span>{uiLang === "en" ? "More" : "多"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
