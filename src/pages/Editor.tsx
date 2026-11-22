import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AIAction, Block, Resume, Section } from "../types";
import { AUDIENCE_LABELS, TEMPLATES } from "../types";
import { cx } from "../lib/utils";
import { useAppSlice, useResume } from "../lib/store";
import { audienceLabel, templateNameLabel, useT, useUiLang } from "../lib/i18n";
import { SectionCard } from "../components/blocks";
import { AIPanel, JDPanel, OutlinePanel } from "../components/panels";
import ResumePreview from "../components/resume-preview";
import ResumeThumbnail from "../components/resume-thumbnail";
import OnePageDialog from "../components/one-page-dialog";
import WorkflowSteps from "../components/workflow-steps";
import SourceUpdate from "../components/source-update";
import ExportDialog from "../components/export-dialog";
import WorkflowDialog, {
  type WorkflowTool,
} from "../components/workflow-dialog";
import { ApplicationForm } from "./Applications";
import type { PageLayout } from "../lib/pagination";
import { completion, inspectResume, hasReviewedTarget, isCurrentExport } from "../lib/workflow";
import { Btn, GlassSelect, Modal, ModalHeader, SaveIndicator, useActionMenu } from "../components/ui";
import { flashLocation, scrollInPane, type ResumeLocation } from "../lib/preview-navigation";
import {
  IconBookOpen,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconFile,
  IconGrip,
  IconLayout,
  IconPalette,
  IconPanelRight,
  IconPlus,
  IconSpark,
  IconTarget,
  IconType,
} from "../components/icons";

function contrastOnWhite(hex: string): number {
  const clean = hex.replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return 21;
  const toLin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const r = toLin(parseInt(full.slice(0, 2), 16));
  const g = toLin(parseInt(full.slice(2, 4), 16));
  const b = toLin(parseInt(full.slice(4, 6), 16));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05) / (lum + 0.05);
}

function navigateTabs(event: React.KeyboardEvent<HTMLDivElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  ).filter((tab) => tab.getClientRects().length > 0);
  if (!tabs.length) return;
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
      ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) %
        tabs.length;
  event.preventDefault();
  tabs[next].click();
  tabs[next].focus();
}

const THEME_COLORS = ["#4F46E5", "#1d4ed8", "#9f1239", "#b45309", "#334155"];

function EditorActionMenu({
  label,
  ariaLabel,
  className,
  align = "left",
  items,
}: {
  label: string;
  ariaLabel: string;
  className?: string;
  align?: "left" | "right";
  items: Array<{ label: string; onSelect: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useActionMenu(open, setOpen, container);
  return (
    <div ref={container} className={cx("relative", className)}>
      <Btn
        size="sm"
        variant="outline"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="gap-1"
      >
        {label}
        <IconChevronDown
          size={13}
          className={cx("transition-transform duration-150", open && "rotate-180")}
        />
      </Btn>
      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className={cx(
            "app-menu absolute z-30 min-w-40",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 下拉菜单内的分组小标题 + 内容 */
function MenuSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-wider text-ink-400">
        {title}
      </p>
      {children}
    </div>
  );
}

function SortableSection({
  resume,
  section,
  onRequestAI,
  highlight,
  onHover,
  revealLocation,
}: {
  resume: Resume;
  section: Section;
  onRequestAI: (s: string, b: string, a: AIAction) => void;
  highlight?: boolean;
  onHover?: (id: string | null) => void;
  revealLocation?: ResumeLocation | null;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.section_id });
  return (
    <div
      ref={setNodeRef}
      data-section-id={section.section_id}
      tabIndex={-1}
      onMouseEnter={() => onHover?.(section.section_id)}
      onMouseLeave={() => onHover?.(null)}
      style={{
        transform: transform
          ? `${CSS.Transform.toString(transform)}${
              isDragging ? " rotate(2deg)" : ""
            }`
          : undefined,
        transition,
      }}
      className={cx(
        "rounded-xl transition-[opacity,box-shadow] duration-300",
        highlight && !isDragging && "editor-section-current",
        isDragging &&
          "z-20 opacity-95 shadow-[0_24px_48px_-12px_rgba(99,102,241,0.45)] ring-1 ring-brand-300"
      )}
    >
      <SectionCard
        resume={resume}
        section={section}
        onRequestAI={onRequestAI}
        revealLocation={revealLocation}
        dragHandle={
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none rounded p-1 text-ink-300 transition hover:bg-paper-200 hover:text-ink-600 active:cursor-grabbing"
            aria-label="拖动调整栏目顺序"
            title="拖动调整栏目顺序"
          >
            <IconGrip size={15} />
          </button>
        }
      />
    </div>
  );
}

export default function Editor({ resumeId, initialPanel }: { resumeId: string; initialPanel?: "ai" }) {
  const resume = useResume(resumeId);
  const parentResume = useResume(resume?.target?.source_resume_id);
  const [sourceUpdateOpen, setSourceUpdateOpen] = useState(false);
  const app = useAppSlice(
    "jds",
    "snapshots",
    "applications",
    "go",
    "requestSuggestion",
    "reorderSections",
    "toast",
    "renameResume",
    "replaceResumeData",
    "setTemplate",
    "setTheme",
    "addSection",
    "setResumeOptions",
    "captureSnapshot"
  );
  const [panelTab, setPanelTab] = useState<"ai" | "jd">("ai");
  const [activeTarget, setActiveTarget] = useState<{
    sectionId: string;
    blockId: string;
  } | null>(null);
  const [previewLocation, setPreviewLocation] = useState<ResumeLocation | null>(null);
  const [revealLocation, setRevealLocation] = useState<ResumeLocation | null>(null);
  const navigationId = useRef(0);
  const suppressPreviewSync = useRef(false);
  const editorHighlight = useRef<(() => void) | null>(null);
  const lastPreviewRequest = useRef("");
  useEffect(() => () => editorHighlight.current?.(), []);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [onePageOpen, setOnePageOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<
    "content" | "layout" | "preview"
  >(() => !initialPanel && window.matchMedia("(min-width: 1280px)").matches ? "layout" : "content");
  const [canSplit, setCanSplit] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1280px)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    const sync = () => {
      setCanSplit(media.matches);
      if (!media.matches)
        setEditorMode((mode) => (mode === "layout" ? "content" : mode));
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const uiLang = useUiLang();
  const t = useT();
  const [settingsTab, setSettingsTab] = useState<
    "document" | "template" | "style" | "layout"
  >("template");
  const [tplGroup, setTplGroup] = useState<"all" | "zh" | "en">("all");
  const [splitRatio, setSplitRatio] = useState(43);
  const [previewOnLeft, setPreviewOnLeft] = useState(() => {
    try { return localStorage.getItem('resume-preview-side') === 'left'; } catch { return false; }
  });
  const paneScrollBeforeSwap = useRef<{content:number; preview:number} | null>(null);
  useLayoutEffect(() => {
    const saved = paneScrollBeforeSwap.current;
    const content = splitRef.current?.querySelector<HTMLElement>('.editor-content');
    const preview = splitRef.current?.querySelector<HTMLElement>('.editor-preview');
    if (saved && content && preview) {
      content.scrollTop = saved.content;
      preview.scrollTop = saved.preview;
      paneScrollBeforeSwap.current = null;
    }
  }, [previewOnLeft]);
  const swapPanes = () => {
    const content = splitRef.current?.querySelector<HTMLElement>('.editor-content');
    const preview = splitRef.current?.querySelector<HTMLElement>('.editor-preview');
    if (content && preview) paneScrollBeforeSwap.current = {content:content.scrollTop, preview:preview.scrollTop};
    const next = !previewOnLeft;
    setPreviewOnLeft(next);
    try { localStorage.setItem('resume-preview-side', next ? 'left' : 'right'); } catch { /* Session preference still works when storage is unavailable. */ }
  };
  const splitRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<WorkflowTool | null>(null);
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [livePages, setLivePages] = useState<PageLayout[]>([]);
  const [addSecOpen, setAddSecOpen] = useState(false);
  const [newSecStructure, setNewSecStructure] = useState<Block["type"]>("summary");
  const [newSecTitle, setNewSecTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const sections = useMemo(
    () =>
      resume ? [...resume.data.sections].sort((a, b) => a.order - b.order) : [],
    [resume]
  );
  const issues = useMemo(
    () => (resume ? inspectResume(resume) : []),
    [resume]
  );
  const warningCount = useMemo(
    () => issues.filter((i) => i.severity === "warning").length,
    [issues]
  );
  const completionPct = useMemo(
    () => (resume ? completion(resume) : 0),
    [resume]
  );

  // ---------- Scrollspy：视口顶部 reading line 命中的模块突出显示，其余淡化 ----------
  const scrollRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // 鼠标悬停的模块优先成为高亮对象；移开后回落到滚动判定
  const [hoverSection, setHoverSection] = useState<string | null>(null);
  // 桌面宽屏（≥xl）支持左侧目录与右侧 AI/JD 面板独立同时停靠；窄屏保持单抽屉互斥
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(Boolean(initialPanel));
  const toggleOutline = () => {
    setOutlineOpen((prev) => {
      const next = !prev;
      if (next && typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
        setRightOpen(false);
      }
      return next;
    });
  };
  const openRightPanel = (tab: "ai" | "jd", toggleIfSame = false) => {
    if (toggleIfSame && rightOpen && panelTab === tab) {
      setRightOpen(false);
      return;
    }
    setPanelTab(tab);
    setRightOpen(true);
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
      setOutlineOpen(false);
    }
  };
  const closeAllPanels = () => {
    setOutlineOpen(false);
    setRightOpen(false);
  };

  // ---------- 轻量级撤销 / 重做栈（内存 40 步，支持 Ctrl+Z / Ctrl+Shift+Z） ----------
  const historyRef = useRef<{
    past: Resume["data"][];
    future: Resume["data"][];
    last: Resume["data"] | null;
    lastJson: string;
    suppress: boolean;
  }>({ past: [], future: [], last: null, lastJson: "", suppress: false });
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });

  useEffect(() => {
    historyRef.current = {
      past: [],
      future: [],
      last: resume ? structuredClone(resume.data) : null,
      lastJson: resume ? JSON.stringify(resume.data) : "",
      suppress: false,
    };
    setHistoryMeta({ canUndo: false, canRedo: false });
    // Reset only when switching to another resume document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeId]);

  useEffect(() => {
    if (!resume) return;
    const h = historyRef.current;
    if (h.suppress) {
      h.suppress = false;
      h.last = structuredClone(resume.data);
      h.lastJson = JSON.stringify(resume.data);
      return;
    }
    const timer = window.setTimeout(() => {
      const nextJson = JSON.stringify(resume.data);
      if (nextJson === h.lastJson) return;
      if (h.last) {
        h.past = [...h.past.slice(-39), h.last];
        h.future = [];
      }
      h.last = structuredClone(resume.data);
      h.lastJson = nextJson;
      setHistoryMeta({ canUndo: h.past.length > 0, canRedo: false });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [resume]);

  const handleUndo = () => {
    const h = historyRef.current;
    if (!resume || h.past.length === 0) return;
    const prev = h.past[h.past.length - 1];
    h.past = h.past.slice(0, -1);
    h.future = [structuredClone(resume.data), ...h.future.slice(0, 39)];
    h.suppress = true;
    app.replaceResumeData(resumeId, prev);
    setHistoryMeta({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  };

  const handleRedo = () => {
    const h = historyRef.current;
    if (!resume || h.future.length === 0) return;
    const next = h.future[0];
    h.future = h.future.slice(1);
    h.past = [...h.past.slice(-39), structuredClone(resume.data)];
    h.suppress = true;
    app.replaceResumeData(resumeId, next);
    setHistoryMeta({ canUndo: h.past.length > 0, canRedo: h.future.length > 0 });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const inEditable =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (inEditable) return;
      if (e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (historyRef.current.past.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      } else if (
        (e.key.toLowerCase() === "z" && e.shiftKey) ||
        e.key.toLowerCase() === "y"
      ) {
        if (historyRef.current.future.length > 0) {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
  // 正在输入时不淡化：编辑动作发生在某个卡片内部，淡化它的邻居会干扰输入
  const sectionIdsKey = sections.map((s) => s.section_id).join(",");

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const cards = el.querySelectorAll<HTMLElement>("[data-section-id]");
      if (!cards.length) return;
      const containerTop = el.getBoundingClientRect().top;
      let current: string | null = cards[0].dataset.sectionId ?? null;
      cards.forEach((c) => {
        if (c.getBoundingClientRect().top - containerTop <= 150)
          current = c.dataset.sectionId ?? current;
      });
      setActiveSection(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [sectionIdsKey]);

  if (!resume) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-[14px] text-ink-400">简历不存在或已被删除</p>
        <Btn variant="primary" onClick={() => app.go({ name: "home" })}>
          返回工作台
        </Btn>
      </div>
    );
  }

  const onRequestAI = (
    sectionId: string,
    blockId: string,
    action: AIAction
  ) => {
    setActiveTarget({ sectionId, blockId });
    openRightPanel("ai");
    app.requestSuggestion(resumeId, sectionId, blockId, action);
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex((s) => s.section_id === active.id);
    const newIdx = sections.findIndex((s) => s.section_id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    app.reorderSections(
      resumeId,
      arrayMove(sections, oldIdx, newIdx).map((s) => s.section_id)
    );
    app.toast("ok", "模块顺序已更新，正在自动保存");
  };

  const syncPreview = (event: React.SyntheticEvent) => {
    if (suppressPreviewSync.current || editorMode !== "layout") return;
    const element = event.target as Element;
    if (element.closest('button,a,select,[role="menu"],input[type="checkbox"],input[type="radio"],input[type="range"],input[type="file"]')) return;
    const sectionId = element.closest<HTMLElement>("[data-section-id]")?.dataset.sectionId;
    if (!sectionId) return;
    const blockId = element.closest<HTMLElement>("[data-block-id]")?.dataset.blockId;
    const key = JSON.stringify([sectionId, blockId]);
    if (lastPreviewRequest.current === key) return;
    lastPreviewRequest.current = key;
    setPreviewLocation({ sectionId, blockId, requestId: ++navigationId.current });
  };
  const locate = (sectionId: string, blockId?: string, fromPreview = false) => {
    if (fromPreview) setEditorMode(canSplit ? "layout" : "content");
    else if (editorMode === "preview") setEditorMode(canSplit ? "layout" : "content");
    if (typeof window !== "undefined" && !window.matchMedia("(min-width: 1280px)").matches) {
      closeAllPanels();
    }
    setActiveSection(sectionId);
    setRevealLocation({ sectionId, blockId, requestId: ++navigationId.current });
    if (fromPreview) {
      lastPreviewRequest.current = JSON.stringify([sectionId, blockId]);
      setPreviewLocation({ sectionId, blockId, requestId: ++navigationId.current, scroll: false });
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = Array.from(scrollRef.current?.querySelectorAll<HTMLElement>("[data-section-id]") ?? [])
        .find(el => el.dataset.sectionId === sectionId);
      const entry = blockId
        ? Array.from(card?.querySelectorAll<HTMLElement>("[data-block-id]") ?? []).find(el => el.dataset.blockId === blockId)
        : null;
      const target = entry ?? card;
      if (!target || !scrollRef.current) return;
      scrollInPane(target, scrollRef.current, 16);
      editorHighlight.current?.();
      editorHighlight.current = flashLocation(target, "editor");
      if (fromPreview) {
        suppressPreviewSync.current = true;
        target.focus({ preventScroll: true });
        requestAnimationFrame(() => { suppressPreviewSync.current = false; });
        return;
      }
      const field = (entry ?? card)?.querySelector<HTMLElement>(
        "input,textarea,[contenteditable]"
      );
      field?.focus({ preventScroll: true });
    }));
  };

  return (
    <div className="flex h-full flex-col">
      <header
        className="shrink-0 bg-page/90 px-3 py-2.5 pr-24 backdrop-blur sm:px-5 md:pr-28"
        data-testid="editor-header"
      >
        <div className="flex items-center gap-2">
          <button
            className="tool-btn shrink-0 rounded-full"
            aria-label="返回工作台"
            onClick={() => app.go({ name: "home" })}
          >
            <IconChevronLeft size={18} />
          </button>
          <input
            aria-label="简历标题"
            title={resume.title}
            className="min-w-0 flex-1 truncate rounded-lg border-0 bg-transparent px-1.5 py-0.5 text-[16px] font-bold text-ink-900 outline-none focus:bg-subtle focus:ring-1 focus:ring-brand-300"
            value={resume.title}
            onChange={(e) => app.renameResume(resumeId, e.target.value)}
          />
          <div className="hidden shrink-0 sm:block">
            <SaveIndicator />
          </div>
          <div className="shrink-0 sm:hidden"><SaveIndicator compact /></div>
          <div className="hidden items-center gap-0.5 sm:inline-flex">
            <button
              type="button"
              disabled={!historyMeta.canUndo}
              onClick={handleUndo}
              title={t("撤销 (Ctrl+Z)", "Undo (Ctrl+Z)")}
              aria-label={t("撤销", "Undo")}
              className="tool-btn rounded-full"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
            </button>
            <button
              type="button"
              disabled={!historyMeta.canRedo}
              onClick={handleRedo}
              title={t("重做 (Ctrl+Shift+Z)", "Redo (Ctrl+Shift+Z)")}
              aria-label={t("重做", "Redo")}
              className="tool-btn rounded-full"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
              </svg>
            </button>
          </div>
          <div className="hidden sm:contents"><Btn variant="ghost" className="rounded-full" onClick={() => setTool("versions")}>{t("历史版本", "History")}</Btn></div>
          <Btn
            variant="ghost"
            className="shrink-0 rounded-full"
            onClick={() => setSettingsOpen(true)}
          >
            <span className="hidden sm:inline">{t("模板与设置", "Template & Style")}</span><span className="sm:hidden">{t("设置", "Style")}</span>
          </Btn>
          <Btn
            variant="primary"
            className="cta-ai shrink-0 rounded-full"
            onClick={() => setPreviewOpen(true)}
          >
            {t("导出", "Export")}
          </Btn>
        </div>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 bg-page/90 px-3 pb-2.5 pt-0.5 text-[12px] sm:px-5">
        <div
          className="liquid-glass relative flex rounded-full p-1"
          role="tablist"
          onKeyDown={navigateTabs}
          aria-label={t("编辑视图", "Editor view")}
        >
          {(
            [
              ["content", t("写内容", "Write")],
              ["layout", t("内容与预览", "Split")],
              ["preview", t("仅预览", "Preview")],
            ] as const
          )
            .filter(([mode]) => mode !== "layout" || canSplit)
            .map(([mode, label]) => (
              <button
                key={mode}
                role="tab"
                aria-selected={editorMode === mode}
                tabIndex={editorMode === mode ? 0 : -1}
                className={cx(
                  "editor-view-tab min-h-8 rounded-full px-3.5 py-1 text-[13px] transition-all",
                  editorMode === mode
                    ? "glass-lens font-semibold"
                    : "text-ink-500 hover:text-ink-900"
                )}
                onClick={() => {
                  setEditorMode(mode);
                  closeAllPanels();
                }}
              >
                {label}
              </button>
            ))}
        </div>
        <div className="hidden sm:contents">
        <Btn
          variant="ghost"
          size="sm"
          aria-pressed={outlineOpen}
          className={cx(
            "hidden sm:inline-flex",
            outlineOpen && "bg-brand-50 text-brand-700"
          )}
          onClick={toggleOutline}
        >
          <IconBookOpen size={14} />
          {t("目录", "Outline")}
        </Btn>
        <Btn
          variant="ghost"
          size="sm"
          aria-pressed={rightOpen && panelTab === "ai"}
          className={cx(
            "hidden sm:inline-flex",
            rightOpen && panelTab === "ai" && "bg-brand-50 text-brand-700"
          )}
          onClick={() => openRightPanel("ai", true)}
        >
          <IconPanelRight size={14} />
          {t("建议", "AI Polish")}
          {rightOpen && panelTab === "ai" && <span className="sp-dot" aria-hidden="true" />}
        </Btn>
        <Btn
          size="sm"
          aria-pressed={!!resume.target && rightOpen && panelTab === "jd"}
          className={cx(
            "hidden sm:inline-flex",
            !!resume.target && rightOpen && panelTab === "jd" && "border-brand-400 bg-brand-50 text-brand-700"
          )}
          onClick={() => {
            if (!resume.target) setTool("target");
            else openRightPanel("jd", true);
          }}
        >
          {resume.target ? t("岗位要求", "Target JD") : t("创建岗位版本", "Tailor for Job")}
        </Btn>

        <EditorActionMenu
          label={t("辅助工具", "Tools")}
          ariaLabel={t("辅助工具", "Tools")}
          className="hidden sm:block"
          items={[
            { label: t("批量优化模块", "Batch Polish"), onSelect: () => setTool("module") },
            { label: t("篇幅调整", "Fit Pages"), onSelect: () => setOnePageOpen(true) },
            { label: t("求职信", "Cover Letter"), onSelect: () => setTool("letter") },
            { label: t("导入原文", "Source Text"), onSelect: () => setTool("source") },
            {
              label: showSteps ? t("隐藏流程进度", "Hide Workflow Bar") : t("显示流程进度", "Show Workflow Bar"),
              onSelect: () => setShowSteps((v) => !v),
            },
          ]}
        />

        </div>
        <EditorActionMenu
          label={t("更多", "More")}
          ariaLabel={t("编辑工具", "Editor tools")}
          align="right"
          className="ml-auto sm:hidden"
          items={[
            { label: t("内容目录", "Outline"), onSelect: toggleOutline },
            {
              label: resume.target ? t("岗位要求", "Target JD") : t("创建岗位版本", "Tailor for Job"),
              onSelect: () => {
                if (!resume.target) setTool("target");
                else openRightPanel("jd");
              },
            },
            {
              label: t("内容建议", "AI Polish"),
              onSelect: () => openRightPanel("ai"),
            },
            { label: t("批量优化模块", "Batch Polish"), onSelect: () => setTool("module") },
            { label: t("篇幅调整", "Fit Pages"), onSelect: () => setOnePageOpen(true) },
            { label: t("历史版本", "History"), onSelect: () => setTool("versions") },
            { label: t("求职信", "Cover Letter"), onSelect: () => setTool("letter") },
            { label: t("导入原文", "Source Text"), onSelect: () => setTool("source") },
            ...(parentResume
              ? [
                  { label: t("主简历更新", "Sync Master"), onSelect: () => setSourceUpdateOpen(true) },
                  {
                    label: t("查看主简历", "Open Master"),
                    onSelect: () => app.go({ name: "editor", resumeId: parentResume.id }),
                  },
                ]
              : []),
          ]}
        />
        <button
          type="button"
          onClick={() => setShowSteps((v) => !v)}
          className="ml-auto hidden rounded-full px-2.5 py-1 text-[12px] text-ink-500 transition-colors hover:bg-subtle hover:text-ink-900 sm:inline-flex sm:items-center sm:gap-1.5"
          title={t(`基础字段完成度 ${completionPct}%（点击展开流程进度）`, `Completeness ${completionPct}% (click for workflow)`)}
        >
          <span>
            {warningCount
              ? t(`${warningCount} 项待检查`, `${warningCount} to review`)
              : t("基础字段已填写", "Ready")}
            {editorMode !== "content" && livePages.length
              ? ` · ${livePages.length} ${t("页", livePages.length > 1 ? "pages" : "page")}`
              : ""}
          </span>
        </button>
      </div>
      {resume.archived_at && (
        <p className="px-4 py-2 text-[12px] text-ink-500">
          {t("这份简历已归档，投递历史和快照仍保留；可在工作台的已归档列表恢复。", "This resume is archived. Snapshots and applications are preserved.")}
        </p>
      )}
      {sourceUpdateOpen && parentResume && (
        <SourceUpdate
          resume={resume}
          source={parentResume}
          onClose={() => setSourceUpdateOpen(false)}
        />
      )}
      {!showSteps && parentResume && resume.target?.source_updated_at && parentResume.updated_at > resume.target.source_updated_at && (
        <div className="mx-3 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-seal-100/70 px-3.5 py-2 text-[12px] text-seal-700 sm:mx-5">
          <span>{t(`主简历「${parentResume.title}」有新改动`, `Master "${parentResume.title}" has updates`)}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="font-medium underline-offset-2 hover:underline"
              onClick={() => setSourceUpdateOpen(true)}
            >
              {t("对照更新", "Compare & Sync")}
            </button>
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => app.go({ name: "editor", resumeId: parentResume.id })}
            >
              {t("查看主简历", "Open Master")}
            </button>
          </div>
        </div>
      )}
      {showSteps && <WorkflowSteps
        resume={resume}
        hasJD={!!app.jds[resumeId]}
        hasTargetReview={hasReviewedTarget(resume, app.jds[resumeId], app.snapshots)}
        hasExport={app.snapshots.some(s => isCurrentExport(resume, app.jds[resumeId], s))}
        hasApplication={app.applications.some((a) => a.resume_id === resumeId && a.status !== "saved" && !!a.snapshot_id)}
        extra={
          parentResume ? (
            <div className="hidden flex-wrap items-center gap-2 text-[12px] text-ink-500 sm:flex">
              <span className="truncate max-w-60" title={`来源：${parentResume.title}`}>
                来源：{parentResume.title}
              </span>
              {resume.target?.source_updated_at &&
                parentResume.updated_at > resume.target.source_updated_at && (
                  <span className="chip bg-seal-100 text-seal-700">
                    主简历有更新
                  </span>
                )}
              <button
                type="button"
                className="text-brand-700 underline-offset-2 hover:underline"
                onClick={() => app.go({ name: "editor", resumeId: parentResume.id })}
              >
                查看主简历
              </button>
              <button
                type="button"
                className="text-brand-700 underline-offset-2 hover:underline"
                onClick={() => setSourceUpdateOpen(true)}
              >
                对照更新
              </button>
            </div>
          ) : undefined
        }
        onStep={(step) => {
          if (step === 0) {
            if (resume.data.metadata.source_text && !resume.data.metadata.reviewed_at) {
              setTool("source");
            } else {
              const firstIssue = inspectResume(resume).find((i) => i.severity === "warning" && i.sectionId);
              locate(
                firstIssue?.sectionId ??
                  sections.find((s) => s.type === "basic_info")?.section_id ??
                  sections[0]?.section_id ??
                  "",
                firstIssue?.blockId
              );
            }
          } else if (step === 1) {
            if (!app.jds[resumeId] && !resume.target) setTool("target");
            else openRightPanel("jd");
          } else if (step === 2) {
            openRightPanel("jd");
          } else if (step === 3) setPreviewOpen(true);
          else setApplicationOpen(true);
        }}
      />}
      {/* 宽屏（≥xl）支持左右面板同时停靠，中等屏幕单侧停靠，窄屏抽屉 */}
      {(outlineOpen || rightOpen) && (
        <div
          className="fixed inset-0 z-30 bg-ink-950/30 backdrop-blur-[2px] lg:hidden"
          onClick={closeAllPanels}
          aria-hidden="true"
        />
      )}
      <div
        className={cx(
          "grid min-h-0 flex-1 grid-cols-1 gap-3 px-2 pb-2 sm:px-3",
          outlineOpen && !rightOpen && "lg:grid-cols-[224px_minmax(0,1fr)]",
          !outlineOpen && rightOpen && "lg:grid-cols-[minmax(0,1fr)_340px]",
          outlineOpen && rightOpen && "xl:grid-cols-[224px_minmax(0,1fr)_340px]"
        )}
      >
        {outlineOpen && (
          <aside className="soft-panel fixed bottom-0 left-0 top-0 z-40 flex min-h-0 w-72 flex-col overflow-y-auto shadow-2xl lg:static lg:z-auto lg:w-auto lg:rounded-[22px] lg:shadow-none">
            <div className="flex items-center justify-between px-3.5 pt-3">
              <span className="text-[12px] font-semibold text-ink-500">{t("目录", "Outline")}</span>
              <button
                type="button"
                className="rounded-full px-2.5 py-1 text-[12px] text-ink-500 transition hover:bg-surface hover:text-ink-900"
                aria-label={t("关闭目录", "Close outline")}
                onClick={() => setOutlineOpen(false)}
              >
                {t("收起", "Close")}
              </button>
            </div>
            <OutlinePanel
              resume={resume}
              activeId={activeSection}
              onAdd={() => setAddSecOpen(true)}
            />
          </aside>
        )}

        <main
          ref={scrollRef}
          className={cx(
            "min-h-0 bg-paper-50 p-3 sm:p-4",
            editorMode === "layout"
              ? "overflow-y-auto xl:overflow-hidden"
              : "overflow-y-auto"
          )}
          onFocusCapture={(e) => {
            const card = (e.target as HTMLElement).closest<HTMLElement>(
              "[data-section-id]"
            );
            if (card?.dataset.sectionId)
              setActiveSection(card.dataset.sectionId);
          }}
        >
          <div
            ref={splitRef}
            className={cx(editorMode === "layout" && "editor-split")}
            style={{ "--editor-columns": previewOnLeft ? `minmax(0, 1fr) 12px minmax(0, ${splitRatio}%)` : `minmax(0, ${splitRatio}%) 12px minmax(0, 1fr)` } as CSSProperties}
          >
            {(previewOnLeft ? ['preview', 'divider', 'content'] : ['content', 'divider', 'preview']).map(pane => <Fragment key={pane}>
            {pane === 'content' && editorMode !== "preview" && (
              <>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onDragEnd}
                >
                  <SortableContext
                    items={sections.map((s) => s.section_id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div
                      onClickCapture={syncPreview}
                      onFocusCapture={syncPreview}
                      className={cx(
                        "editor-content mx-auto flex w-full min-w-0 flex-col gap-4 pb-10",
                        editorMode === "content" && "max-w-3xl"
                      )}
                    >
                      {sections.map((s) => {
                        const current = hoverSection ?? activeSection;
                        return (
                          <SortableSection
                            key={s.section_id}
                            resume={resume}
                            section={s}
                            onRequestAI={onRequestAI}
                            highlight={current === s.section_id}
                            onHover={setHoverSection}
                            revealLocation={revealLocation}
                          />
                        );
                      })}
                      <button
                        onClick={() => setAddSecOpen(true)}
                        className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 py-4 text-[13px] font-medium text-ink-400 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
                      >
                        <IconPlus size={14} /> {t("添加栏目", "Add Section")}
                      </button>
                    </div>
                  </SortableContext>
                </DndContext>
              </>
            )}
            {pane === "divider" && editorMode === "layout" && (
              <div
                role="separator"
                aria-label="调整编辑与预览宽度"
                aria-orientation="vertical"
                aria-valuemin={34}
                aria-valuemax={60}
                aria-valuenow={splitRatio}
                aria-valuetext={`内容宽度 ${Math.round(splitRatio)}%，内容在${previewOnLeft ? "右" : "左"}侧`}
                tabIndex={0}
                className="hidden cursor-col-resize touch-none items-center justify-center rounded hover:bg-paper-200 focus:bg-paper-200 xl:flex"
                onPointerDown={(e) =>
                  e.currentTarget.setPointerCapture(e.pointerId)
                }
                onPointerMove={(e) => {
                  if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                  const rect = splitRef.current?.getBoundingClientRect();
                  if (rect)
                    setSplitRatio(
                      Math.min(
                        60,
                        Math.max(
                          34,
                          ((previewOnLeft ? rect.right - e.clientX : e.clientX - rect.left) / rect.width) * 100
                        )
                      )
                    );
                }}
                onPointerUp={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId))
                    e.currentTarget.releasePointerCapture(e.pointerId);
                }}
                onKeyDown={(e) => {
                  if (["ArrowLeft", "ArrowRight", "Home"].includes(e.key)) {
                    e.preventDefault();
                    setSplitRatio((r) =>
                      e.key === "Home"
                        ? 43
                        : Math.max(
                            34,
                            Math.min(60, r + (e.key === "ArrowLeft" ? -2 : 2) * (previewOnLeft ? -1 : 1))
                          )
                    );
                  }
                }}
              >
                <span className="h-12 w-1 rounded bg-ink-200" />
              </div>
            )}
            {pane === "preview" && editorMode !== "content" && (
              <div
                className={cx(
                  "editor-preview preview-canvas min-w-0 rounded-[26px]",
                  editorMode === "preview" && "mx-auto max-w-5xl"
                )}
                data-testid="live-preview"
              >
                <ResumePreview resume={resume} onLayout={setLivePages}
                  tools={
                    <>
                      {editorMode === "layout" && (
                        <Btn
                          size="sm"
                          variant="ghost"
                          disabled={!previewLocation}
                          onClick={() => {
                            if (previewLocation)
                              setPreviewLocation({
                                ...previewLocation,
                                scroll: true,
                                requestId: ++navigationId.current,
                              });
                          }}
                        >
                          {t("定位预览", "Locate")}
                        </Btn>
                      )}
                      {editorMode === "layout" && (
                        <Btn
                          size="sm"
                          variant="ghost"
                          aria-pressed={previewOnLeft}
                          title={
                            previewOnLeft
                              ? t("将内容放到左侧、预览放到右侧", "Put editor on left, preview on right")
                              : t("将预览放到左侧、内容放到右侧", "Put preview on left, editor on right")
                          }
                          onClick={swapPanes}
                        >
                          {t("切换左右", "Swap Panes")}
                        </Btn>
                      )}
                      <Btn size="sm" variant="ghost" onClick={() => { setSettingsTab('template'); setSettingsOpen(true); }}>{t("模板与版式", "Templates")}</Btn>
                      <Btn size="sm" variant="ghost" onClick={() => setOnePageOpen(true)}>{t("篇幅调整", "Fit Pages")}</Btn>
                    </>
                  }
                  location={previewLocation}
                  onLocate={(sectionId, blockId) => locate(sectionId, blockId, true)} />
              </div>
            )}
            </Fragment>)}
          </div>
        </main>

        {rightOpen && (
          <aside className="soft-panel fixed bottom-0 right-0 top-0 z-40 flex min-h-0 w-[360px] max-w-[90vw] flex-col shadow-2xl lg:static lg:z-auto lg:w-auto lg:max-w-none lg:rounded-[22px] lg:shadow-none">
            <div className="flex items-center justify-between px-3.5 pt-3">
              <div className="liquid-glass relative flex flex-1 rounded-full p-0.5">
                {(
                  [
                    ["ai", t("AI 建议", "AI Polish"), <IconSpark key="a" size={13} />],
                    ["jd", t("JD 匹配", "JD Match"), <IconTarget key="j" size={13} />],
                  ] as const
                ).map(([k, label, icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setPanelTab(k)}
                    className={cx(
                      "flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[12.5px] transition-all",
                      panelTab === k
                        ? "glass-lens font-semibold"
                        : "text-ink-500 hover:text-ink-900"
                    )}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="ml-2 shrink-0 rounded-full px-2.5 py-1 text-[12px] text-ink-500 transition hover:bg-surface hover:text-ink-900"
                aria-label={t("关闭 AI 与 JD 面板", "Close panel")}
                onClick={() => setRightOpen(false)}
              >
                {t("收起", "Close")}
              </button>
            </div>
            <div className="min-h-0 flex-1">
              {panelTab === "ai" ? (
                <AIPanel
                  resume={resume}
                  activeTarget={activeTarget}
                  onLocate={locate}
                />
              ) : (
                <>
                  {resume.target && app.jds[resumeId] && <div className="border-b border-line p-3 text-[13px]">
                    <p className="mb-2 text-ink-600">{hasReviewedTarget(resume, app.jds[resumeId], app.snapshots) ? '当前内容与岗位已核对' : app.snapshots.some(s => s.resume_id === resumeId && s.label === '岗位内容已核对') ? '内容或岗位有新修改，请重新核对' : '核对相关经历后，可记录本次确认'}</p>
                    {!hasReviewedTarget(resume, app.jds[resumeId], app.snapshots) && <Btn size="sm" onClick={() => app.captureSnapshot(resumeId, '岗位内容已核对', 'manual')}>确认岗位内容已核对</Btn>}
                  </div>}
                  <JDPanel resume={resume} onLocate={locate} />
                </>
              )}
            </div>
          </aside>
        )}
      </div>

      {onePageOpen && <OnePageDialog resume={resume} onClose={() => setOnePageOpen(false)} onEdit={(sectionId, blockId) => locate(sectionId, blockId)} />}
      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        width="max-w-4xl"
      >
        <ModalHeader
          title={t("简历设置", "Resume Settings")}
          onClose={() => setSettingsOpen(false)}
        />
        <div className="grid h-[min(68vh,500px)] grid-cols-1 grid-rows-[auto_minmax(0,1fr)] gap-4 px-5 pb-5 md:grid-cols-[160px_minmax(0,1fr)] md:grid-rows-1">
          {/* 左侧分类导航（窄屏自动转为顶部水平胶囊） */}
          <div
            className="flex gap-1 overflow-x-auto rounded-2xl bg-subtle/80 p-1.5 md:flex-col md:overflow-visible"
            role="tablist"
            onKeyDown={navigateTabs}
            aria-label={t("简历设置分类", "Settings categories")}
          >
            {(
              [
                ["template", t("模板", "Templates"), <IconLayout size={15} />],
                ["style", t("外观", "Style"), <IconPalette size={15} />],
                ["layout", t("排版", "Layout"), <IconType size={15} />],
                ["document", t("文档", "Document"), <IconFile size={15} />],
              ] as const
            ).map(([id, label, icon]) => (
              <button
                key={id}
                role="tab"
                aria-selected={settingsTab === id}
                tabIndex={settingsTab === id ? 0 : -1}
                className={cx(
                  "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-all md:w-full",
                  settingsTab === id
                    ? "glass-lens font-semibold text-ink-900"
                    : "text-ink-500 hover:bg-surface/60 hover:text-ink-900"
                )}
                onClick={() => setSettingsTab(id)}
              >
                <span className="shrink-0 opacity-80">{icon}</span>
                <span>{label}</span>
              </button>
            ))}
          </div>

          {/* 右侧固定高度内容舞台（切换 Tab 零高度/宽度跳动） */}
          <div className="min-h-0 overflow-y-auto pr-1" role="tabpanel">
            {settingsTab === "template" ? (
              <div className="flex flex-col gap-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div
                    className="liquid-glass inline-flex items-center gap-0.5 rounded-full p-1"
                    role="radiogroup"
                    aria-label={t("模板适用语言", "Template language group")}
                  >
                    {(
                      [
                        ["all", t("全部模板", "All")],
                        ["zh", t("中文推荐", "Chinese")],
                        ["en", t("英文 · 海外推荐", "English / Global")],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={tplGroup === id}
                        onClick={() => setTplGroup(id)}
                        className={cx(
                          "rounded-full px-3 py-1 text-[12px] font-medium transition-all",
                          tplGroup === id
                            ? "glass-lens text-ink-900"
                            : "text-ink-500 hover:text-ink-900"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11.5px] text-ink-400">
                    {resume.locale === "en"
                      ? t("当前为英文版式 · 优先推荐 LaTeX 极简 / 经典 ATS", "English layout · LaTeX Minimal & Classic ATS recommended")
                      : t("当前为中文版式 · 可按求职场景自由切换", "Chinese layout · Switch freely for any role")}
                  </span>
                </div>
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {TEMPLATES.filter((tpl) => {
                    if (tplGroup === "all") return true;
                    return (
                      tpl.recommendedLocale === tplGroup ||
                      tpl.recommendedLocale === "both"
                    );
                  }).map((tpl) => {
                    const selected = resume.template_id === tpl.template_id;
                    const localeTag =
                      tpl.recommendedLocale === "en"
                        ? { label: t("英文推荐", "EN"), cls: "resume-badge-target" }
                        : tpl.recommendedLocale === "both"
                          ? { label: t("中英通用", "ZH/EN"), cls: "resume-badge-master" }
                          : { label: t("中文推荐", "ZH"), cls: "bg-subtle text-ink-600" };
                    return (
                      <button
                        key={tpl.template_id}
                        type="button"
                        aria-pressed={selected}
                        className={cx(
                          "group flex flex-col overflow-hidden rounded-2xl text-left transition-all hover:-translate-y-0.5",
                          selected
                            ? "soft-panel ring-2 ring-brand-500/70"
                            : "soft-panel hover:shadow-md"
                        )}
                        onClick={() => app.setTemplate(resumeId, tpl.template_id)}
                      >
                        <ResumeThumbnail
                          resume={{ ...resume, template_id: tpl.template_id }}
                        />
                        <div className="flex flex-1 flex-col p-3">
                          <div className="flex items-center justify-between gap-1.5">
                            <p className="truncate text-[13.5px] font-semibold text-ink-900">
                              {templateNameLabel(tpl.template_id, tpl.name, uiLang)}
                            </p>
                            {selected ? (
                              <span className="chip shrink-0 rounded-full bg-brand-600 text-white">
                                {t("当前使用", "Active")}
                              </span>
                            ) : (
                              <span className={cx("chip shrink-0 rounded-full px-2 py-0 text-[10.5px] font-medium", localeTag.cls)}>
                                {localeTag.label}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">
                            {uiLang === "en" ? tpl.descriptionEn : tpl.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid min-h-full gap-5 md:grid-cols-[minmax(0,1fr)_224px]">
                {/* 左栏：配置项 */}
                <div className="flex flex-col gap-4">
                  {settingsTab === "document" && (
                    <div className="soft-panel flex flex-col gap-4 rounded-2xl p-4">
                      <div className="text-[13px] text-ink-600">
                        <span className="mb-1.5 block font-medium">{t("求职场景", "Career Stage")}</span>
                        <GlassSelect
                          ariaLabel={t("求职场景", "Career stage")}
                          className="w-full"
                          value={resume.audience ?? "experienced"}
                          onChange={(v) =>
                            app.setResumeOptions(resumeId, {
                              audience: v as Resume["audience"],
                            })
                          }
                          options={Object.entries(AUDIENCE_LABELS).map(([id, label]) => ({
                            value: id,
                            label: audienceLabel(id, label, uiLang),
                          }))}
                        />
                      </div>
                      <div className="text-[13px] text-ink-600">
                        <span className="mb-1.5 block font-medium">{t("版式语言", "Resume Language")}</span>
                        <GlassSelect
                          ariaLabel={t("版式语言", "Resume language")}
                          className="w-full"
                          value={resume.locale ?? "zh"}
                          onChange={(v) =>
                            app.setResumeOptions(resumeId, {
                              locale: v as Resume["locale"],
                            })
                          }
                          options={[
                            { value: "zh", label: t("中文", "Chinese") },
                            { value: "en", label: t("英文版式", "English") },
                          ]}
                        />
                      </div>
                    </div>
                  )}
                  {settingsTab === "style" && (
                    <div className="soft-panel flex flex-col gap-2 rounded-2xl p-4">
                      {resume.template_id !== "classic_ats" && (
                        <MenuSection title={t("主题色", "Accent Color")}>
                          <div className="flex flex-wrap items-center gap-2 px-1">
                            {THEME_COLORS.map((c) => (
                              <button
                                key={c}
                                onClick={() =>
                                  app.setTheme(resumeId, { primary_color: c })
                                }
                                className={cx(
                                  "relative flex h-6 w-6 items-center justify-center rounded-full transition hover:scale-110",
                                  resume.theme.primary_color === c
                                    ? "ring-2 ring-offset-1 ring-ink-900"
                                    : "ring-1 ring-ink-200 hover:ring-ink-400"
                                )}
                                style={{ background: c }}
                                aria-label={`${t("主题色", "Accent")} ${c}`}
                              >
                                {resume.theme.primary_color === c && (
                                  <IconCheck size={12} className="text-white" />
                                )}
                              </button>
                            ))}
                            <label
                              className="relative flex h-6 w-6 cursor-pointer items-center justify-center rounded-full ring-1 ring-ink-200 transition hover:ring-ink-400"
                              title={t("自定义主题色", "Custom color")}
                            >
                              <input
                                type="color"
                                value={resume.theme.primary_color}
                                onChange={(e) =>
                                  app.setTheme(resumeId, {
                                    primary_color: e.target.value,
                                  })
                                }
                                className="absolute inset-0 cursor-pointer opacity-0"
                                aria-label={t("自定义主题色", "Custom accent color")}
                              />
                              <div className="h-3.5 w-3.5 rounded-full bg-gradient-to-br from-red-400 via-green-400 to-blue-400" />
                            </label>
                          </div>
                          {contrastOnWhite(resume.theme.primary_color) < 4.5 && (
                            <p className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-amber-500/12 px-2.5 py-1.5 text-[11.5px] text-amber-700">
                              <span>
                                {t(
                                  "当前主题色在白纸上对比度偏低，打印或阅读可能不够清晰",
                                  "Low contrast on white paper — consider a darker accent"
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  app.setTheme(resumeId, { primary_color: "#4338CA" })
                                }
                                className="shrink-0 font-semibold underline underline-offset-2"
                              >
                                {t("改用深靛蓝", "Use Indigo")}
                              </button>
                            </p>
                          )}
                        </MenuSection>
                      )}

                      <MenuSection title={t("字号", "Font Size")}>
                        <div className="liquid-glass relative flex gap-1 rounded-full p-1">
                          {[13, 14, 15].map((n) => (
                            <button
                              key={n}
                              onClick={() => app.setTheme(resumeId, { font_size: n })}
                              className={cx(
                                "flex-1 rounded-full px-2 py-1 font-mono text-[12px] font-semibold transition-all",
                                resume.theme.font_size === n
                                  ? "glass-lens"
                                  : "text-ink-500 hover:text-ink-900"
                              )}
                            >
                              {n}px
                            </button>
                          ))}
                        </div>
                      </MenuSection>

                      <MenuSection title={t("字体", "Font Family")}>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(
                            [
                              ["sans", t("黑体", "Sans")],
                              ["serif", t("宋体", "Serif")],
                              ["system", t("系统", "System")],
                              ["kai", t("楷体", "Kai")],
                              ["mono", t("等宽", "Mono")],
                              ["fangsong", t("仿宋", "FangSong")],
                            ] as const
                          ).map(([k, label]) => (
                            <button
                              key={k}
                              onClick={() =>
                                app.setTheme(resumeId, { font_family: k })
                              }
                              className={cx(
                                "rounded-xl px-2 py-1.5 text-[12px] font-medium transition-all",
                                (resume.theme.font_family ?? "sans") === k
                                  ? "glass-lens font-semibold"
                                  : "bg-surface/70 text-ink-500 hover:text-ink-900"
                              )}
                              title={`${t("字体", "Font")}: ${label}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </MenuSection>
                    </div>
                  )}
                  {settingsTab === "layout" && (
                    <div className="soft-panel flex flex-col gap-2 rounded-2xl p-4">
                      <MenuSection title={t("纸张密度", "Page Density")}>
                        <div className="liquid-glass relative flex gap-1 rounded-full p-1">
                          {(
                            [
                              ["compact", t("紧凑", "Compact")],
                              ["medium", t("中等", "Balanced")],
                              ["loose", t("宽松", "Airy")],
                            ] as const
                          ).map(([k, label]) => (
                            <button
                              key={k}
                              aria-pressed={(resume.theme.density ?? "medium") === k}
                              onClick={() => app.setTheme(resumeId, { density: k })}
                              className={cx(
                                "flex-1 rounded-full px-2 py-1 text-[12px] font-medium transition-all",
                                (resume.theme.density ?? "medium") === k
                                  ? "glass-lens font-semibold"
                                  : "text-ink-500 hover:text-ink-900"
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 text-[12px] text-ink-500">
                          {t("调整预览与导出中的间距和行高。", "Adjust spacing and line height for preview & export.")}
                        </p>
                        <Btn size="sm" className="mt-2" onClick={() => { setSettingsOpen(false); setOnePageOpen(true); }}>
                          {t("智能调整为 1 / 2 页", "Smart Fit 1 / 2 Pages")}
                        </Btn>
                      </MenuSection>
                      {resume.template_id !== "classic_ats" && (
                        <MenuSection title={t("条目标题排布", "Entry Header Layout")}>
                          <div className="liquid-glass relative flex gap-1 rounded-full p-1">
                            {(
                              [
                                ["row", t("标题 · 日期同行", "Title & Date Inline")],
                                ["stack", t("日期另起一行", "Date on New Line")],
                              ] as const
                            ).map(([k, label]) => (
                              <button
                                key={k}
                                onClick={() =>
                                  app.setTheme(resumeId, { header_layout: k })
                                }
                                className={cx(
                                  "flex-1 rounded-full px-2 py-1 text-[12px] font-medium transition-all",
                                  (resume.theme.header_layout ?? "row") === k
                                    ? "glass-lens font-semibold"
                                    : "text-ink-500 hover:text-ink-900"
                                )}
                                title={
                                  k === "row"
                                    ? t("标题居左，日期居右", "Title left, date right")
                                    : t("标题居上，日期与地点居下", "Title above, date below")
                                }
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </MenuSection>
                      )}

                      {resume.template_id === "academic_photo" && (
                        <MenuSection title={t("头像大小", "Photo Scale")}>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min={0.5}
                              max={2}
                              step={0.1}
                              value={resume.theme.avatar_scale ?? 1}
                              onChange={(e) =>
                                app.setTheme(resumeId, {
                                  avatar_scale: Number(e.target.value),
                                })
                              }
                              className="h-1 min-w-0 flex-1 accent-brand-600"
                              aria-label={t("头像显示比例", "Photo scale")}
                            />
                            <span className="w-10 shrink-0 text-right font-mono text-[12px] text-ink-500">
                              {(resume.theme.avatar_scale ?? 1).toFixed(1)}×
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] leading-snug text-ink-400">
                            {t("基于 1 寸照（25×35mm）基准按比例缩放，0.5×–2.0×；未上传头像时无效。", "Scales from 25×35mm base (0.5×–2.0×).")}
                          </p>
                        </MenuSection>
                      )}

                      <MenuSection title={t("要点列表", "Bullet Style")}>
                        <p className="rounded-xl bg-surface/70 px-3 py-2 text-[12px] leading-snug text-ink-500">
                          {t(
                            "按模块设置：在中间栏各模块的「要点」编辑区右上角切换符号样式，每条要点可点行首符号单独开关。",
                            "Per-section: switch bullet style in the top-right of each section's bullet list."
                          )}
                        </p>
                      </MenuSection>
                    </div>
                  )}
                </div>

                {/* 右栏：实时 A4 缩略预览（所见即所得，同时稳定模态框视觉重心） */}
                <aside className="hidden flex-col gap-2.5 md:flex">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[12px] font-medium text-ink-500">
                      {t("实时效果", "Live Preview")}
                    </span>
                    <span className="truncate text-[11.5px] text-ink-400">
                      {templateNameLabel(
                        resume.template_id,
                        TEMPLATES.find((tpl) => tpl.template_id === resume.template_id)?.name ?? "",
                        uiLang
                      )}
                    </span>
                  </div>
                  <div className="soft-panel overflow-hidden rounded-2xl p-2">
                    <ResumeThumbnail
                      resume={resume}
                      className="h-[320px] rounded-xl border-0"
                    />
                  </div>
                </aside>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 添加自定义栏目 */}
      <Modal
        open={addSecOpen}
        onClose={() => setAddSecOpen(false)}
        width="max-w-sm"
      >
        <ModalHeader
          title={t("添加自定义栏目", "Add Custom Section")}
          sub={t("自定义栏目可重命名、调整位置，并参与预览与导出", "Rename, reorder, and export alongside standard sections")}
          onClose={() => setAddSecOpen(false)}
        />
        <div className="px-5 pb-5">
          <input
            autoFocus
            className="field-input"
            placeholder={t("如：开源贡献 / 发表作品 / 语言能力", "e.g., Open Source / Publications / Languages")}
            value={newSecTitle}
            onChange={(e) => setNewSecTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSecTitle.trim()) {
                app.addSection(resumeId, newSecTitle.trim(), newSecStructure);
                setNewSecTitle("");
                setAddSecOpen(false);
                app.toast("ok", t("栏目已添加", "Section added"));
              }
            }}
          />
          <div className="mt-3 block text-[13px] text-ink-600">
            <span className="mb-1.5 block font-medium">{t("内容结构", "Structure")}</span>
            <GlassSelect
              ariaLabel={t("自定义栏目内容结构", "Section structure")}
              className="w-full"
              value={newSecStructure}
              onChange={(v) => setNewSecStructure(v as Block["type"])}
              options={[
                { value: "summary", label: t("文本", "Paragraph") },
                { value: "custom_text", label: t("列表", "Bullet List") },
                { value: "work_experience_item", label: t("经历（含角色与时间）", "Timeline Entry (Role & Dates)") },
              ]}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Btn variant="ghost" onClick={() => setAddSecOpen(false)}>
              {t("取消", "Cancel")}
            </Btn>
            <Btn
              variant="primary"
              disabled={!newSecTitle.trim()}
              onClick={() => {
                app.addSection(resumeId, newSecTitle.trim(), newSecStructure);
                setNewSecTitle("");
                setAddSecOpen(false);
                app.toast("ok", t("栏目已添加", "Section added"));
              }}
            >
              {t("添加", "Add")}
            </Btn>
          </div>
        </div>
      </Modal>

      {previewOpen && (
        <ExportDialog
          resume={resume}
          onClose={() => setPreviewOpen(false)}
          onLocate={locate}
          onAdjustLayout={() => { setPreviewOpen(false); setOnePageOpen(true); }}
          onRecordApplication={() => { setPreviewOpen(false); setApplicationOpen(true); }}
        />
      )}
      {tool && (
        <WorkflowDialog
          key={tool}
          tool={tool}
          resume={resume}
          onClose={() => setTool(null)}
          onAIStart={(sectionId, blockId) => {
            openRightPanel("ai");
            setActiveTarget({ sectionId, blockId });
          }}
        />
      )}
      {applicationOpen && (
        <ApplicationForm
          resumeId={resumeId}
          onClose={() => setApplicationOpen(false)}
        />
      )}
    </div>
  );
}
