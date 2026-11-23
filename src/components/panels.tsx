import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  AIAction,
  Block,
  MatchReport,
  ModelProvider,
  Resume,
  Section,
  Suggestion,
} from "../types";
import { ACTION_LABELS, SECTION_LABELS } from "../types";
import { cx, diffInlineTokens, diffLines, fmtTime, stripHtml, timeAgo } from "../lib/utils";
import { actionLabel, useT, useUiLang } from "../lib/i18n";
import { useApp, useAppSlice } from "../lib/store";
import {
  matchResumeData,
  parseJD,
  parseJDSemantically,
  jdEvidence,
  qualificationEvidence,
  type JDStructuredSemantic,
} from "../lib/jd";
import {
  auditResume,
  enhanceAuditWithAI,
  type AuditAISuggestion,
  type AuditCategory,
  type AuditReport,
} from "../lib/audit";
import { selectProvider } from "../lib/ai";
import { SAMPLE_JD_TEXT } from "../lib/samples";
import { blockContent } from "../lib/backup";
import { Btn, Empty, ScoreBar, ScoreRing } from "./ui";
import {
  IconCheck,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconGrip,
  IconRefresh,
  IconSpark,
  IconTarget,
  IconWand,
  IconX,
  IconAlert,
  IconLock,
  IconPlus,
} from "./icons";

/* ================= 左侧大纲（可拖拽排序） ================= */

function OutlineItem({
  section,
  resumeId,
  active,
}: {
  section: Section;
  resumeId: string;
  active?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.section_id });
  const toggleSection = useApp((s) => s.toggleSection);
  const t = useT();
  // 点击标题跳转到中栏对应模块卡；scrollIntoView 沿最近的滚动容器（中栏 main）滚动
  const scrollToSection = () => {
    document
      .querySelector<HTMLElement>(`[data-section-id="${section.section_id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cx(
        "group flex items-center gap-1.5 rounded-xl px-2 py-1.5 transition-all duration-150",
        isDragging
          ? "z-10 bg-brand-50 shadow-lg shadow-brand-900/10 ring-1 ring-brand-400/50"
          : active && section.visible
          ? "bg-brand-50"
          : "hover:bg-surface/80",
        !section.visible && "opacity-45"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className={cx(
          "cursor-grab touch-none transition active:cursor-grabbing",
          active && section.visible
            ? "text-brand-500"
            : "text-ink-500 hover:text-ink-600"
        )}
        aria-label={t("拖动排序", "Drag to reorder")}
      >
        <IconGrip size={14} />
      </button>
      <button
        type="button"
        onClick={scrollToSection}
        title={t("点击跳转到该模块", "Jump to section")}
        className={cx(
          "min-w-0 flex-1 truncate rounded text-left text-[12.5px] transition-colors hover:text-brand-700",
          section.visible
            ? active
              ? "font-bold text-brand-800"
              : "font-medium text-ink-800"
            : "text-ink-400 line-through decoration-ink-300"
        )}
      >
        {section.title}
      </button>
      <span className="font-mono text-[12px] text-ink-500">
        {section.type === "basic_info" ? "" : section.blocks.length}
      </span>
      <button
        className="tool-btn h-6 w-6 opacity-0 transition group-hover:opacity-100"
        onClick={() => toggleSection(resumeId, section.section_id)}
        aria-label={t("显示/隐藏", "Show / hide")}
      >
        {section.visible ? <IconEye size={12} /> : <IconEyeOff size={12} />}
      </button>
    </li>
  );
}

export function OutlinePanel({
  resume,
  activeId,
  onAdd,
}: {
  resume: Resume;
  activeId?: string | null;
  onAdd?: () => void;
}) {
  const reorderSections = useApp((s) => s.reorderSections);
  const toast = useApp((s) => s.toast);
  const t = useT();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );
  const sections = [...resume.data.sections].sort((a, b) => a.order - b.order);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = sections.findIndex((s) => s.section_id === active.id);
    const newIdx = sections.findIndex((s) => s.section_id === over.id);
    const next = arrayMove(sections, oldIdx, newIdx).map((s) => s.section_id);
    reorderSections(resume.id, next);
    const moved = sections[oldIdx];
    toast(
      "ok",
      t(
        `「${moved.title}」已移动到第 ${newIdx + 1} 位，顺序已自动保存`,
        `Moved "${moved.title}" to position ${newIdx + 1} (auto-saved)`
      )
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 pb-2 pt-3">
        <h2 className="text-[12px] font-bold text-ink-400">
          {t("栏目目录", "Outline")}
        </h2>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-ink-600 transition hover:bg-surface"
          >
            <IconPlus size={12} />
            {t("添加栏目", "Add Section")}
          </button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.section_id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="flex flex-col gap-0.5 px-1.5 pb-3">
            {sections.map((s) => (
              <OutlineItem
                key={s.section_id}
                section={s}
                resumeId={resume.id}
                active={activeId === s.section_id}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

/* ================= AI 建议面板 ================= */

function FieldDiff({
  label,
  from,
  to,
}: {
  label: string;
  from: string;
  to: string;
}) {
  if (from === to) return null;
  return (
    <div className="rounded-lg bg-surface px-2.5 py-1.5 text-[12px]">
      <span className="mr-2 font-mono text-[12px] uppercase tracking-wide text-ink-500">
        {label}
      </span>
      {from && (
        <span className="text-ink-400 line-through decoration-danger-600/50">
          {from}
        </span>
      )}
      {from && to && <span className="mx-1.5 text-ink-500">→</span>}
      <span className="font-medium text-brand-700">{to || "（删除）"}</span>
    </div>
  );
}

function InlineTokenDiffText({
  from,
  to,
}: {
  from: string;
  to: string;
}) {
  const ops = useMemo(() => diffInlineTokens(from, to), [from, to]);
  return (
    <span className="leading-relaxed break-words">
      {ops.map((op, idx) =>
        op.kind === "same" ? (
          <span key={idx} className="text-ink-800">
            {op.text}
          </span>
        ) : op.kind === "del" ? (
          <del
            key={idx}
            className="mx-0.5 rounded bg-danger-100/75 px-1 py-0.5 text-danger-700/80 line-through decoration-danger-600/60"
          >
            {op.text}
          </del>
        ) : (
          <ins
            key={idx}
            className="mx-0.5 rounded bg-brand-500/14 px-1 py-0.5 font-semibold text-brand-700 no-underline ring-1 ring-brand-500/25"
          >
            {op.text}
          </ins>
        )
      )}
    </span>
  );
}

function BulletsDiff({
  from,
  to,
  excludedIndices,
  onToggleIndex,
  interactive,
}: {
  from: string[];
  to: string[];
  excludedIndices?: ReadonlySet<number>;
  onToggleIndex?: (index: number) => void;
  interactive?: boolean;
}) {
  const t = useT();
  const a = from.filter(Boolean);
  const b = to.filter(Boolean);

  // 当条数一致或常见 1 对 1 润色/改写/扩写时，使用行内词级高亮对比卡片 + 折叠未改动项
  if (a.length > 0 && b.length > 0 && Math.abs(a.length - b.length) <= 2) {
    const maxLen = Math.max(a.length, b.length);
    const items = Array.from({ length: maxLen }, (_, idx) => {
      const orig = a[idx] ?? "";
      const next = b[idx] ?? "";
      const changed = stripHtml(orig).trim() !== stripHtml(next).trim();
      return { idx, orig, next, changed };
    });
    const changedItems = items.filter((it) => it.changed);
    const unchangedItems = items.filter((it) => !it.changed);

    return (
      <div className="flex flex-col gap-2">
        {changedItems.map(({ idx, orig, next }) => {
          const checked = !excludedIndices?.has(idx);
          return (
            <div
              key={idx}
              className={cx(
                "rounded-xl p-2.5 text-[12px] transition-all",
                checked
                  ? "bg-surface shadow-2xs ring-1 ring-brand-500/25"
                  : "bg-subtle/60 opacity-60 ring-1 ring-ink-900/6"
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  className={cx(
                    "inline-flex items-center gap-1.5 text-[11px] font-semibold",
                    interactive ? "cursor-pointer" : "",
                    checked ? "text-brand-700" : "text-ink-400"
                  )}
                >
                  {interactive && onToggleIndex && (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggleIndex(idx)}
                      className="h-3.5 w-3.5 rounded accent-brand-600"
                      aria-label={t(`采纳第 ${idx + 1} 条修改`, `Include bullet #${idx + 1}`)}
                    />
                  )}
                  <span>
                    {t(`要点 #${idx + 1}`, `Bullet #${idx + 1}`)}
                    {!orig
                      ? t(" · 新增", " · Added")
                      : !next
                        ? t(" · 删除", " · Removed")
                        : t(" · 已优化", " · Refined")}
                  </span>
                </label>
                {interactive && (
                  <span className="text-[10.5px] text-ink-400">
                    {checked ? t("已勾选采纳", "Selected") : t("保留原句", "Keep original")}
                  </span>
                )}
              </div>
              <div className="text-[12px] leading-relaxed">
                {checked ? (
                  <InlineTokenDiffText from={orig} to={next} />
                ) : (
                  <span className="text-ink-500">{stripHtml(orig)}</span>
                )}
              </div>
            </div>
          );
        })}

        {unchangedItems.length > 0 && (
          <details className="rounded-xl bg-subtle/70 px-2.5 py-1.5 text-[11.5px] text-ink-500">
            <summary className="cursor-pointer select-none font-medium text-ink-500 hover:text-ink-700">
              {t(
                `其余 ${unchangedItems.length} 条要点未改动（点击展开）`,
                `${unchangedItems.length} unchanged bullet(s) (click to expand)`
              )}
            </summary>
            <ul className="mt-1.5 flex flex-col gap-1 border-t border-line pt-1.5">
              {unchangedItems.map(({ idx, orig }) => (
                <li key={idx} className="text-[11.5px] leading-relaxed text-ink-500">
                  <span className="mr-1.5 font-mono text-[11px] text-ink-400">
                    #{idx + 1}
                  </span>
                  {stripHtml(orig)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    );
  }

  const ops = diffLines(a, b);
  return (
    <ul className="flex flex-col gap-1">
      {ops.map((op, i) => (
        <li
          key={i}
          className={cx(
            "rounded-lg px-2.5 py-1.5 text-[12px] leading-relaxed",
            op.kind === "same" && "bg-surface text-ink-600",
            op.kind === "add" && "bg-brand-50 text-brand-800 ring-1 ring-brand-200/60",
            op.kind === "del" &&
              "bg-danger-100/50 text-ink-400 line-through decoration-danger-600/40"
          )}
        >
          <span
            className={cx(
              "mr-1.5 font-mono text-[12px]",
              op.kind === "add"
                ? "text-brand-600"
                : op.kind === "del"
                ? "text-danger-600"
                : "text-ink-500"
            )}
          >
            {op.kind === "add" ? "+" : op.kind === "del" ? "−" : "·"}
          </span>
          {op.text}
        </li>
      ))}
    </ul>
  );
}

const STATUS_CHIP: Record<string, { text: string; en: string; cls: string }> = {
  generating: { text: "生成中", en: "Generating", cls: "bg-seal-100 text-seal-700" },
  success: {
    text: "待确认",
    en: "Pending",
    cls: "bg-brand-50 text-brand-700 ring-1 ring-brand-200",
  },
  failed: { text: "失败", en: "Failed", cls: "bg-danger-100 text-danger-700" },
  accepted: { text: "已接受", en: "Accepted", cls: "bg-brand-600 text-white" },
  edited_accepted: { text: "编辑后接受", en: "Edited & Accepted", cls: "bg-brand-100 text-brand-800" },
  rejected: { text: "已拒绝", en: "Rejected", cls: "bg-paper-200 text-ink-400" },
};

const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  timeline_gap: "时间线断层",
  repeated_verb: "动词重复",
  cjk_spacing: "中英空格",
  missing_metric: "量化指标",
};

function providerHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url || "外部服务";
  }
}

function locateBlockInEditor(sectionId: string, blockId?: string) {
  const target =
    (blockId
      ? document.querySelector<HTMLElement>(`[data-block-id="${blockId}"]`)
      : null) ||
    document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus?.({ preventScroll: true });
  }
}

function ExternalConfirmModal({
  provider,
  dataSummary,
  onConfirm,
  onCancel,
}: {
  provider: ModelProvider | null;
  dataSummary: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!provider) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="anim-fade-in absolute inset-0 bg-ink-950/55"
        onClick={onCancel}
      />
      <div className="anim-scale-in relative w-full max-w-sm rounded-xl bg-paper-25 p-5 shadow-2xl ring-1 ring-ink-900/10">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-seal-100 text-seal-600">
            <IconAlert size={17} />
          </span>
          <div>
            <h3 className="text-[15px] font-bold text-ink-900">
              即将调用外部模型
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
              继续将把
              <strong className="text-ink-800">{dataSummary}</strong>
              发送到外部服务
              <strong className="text-ink-800">「{provider.name}」</strong>（
              {providerHost(provider.base_url)}
              ）进行处理。本次确认仅授权当前请求。
            </p>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onCancel}>
            取消，保持本地
          </Btn>
          <Btn variant="seal" onClick={onConfirm}>
            确认发送
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function AIPanel({
  resume,
  activeTarget,
  onLocate,
}: {
  resume: Resume;
  activeTarget: { sectionId: string; blockId: string } | null;
  onLocate?: (sectionId: string, blockId?: string) => void;
}) {
  const {
    suggestions,
    requestSuggestion,
    acceptSuggestion,
    rejectSuggestion,
    pendingExternal,
    confirmExternal,
    cancelSuggestion,
    undoSuggestion,
    queuedSuggestionCount,
    models,
    privacy,
    toast,
  } = useAppSlice(
    "suggestions",
    "requestSuggestion",
    "acceptSuggestion",
    "rejectSuggestion",
    "pendingExternal",
    "confirmExternal",
    "cancelSuggestion",
    "undoSuggestion",
    "queuedSuggestionCount",
    "models",
    "privacy",
    "toast"
  );
  const uiLang = useUiLang();
  const t = useT();
  const [panelMode, setPanelMode] = useState<"suggestions" | "audit">(
    "suggestions"
  );
  const [auditState, setAuditState] = useState<{
    report: AuditReport;
    data: Resume["data"];
  } | null>(null);
  const [auditFilter, setAuditFilter] = useState<AuditCategory | "all">("all");
  const [auditAI, setAuditAI] = useState<{
    loading: boolean;
    suggestions: AuditAISuggestion[];
    providerName?: string;
    error?: string;
  }>({ loading: false, suggestions: [] });
  const [auditPendingProvider, setAuditPendingProvider] =
    useState<ModelProvider | null>(null);

  const auditReport =
    auditState?.data === resume.data ? auditState.report : null;

  const runAudit = () => {
    const report = auditResume(resume);
    setAuditState({ report, data: resume.data });
    setAuditAI({ loading: false, suggestions: [] });
    toast(
      report.total ? "info" : "ok",
      report.total
        ? `体检完成：发现 ${report.total} 项可优化处`
        : "体检完成：未发现明显规则问题"
    );
  };

  const runAuditAI = async (confirmedExternal = false) => {
    const report = auditReport ?? auditResume(resume);
    if (!auditReport) setAuditState({ report, data: resume.data });
    const sel = selectProvider(models, privacy);
    if (sel.kind === "rules") {
      toast(
        "info",
        "当前未启用可用模型，已保留本地规则体检结果；可在「模型」页启用本地或外部模型。"
      );
      return;
    }
    if (sel.kind === "confirm_external" && !confirmedExternal) {
      setAuditPendingProvider(sel.provider);
      return;
    }
    setAuditPendingProvider(null);
    setAuditAI((s) => ({ ...s, loading: true, error: undefined }));
    const res = await enhanceAuditWithAI(resume, report, {
      models,
      privacy,
      confirmedExternal,
    });
    if (res.usedAI) {
      setAuditAI({
        loading: false,
        suggestions: res.suggestions,
        providerName: res.providerName,
      });
      toast("ok", `AI 深度体检建议已生成（${res.suggestions.length} 条）`);
    } else {
      setAuditAI({
        loading: false,
        suggestions: [],
        error: res.error,
      });
      if (res.error) toast("warn", res.error);
    }
  };

  const handleLocate = (sectionId: string, blockId?: string) => {
    if (onLocate) onLocate(sectionId, blockId);
    else locateBlockInEditor(sectionId, blockId);
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trustSession, setTrustSession] = useState(false);
  const [editing, setEditing] = useState(false);
  const [excludedBySug, setExcludedBySug] = useState<Record<string, number[]>>({});
  const [draft, setDraft] = useState<{
    title: string;
    subtitle: string;
    description: string;
    bullets: string;
  } | null>(null);

  const list = useMemo(
    () => suggestions.filter((s) => s.resume_id === resume.id),
    [suggestions, resume.id]
  );
  const active: Suggestion | undefined =
    (selectedId && list.find((s) => s.id === selectedId)) ||
    (activeTarget &&
      list.find((s) => !s.resolution && s.block_id === activeTarget.blockId)) ||
    list.find((s) => !s.resolution && s.status === "success") ||
    list[0];

  const excludedSet = useMemo(
    () => new Set(active ? excludedBySug[active.id] ?? [] : []),
    [active, excludedBySug]
  );

  const toggleBulletIndex = (idx: number) => {
    if (!active) return;
    setExcludedBySug((prev) => {
      const cur = new Set(prev[active.id] ?? []);
      if (cur.has(idx)) cur.delete(idx);
      else cur.add(idx);
      return { ...prev, [active.id]: Array.from(cur) };
    });
  };

  const buildMergedSuggested = (s: Suggestion): Block | undefined => {
    if (!s.suggested) return undefined;
    const exc = new Set(excludedBySug[s.id] ?? []);
    if (exc.size === 0) return s.suggested;
    const origBullets = s.original.bullets.filter(Boolean);
    const nextBullets = s.suggested.bullets.filter(Boolean);
    const maxLen = Math.max(origBullets.length, nextBullets.length);
    const mergedBullets: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      const val = exc.has(i) ? origBullets[i] : nextBullets[i];
      if (typeof val === "string" && val.trim()) {
        mergedBullets.push(val);
      }
    }
    return {
      ...s.suggested,
      bullets: mergedBullets,
    };
  };

  const blockTitle = active
    ? active.original.title ||
      active.original.description.slice(0, 16) ||
      t("该条目", "This entry")
    : "";

  const startEdit = (s: Suggestion) => {
    const base = buildMergedSuggested(s);
    if (!base) return;
    setEditing(true);
    setDraft({
      title: base.title,
      subtitle: base.subtitle,
      description: base.description,
      bullets: base.bullets.filter(Boolean).join("\n"),
    });
  };

  const acceptEdited = (s: Suggestion) => {
    if (!s.suggested || !draft) return;
    const edited: Block = {
      ...s.suggested,
      title: draft.title,
      subtitle: draft.subtitle,
      description: draft.description,
      bullets: draft.bullets.split("\n"),
    };
    if (!acceptSuggestion(s.id, edited)) return;
    setEditing(false);
    setDraft(null);
  };

  const accept = (s: Suggestion) => {
    const exc = excludedBySug[s.id] ?? [];
    const customBlock = exc.length > 0 ? buildMergedSuggested(s) : undefined;
    acceptSuggestion(s.id, customBlock);
  };

  return (
    <div className="flex h-full flex-col">
      {queuedSuggestionCount > 0 && (
        <p
          role="status"
          className="bg-brand-50 px-4 py-2 text-[12px] text-brand-700"
        >
          模块优化：还有 {queuedSuggestionCount}{" "}
          条等待生成；外部请求会逐条确认。
        </p>
      )}
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold text-ink-400">
          <IconWand size={13} className="text-brand-600" /> {t("AI 建议与体检", "AI & Audit")}
        </h2>
        <div className="flex items-center gap-1 rounded-lg bg-subtle p-0.5 text-[11.5px]">
          <button
            type="button"
            onClick={() => setPanelMode("suggestions")}
            className={cx(
              "rounded-md px-2 py-0.5 font-medium transition",
              panelMode === "suggestions"
                ? "bg-surface text-ink-900 shadow-xs"
                : "text-ink-500 hover:text-ink-800"
            )}
          >
            {t("模块建议", "Suggestions")} ({list.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setPanelMode("audit");
              if (!auditReport) runAudit();
            }}
            className={cx(
              "rounded-md px-2 py-0.5 font-medium transition",
              panelMode === "audit"
                ? "bg-surface text-ink-900 shadow-xs"
                : "text-ink-500 hover:text-ink-800"
            )}
          >
            {t("全简历体检", "Audit")}
          </button>
        </div>
      </div>

      {panelMode === "audit" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          <div className="mb-3 flex gap-2">
            <Btn variant="primary" className="h-8 flex-1" onClick={runAudit}>
              <IconRefresh size={12} /> {t("一键全简历体检", "Run Full Audit")}
            </Btn>
            <Btn
              variant="outline"
              className="h-8"
              disabled={auditAI.loading}
              onClick={() => runAuditAI(false)}
            >
              <IconSpark size={12} />{" "}
              {auditAI.loading ? t("分析中…", "Analyzing…") : t("AI 深度建议", "AI Deep Audit")}
            </Btn>
          </div>

          {auditReport && (
            <div className="flex flex-col gap-3">
              <div className="soft-panel flex items-center gap-3 rounded-2xl p-3">
                <ScoreRing score={auditReport.score} label={t("体检参考", "Audit Score")} />
                <div className="min-w-0 flex-1 text-[12px] text-ink-600">
                  <p className="font-bold text-ink-800">
                    {t(
                      `共扫描 ${auditReport.scannedBlocks} 个条目 · ${auditReport.scannedBullets} 条要点`,
                      `Scanned ${auditReport.scannedBlocks} entries · ${auditReport.scannedBullets} bullets`
                    )}
                  </p>
                  <p className="mt-1 text-ink-500">
                    {auditReport.total
                      ? t(
                          `发现 ${auditReport.total} 项可优化处，点击「定位到此处」可直接跳转编辑。`,
                          `Found ${auditReport.total} items to improve. Click Locate to jump to any item.`
                        )
                      : t(
                          "未发现时间线断层、动词重复、中英空格或量化缺失问题。",
                          "No timeline gaps, repeated verbs, spacing issues, or missing metrics found."
                        )}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setAuditFilter("all")}
                  className={cx(
                    "chip transition",
                    auditFilter === "all"
                      ? "bg-brand-700 text-white"
                      : "bg-paper-200 text-ink-600"
                  )}
                >
                  全部 ({auditReport.total})
                </button>
                {(
                  Object.keys(AUDIT_CATEGORY_LABEL) as AuditCategory[]
                ).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setAuditFilter(cat)}
                    className={cx(
                      "chip transition",
                      auditFilter === cat
                        ? "bg-brand-700 text-white"
                        : "bg-paper-200 text-ink-600"
                    )}
                  >
                    {AUDIT_CATEGORY_LABEL[cat]} ({auditReport.counts[cat]})
                  </button>
                ))}
              </div>

              {auditAI.suggestions.length > 0 && (
                <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-3">
                  <p className="mb-2 flex items-center gap-1.5 text-[12px] font-bold text-brand-800">
                    <IconSpark size={12} /> AI 深度改进建议
                    {auditAI.providerName ? ` · ${auditAI.providerName}` : ""}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {auditAI.suggestions.map((item, idx) => (
                      <li
                        key={idx}
                        className="rounded-xl bg-surface p-2.5 text-[12px] shadow-2xs"
                      >
                        <p className="text-ink-800">{item.advice}</p>
                        {item.example && (
                          <p className="mt-1 text-[11.5px] text-ink-500">
                            示例：{item.example}
                          </p>
                        )}
                        {item.sectionId && item.blockId && (
                          <button
                            type="button"
                            className="mt-1 text-[11.5px] font-medium text-brand-700 underline"
                            onClick={() =>
                              handleLocate(item.sectionId!, item.blockId)
                            }
                          >
                            定位到此处
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ul className="flex flex-col gap-2">
                {auditReport.issues
                  .filter(
                    (i) => auditFilter === "all" || i.category === auditFilter
                  )
                  .map((issue) => (
                    <li
                      key={issue.id}
                      className="soft-panel rounded-2xl p-3 text-[12px]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={cx(
                            "chip",
                            issue.severity === "warning"
                              ? "bg-seal-100 text-seal-700"
                              : "bg-paper-200 text-ink-600"
                          )}
                        >
                          {AUDIT_CATEGORY_LABEL[issue.category]}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleLocate(issue.sectionId, issue.blockId)
                          }
                          className="text-[11.5px] font-medium text-brand-700 underline hover:text-brand-800"
                        >
                          定位到此处
                        </button>
                      </div>
                      <p className="mt-1.5 font-bold text-ink-800">
                        {issue.blockTitle} · {issue.message}
                      </p>
                      <p className="mt-1 leading-relaxed text-ink-600">
                        {issue.detail}
                      </p>
                      <p className="mt-1 leading-relaxed text-ink-500">
                        建议：{issue.suggestion}
                      </p>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          <ExternalConfirmModal
            provider={auditPendingProvider}
            dataSummary="简历摘要与本地体检发现"
            onCancel={() => setAuditPendingProvider(null)}
            onConfirm={() => runAuditAI(true)}
          />
        </div>
      ) : (
        <>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!active && (
          <Empty
            accent="ai"
            icon={<IconSpark size={20} />}
            title={t("还没有 AI 建议", "No AI suggestions yet")}
            desc={t(
              "在经历条目上点击「优化这段」，选择需要的动作。生成的建议需确认后才会写入简历。",
              'Click "Refine" on any entry to generate a suggestion. Nothing is written until you approve.'
            )}
          />
        )}

        {active && (
          <div className="anim-fade-up flex flex-col gap-2.5" key={active.id}>
            <div className="soft-panel relative overflow-hidden rounded-2xl">
              {/* AI 流标识：光谱左边框（3px），看到光谱 = AI 在工作 */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 z-10 w-[3px]"
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, var(--color-sp-a), var(--color-sp-b), var(--color-sp-c))",
                }}
              />
              <div className="flex items-center gap-2 border-b border-ink-100 px-3.5 py-2.5">
                <span
                  className={cx(
                    "chip shrink-0 whitespace-nowrap",
                    STATUS_CHIP[active.resolution ?? active.status].cls
                  )}
                >
                  {t(
                    STATUS_CHIP[active.resolution ?? active.status].text,
                    STATUS_CHIP[active.resolution ?? active.status].en
                  )}
                </span>
                <span className="shrink-0 whitespace-nowrap text-[12.5px] font-bold text-ink-800">
                  {actionLabel(active.action, ACTION_LABELS[active.action].label, uiLang)}
                </span>
                <span className="truncate text-[11.5px] text-ink-400">
                  · {blockTitle}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[12px] text-ink-500">
                  {fmtTime(active.created_at)}
                </span>
              </div>

              <div className="flex flex-col gap-2.5 px-3.5 py-3">
                <p className="flex items-center gap-1.5 text-[12px] text-ink-400">
                  <span className="sp-dot" />
                  <IconLock size={11} />
                  {active.engine === "rules"
                    ? t("规则检查", "Rule check")
                    : t("模型写作", "AI model")}
                  ：{active.provider_name} · {t("不直接覆盖原文", "Does not overwrite original")}
                </p>

                {active.status === "generating" && (
                  <div className="flex flex-col gap-2 py-2">
                    {(active.engine === "rules"
                      ? ["核对当前条目", "检查措辞与事实", "生成补充提示"]
                      : [
                          "构建 Prompt 与上下文",
                          "调用模型生成",
                          "JSON Schema 校验",
                        ]
                    ).map((step, i) => (
                      <div
                        key={step}
                        className="flex items-center gap-2 text-[12px] text-ink-500"
                        style={{
                          animation: `fade-in .3s ease ${i * 0.12}s both`,
                        }}
                      >
                        <span
                          className="anim-pulse-dot h-1.5 w-1.5 rounded-full bg-seal-500"
                          style={{ animationDelay: `${i * 0.25}s` }}
                        />
                        {step}
                        <span className="shimmer ml-auto h-2 w-16 rounded-full" />
                      </div>
                    ))}
                    <p className="mt-1 text-[12px] text-ink-500">
                      {active.engine === "rules"
                        ? "正在核对措辞与补充提示，原文保持不变…"
                        : "模型较慢时可能需要数十秒，期间可继续编辑…"}
                    </p>
                    <Btn
                      variant="ghost"
                      className="h-7 text-[12px]"
                      onClick={() => cancelSuggestion(active.id)}
                    >
                      取消生成
                    </Btn>
                  </div>
                )}

                {active.status === "failed" && (
                  <div className="rounded-lg border border-danger-600/20 bg-danger-100/60 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-bold text-danger-700">
                      <IconAlert size={13} /> 生成失败，原内容已保留
                    </p>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-danger-700/80">
                      {active.error}
                    </p>
                    <Btn
                      variant="outline"
                      className="mt-2.5 h-7 px-2.5 text-[12px]"
                      onClick={() =>
                        requestSuggestion(
                          active.resume_id,
                          active.section_id,
                          active.block_id,
                          active.action
                        )
                      }
                    >
                      <IconRefresh size={12} /> 重试
                    </Btn>
                  </div>
                )}

                {active.status === "success" && active.suggested && (
                  <>
                    {active.suggested &&
                      blockContent(active.original) ===
                        blockContent(active.suggested) && (
                        <p className="rounded bg-paper-100 p-2 text-[12px]">
                          {t(
                            "原文无需改动；以下仅为检查提示，可编辑补充真实事实。",
                            "No changes needed; review tips below and edit to add concrete metrics."
                          )}
                        </p>
                      )}
                    {active.explanation && (
                      <p className="rounded-lg bg-paper-100 px-3 py-2 text-[12px] leading-relaxed text-ink-600">
                        {active.explanation}
                      </p>
                    )}
                    {active.warnings.length > 0 && (
                      <ul className="flex flex-col gap-1">
                        {active.warnings.map((w, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-1.5 rounded-md border border-seal-500/20 bg-seal-100/60 px-2.5 py-1.5 text-[11.5px] leading-snug text-seal-700"
                          >
                            <IconAlert size={11} className="mt-0.5 shrink-0" />{" "}
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                    {active.matched_keywords.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10.5px] text-ink-400">
                          命中关键词
                        </span>
                        {active.matched_keywords.map((k) => (
                          <span
                            key={k}
                            className="chip bg-brand-600 text-white"
                          >
                            {k}
                          </span>
                        ))}
                      </div>
                    )}

                    {!editing ? (
                      <div className="flex flex-col gap-2">
                        {(active.original.title !== active.suggested.title ||
                          active.original.subtitle !==
                            active.suggested.subtitle) && (
                          <div className="flex flex-col gap-1">
                            <FieldDiff
                              label="标题"
                              from={active.original.title}
                              to={active.suggested.title}
                            />
                            <FieldDiff
                              label="副标题"
                              from={active.original.subtitle}
                              to={active.suggested.subtitle}
                            />
                          </div>
                        )}
                        {active.original.description !==
                          active.suggested.description &&
                          (active.original.description.trim().length > 0 ||
                            active.original.bullets.filter(Boolean).length ===
                              0) && (
                          <div>
                            <p className="field-label">{t("描述对比", "Description Diff")}</p>
                            <div className="rounded-xl bg-surface p-2.5 text-[12px] shadow-2xs ring-1 ring-brand-500/20">
                              <InlineTokenDiffText
                                from={active.original.description}
                                to={active.suggested.description}
                              />
                            </div>
                          </div>
                        )}
                        {(active.original.bullets.filter(Boolean).length > 0 ||
                          active.suggested.bullets.filter(Boolean).length >
                            0) && (
                          <div>
                            <p className="field-label">{t("要点逐条对比（可勾选采纳）", "Bullets Diff (Select to apply)")}</p>
                            <BulletsDiff
                              from={active.original.bullets}
                              to={active.suggested.bullets}
                              excludedIndices={excludedSet}
                              onToggleIndex={toggleBulletIndex}
                              interactive={!active.resolution}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      draft && (
                        <div className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-2.5">
                          <p className="field-label mb-0">编辑建议内容后接受</p>
                          <input
                            className="field-input"
                            value={draft.title}
                            onChange={(e) =>
                              setDraft({ ...draft, title: e.target.value })
                            }
                            placeholder="标题"
                          />
                          <input
                            className="field-input"
                            value={draft.subtitle}
                            onChange={(e) =>
                              setDraft({ ...draft, subtitle: e.target.value })
                            }
                            placeholder="副标题"
                          />
                          <textarea
                            className="field-input resize-y"
                            rows={2}
                            value={draft.description}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                description: e.target.value,
                              })
                            }
                            placeholder="描述"
                          />
                          <textarea
                            className="field-input resize-y"
                            rows={5}
                            value={draft.bullets}
                            onChange={(e) =>
                              setDraft({ ...draft, bullets: e.target.value })
                            }
                            placeholder="每行一条要点"
                          />
                        </div>
                      )
                    )}

                    {!active.resolution && active.status === "success" && (
                      <div className="flex items-center gap-1.5 border-t border-ink-100 pt-2.5">
                        {!editing ? (
                          <>
                            <button
                              className="cta-ai flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-bold"
                              disabled={
                                !!active.suggested &&
                                blockContent(active.original) ===
                                  blockContent(
                                    buildMergedSuggested(active) ??
                                      active.suggested
                                  )
                              }
                              onClick={() => accept(active)}
                            >
                              <IconCheck size={13} />{" "}
                              {excludedSet.size > 0
                                ? t("接受所选", "Accept Selected")
                                : t("接受", "Accept")}
                            </button>
                            <Btn
                              variant="outline"
                              size="sm"
                              className="h-8 px-2.5 text-[12px]"
                              onClick={() => startEdit(active)}
                            >
                              <IconEdit size={12} /> {t("微调", "Edit")}
                            </Btn>
                            <Btn
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-[12px] text-ink-500 hover:text-danger-600"
                              onClick={() => rejectSuggestion(active.id)}
                            >
                              <IconX size={13} /> {t("拒绝", "Reject")}
                            </Btn>
                          </>
                        ) : (
                          <>
                            <button
                              className="cta-ai flex h-8 items-center gap-1.5 rounded-md px-3 text-[12.5px] font-bold"
                              onClick={() => acceptEdited(active)}
                            >
                              <IconCheck size={13} /> {t("接受编辑后的内容", "Apply Edits")}
                            </button>
                            <Btn
                              variant="ghost"
                              className="h-8"
                              onClick={() => {
                                setEditing(false);
                                setDraft(null);
                              }}
                            >
                              {t("返回对比", "Back to Diff")}
                            </Btn>
                          </>
                        )}
                      </div>
                    )}
                    {active.applied &&
                      (active.resolution === "accepted" ||
                        active.resolution === "edited_accepted") && (
                        <Btn
                          variant="outline"
                          className="mt-2 h-8"
                          onClick={() => undoSuggestion(active.id)}
                        >
                          {t("撤销本次接受", "Undo Applied Change")}
                        </Btn>
                      )}
                  </>
                )}
              </div>
            </div>

            {list.length > 1 && (
              <div>
                <p className="field-label px-1">{t("历史记录", "History")}</p>
                <ul className="flex flex-col gap-1">
                  {list.slice(0, 8).map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => {
                          setSelectedId(s.id === active?.id ? null : s.id);
                          setEditing(false);
                        }}
                        className={cx(
                          "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition",
                          s.id === active?.id
                            ? "bg-brand-50 ring-1 ring-brand-300/60"
                            : "hover:bg-surface/80"
                        )}
                      >
                        <span
                          className={cx(
                            "chip shrink-0",
                            STATUS_CHIP[s.resolution ?? s.status].cls
                          )}
                        >
                          {t(
                            STATUS_CHIP[s.resolution ?? s.status].text,
                            STATUS_CHIP[s.resolution ?? s.status].en
                          )}
                        </span>
                        <span className="shrink-0 text-[11.5px] font-medium text-ink-700">
                          {actionLabel(s.action, ACTION_LABELS[s.action].label, uiLang)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[12px] text-ink-400">
                          {s.original.title || t("条目", "Entry")}
                        </span>
                        <span className="shrink-0 font-mono text-[9.5px] text-ink-500">
                          {fmtTime(s.created_at)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部隐私注脚（设计 §4.3-2）：AI 可控叙事，看到光谱 = AI */}
      {active && (
        <div className="bg-subtle/50 px-4 py-2.5">
          <p className="flex items-center gap-1.5 text-[10.5px] text-ink-400">
            <span className="sp-dot" />{" "}
            {t(
              "规则检查与模型写作分别标注 · 确认前不会改动原文",
              "Rule checks & AI drafts are labeled separately · Nothing is overwritten before approval"
            )}
          </p>
        </div>
      )}

      {/* 外部模型调用确认（ask_before_external / 首次外部调用） */}
      {pendingExternal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="anim-fade-in absolute inset-0 bg-ink-950/55"
            onClick={() => {
              setTrustSession(false);
              confirmExternal(false);
            }}
          />
          <div className="anim-scale-in relative w-full max-w-sm rounded-xl bg-paper-25 p-5 shadow-2xl ring-1 ring-ink-900/10">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-seal-100 text-seal-600">
                <IconAlert size={17} />
              </span>
              <div>
                <h3 className="text-[15px] font-bold text-ink-900">
                  即将调用外部模型
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                  继续将把
                  <strong className="text-ink-800">
                    该条目、姓名与技能摘要及目标 JD 上下文
                  </strong>
                  发送到外部服务
                  <strong className="text-ink-800">
                    「{pendingExternal.providerName}」
                  </strong>
                  （{pendingExternal.providerHost}
                  ）进行处理。
                </p>
              </div>
            </div>
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-subtle px-3 py-2 text-[12px] text-ink-600">
              <input
                type="checkbox"
                className="mt-0.5 accent-brand-600"
                checked={trustSession}
                onChange={(e) => setTrustSession(e.target.checked)}
              />
              <span>
                本次会话内不再询问「{pendingExternal.providerName}」
                {queuedSuggestionCount > 0 && (
                  <span className="block text-[11px] text-ink-400">
                    当前队列还有 {queuedSuggestionCount} 条待生成，勾选后将连续处理；刷新页面后自动失效。
                  </span>
                )}
              </span>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Btn
                variant="ghost"
                onClick={() => {
                  setTrustSession(false);
                  confirmExternal(false);
                }}
              >
                取消，保持本地
              </Btn>
              <Btn
                variant="seal"
                onClick={() => {
                  const trust = trustSession;
                  setTrustSession(false);
                  confirmExternal(true, trust);
                }}
              >
                确认发送
              </Btn>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

/* ================= JD 面板 ================= */

export function JDPanel({
  resume,
  onLocate,
}: {
  resume: Resume;
  onLocate?: (sectionId: string, blockId?: string) => void;
}) {
  const { setJD, toast, models, privacy } = useAppSlice(
    "setJD",
    "toast",
    "models",
    "privacy"
  );
  const jd = useApp((s) => s.jds[resume.id]);
  const t = useT();
  const [raw, setRaw] = useState("");
  const [editingJD, setEditingJD] = useState(false);
  const [semanticState, setSemanticState] = useState<{
    jdId: string;
    semantic: JDStructuredSemantic;
  } | null>(null);
  const [deepParsing, setDeepParsing] = useState(false);
  const [jdPendingProvider, setJdPendingProvider] =
    useState<ModelProvider | null>(null);
  const [analysis, setAnalysis] = useState<{
    report: MatchReport;
    data: Resume["data"];
    jd: typeof jd;
  } | null>(null);
  const report =
    analysis?.data === resume.data && analysis.jd === jd
      ? analysis.report
      : null;
  const semantic =
    jd && semanticState?.jdId === jd.jd_id ? semanticState.semantic : null;

  const doParse = (text: string) => {
    if (!text.trim()) {
      toast("warn", "JD 内容不能为空");
      return;
    }
    const parsed = parseJD(text, resume.id);
    setJD(resume.id, parsed);
    setAnalysis(null);
    setSemanticState(null);
    setEditingJD(false);
    toast(
      "ok",
      `JD 解析完成：提取 ${parsed.structured.skills.length} 项技能、${parsed.structured.keywords.length} 个关键词`
    );
  };

  const doDeepParse = async (text: string, confirmedExternal = false) => {
    if (!text.trim()) {
      toast("warn", "JD 内容不能为空");
      return;
    }
    const sel = selectProvider(models, privacy);
    if (sel.kind === "rules") {
      const res = await parseJDSemantically(text, resume.id, {
        models,
        privacy,
      });
      setJD(resume.id, res.jd);
      setSemanticState({ jdId: res.jd.jd_id, semantic: res.semantic });
      setAnalysis(null);
      setEditingJD(false);
      toast("info", "当前未启用可用模型，已使用本地规则解析并生成基础同义词");
      return;
    }
    if (sel.kind === "confirm_external" && !confirmedExternal) {
      setJdPendingProvider(sel.provider);
      return;
    }
    setJdPendingProvider(null);
    setDeepParsing(true);
    const res = await parseJDSemantically(text, resume.id, {
      models,
      privacy,
      confirmedExternal,
    });
    setDeepParsing(false);
    setJD(resume.id, res.jd);
    setSemanticState({ jdId: res.jd.jd_id, semantic: res.semantic });
    setAnalysis(null);
    setEditingJD(false);
    if (res.usedAI) {
      toast(
        "ok",
        `AI 语义解析完成：提取 ${res.semantic.competencies.length} 项胜任力`
      );
    } else if (res.error) {
      toast("warn", `${res.error}，已回退本地规则解析`);
    }
  };

  const doMatch = () => {
    if (!jd) return;
    const r = matchResumeData(resume.data, jd);
    setAnalysis({ report: r, data: resume.data, jd });
  };

  if (!jd || editingJD) {
    return (
      <div className="flex h-full flex-col px-4 pb-4 pt-3.5">
        <h2 className="flex items-center gap-1.5 pb-2 text-[12px] font-bold text-ink-400">
          <IconTarget size={13} className="text-brand-600" /> {t("目标岗位 JD", "Target Job Description")}
        </h2>
        <p className="mb-2 text-[11.5px] leading-relaxed text-ink-400">
          {t(
            "粘贴招聘 JD，系统将提取技能与关键词（本地规则解析，不发送给模型），并与简历做匹配分析。",
            "Paste a job description to extract skills & keywords locally and analyze resume alignment."
          )}
        </p>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          placeholder={t(
            "高级前端工程师\n\n岗位职责：\n1. 负责…\n\n任职要求：\n1. 精通 React、TypeScript…",
            "Senior Frontend Engineer\n\nResponsibilities:\n1. Lead…\n\nRequirements:\n1. Proficient in React, TypeScript…"
          )}
          className="field-input min-h-0 flex-1 resize-none leading-relaxed"
        />
        <div className="mt-2.5 flex gap-2">
          <Btn
            variant="primary"
            className="h-8 flex-1"
            onClick={() => doParse(raw)}
          >
            <IconTarget size={13} /> {t("解析 JD", "Parse JD")}
          </Btn>
          <Btn
            variant="outline"
            className="h-8"
            disabled={deepParsing}
            onClick={() => doDeepParse(raw, false)}
          >
            <IconSpark size={13} />{" "}
            {deepParsing ? t("解析中…", "Parsing…") : t("AI 语义解析", "AI Semantic")}
          </Btn>
          <Btn
            variant="outline"
            className="h-8"
            onClick={() => setRaw(SAMPLE_JD_TEXT)}
          >
            {t("填入示例", "Sample")}
          </Btn>
          {editingJD && (
            <Btn variant="ghost" onClick={() => setEditingJD(false)}>
              {t("取消修改", "Cancel")}
            </Btn>
          )}
        </div>
        <ExternalConfirmModal
          provider={jdPendingProvider}
          dataSummary="目标岗位 JD 原文"
          onCancel={() => setJdPendingProvider(null)}
          onConfirm={() => doDeepParse(raw, true)}
        />
      </div>
    );
  }

  const st = jd.structured;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-bold  text-ink-400">
          <IconTarget size={13} className="text-brand-600" /> JD ·{" "}
          {st.job_title || "未命名岗位"}
        </h2>
        <div className="flex items-center gap-1">
          <button
            className="tool-btn h-6 w-6"
            title="修改 JD"
            aria-label="修改 JD"
            onClick={() => {
              setRaw(jd.raw_text);
              setEditingJD(true);
            }}
          >
            <IconEdit size={12} />
          </button>
          <button
            className="tool-btn h-6 w-6"
            title="重新解析"
            onClick={() => doParse(jd.raw_text)}
            aria-label="重新解析"
          >
            <IconRefresh size={12} />
          </button>
          <button
            className="tool-btn h-6 w-6 hover:bg-danger-100 hover:text-danger-600"
            title="移除 JD"
            onClick={() => {
              setJD(resume.id, null);
              setAnalysis(null);
            }}
            aria-label="移除 JD"
          >
            <IconX size={12} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-3 rounded-lg bg-paper-100 p-2 text-[12px] leading-relaxed text-ink-500">
          本地规则匹配参考。分数不代表招聘通过率或真实 ATS
          结果；学历和年限的文本依据在下方单独核对。
        </p>
        <div className="mb-2.5 flex flex-wrap gap-1">
          <span className="chip bg-paper-200 text-ink-500">
            {st.education || "学历要求待核对"}
          </span>
          {st.experience_years && (
            <span className="chip bg-paper-200 text-ink-500">
              {st.experience_years} 年经验
            </span>
          )}
          <span className="chip bg-paper-200 text-ink-500">
            {st.responsibilities.length ? `${st.responsibilities.length} 条职责` : '职责尚未识别'}
          </span>
          <span className="chip bg-paper-200 text-ink-500">
            {st.requirements.length ? `${st.requirements.length} 条要求` : '要求尚未识别'}
          </span>
        </div>

        <p className="field-label">提取的技能（{st.skills.length}）</p>
        <div className="mb-3 flex flex-wrap gap-1">
          {st.skills.length ? (
            st.skills.map((s) => (
              <span key={s} className="chip bg-brand-700 text-white">
                {s}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-ink-500">未识别到技能词</span>
          )}
        </div>

        <div className="soft-panel mb-3 rounded-2xl p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1 text-[12px] font-bold text-ink-700">
              <IconSpark size={12} className="text-brand-600" />
              {semantic?.source === "ai"
                ? `AI 语义胜任力（${semantic.provider_name ?? "模型"}）`
                : "胜任力与同义词深度解析"}
            </span>
            <Btn
              variant="outline"
              className="h-6 px-2 text-[11px]"
              disabled={deepParsing}
              onClick={() => doDeepParse(jd.raw_text, false)}
            >
              {deepParsing ? "解析中…" : semantic ? "重新深度解析" : "AI 深度解析"}
            </Btn>
          </div>
          {semantic && semantic.competencies.length > 0 && (
            <div className="mt-2 flex flex-col gap-1.5">
              {semantic.competencies.slice(0, 8).map((c) => (
                <div
                  key={c.name}
                  className="rounded bg-paper-50 px-2 py-1.5 text-[11.5px]"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-ink-800">{c.name}</span>
                    <span className="chip bg-paper-200 text-[10px] text-ink-600">
                      {c.category}
                    </span>
                  </div>
                  {c.synonyms.length > 0 && (
                    <p className="mt-0.5 text-ink-500">
                      等价词/同义词：{c.synonyms.join("、")}
                    </p>
                  )}
                  {c.evidence_hint && (
                    <p className="mt-0.5 text-ink-500">
                      证据方向：{c.evidence_hint}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <ExternalConfirmModal
          provider={jdPendingProvider}
          dataSummary="目标岗位 JD 原文"
          onCancel={() => setJdPendingProvider(null)}
          onConfirm={() => doDeepParse(jd.raw_text, true)}
        />
        <details className="soft-panel mb-3 rounded-2xl p-2.5">
          <summary className="cursor-pointer text-[12px] font-bold">
            JD 原句与简历依据
          </summary>
          <div className="mt-2 space-y-2">
            {jdEvidence(resume, jd).map((item) => (
              <div
                key={item.term}
                className="rounded bg-paper-50 p-2 text-[12px]"
              >
                <p className="font-bold">
                  {item.term} · {item.priority}
                </p>
                <p className="mt-1 text-ink-500">
                  {item.sourceLines[0] || "关键词频次提取，请人工核对"}
                </p>
                {item.matches.length ? (
                  item.matches.map((match) => (
                    <button
                      key={match.blockId}
                      className="mt-1 block text-brand-700 underline"
                      onClick={() => onLocate?.(match.sectionId, match.blockId)}
                    >
                      定位：{match.title}
                    </button>
                  ))
                ) : item.relatedMatches.length ? (
                  <div className="mt-1 text-seal-700"><p>发现相关工具证据，需确认实际使用范围：</p>{item.relatedMatches.map(match => <button key={match.blockId} className="mt-1 block text-brand-700 underline" onClick={() => onLocate?.(match.sectionId, match.blockId)}>定位：{match.title}（{match.tools.join('、')}）</button>)}</div>
                ) : (
                  <p className="mt-1 text-danger-700">
                    未直接匹配到词项，请核对真实经历，不代表缺少该能力。
                  </p>
                )}
              </div>
            ))}
          </div>
        </details>
        {qualificationEvidence(resume, jd).map((item) => (
          <div
            key={item.label}
            className="mb-2 rounded-lg bg-paper-100 p-2 text-[12px]"
          >
            <p className="font-bold">
              {item.label} · {item.status}
            </p>
            <p className="mt-1 text-ink-500">{item.evidence}</p>
          </div>
        ))}

        {!report ? (
          <div>
            {analysis && (
              <p className="mb-2 text-[12px] text-seal-700">
                简历或 JD 已变化，请重新分析。
              </p>
            )}
            <Btn variant="dark" className="h-9 w-full" onClick={doMatch}>
              <IconTarget size={14} /> 分析与当前简历的匹配度
            </Btn>
          </div>
        ) : (
          <div className="anim-fade-up flex flex-col gap-3">
            <details className="soft-panel rounded-2xl p-3.5">
              <summary className="cursor-pointer text-[12px]">
                查看规则数值（不代表岗位胜任度）
              </summary>
              <div className="mt-3 flex items-center gap-4">
                <ScoreRing score={report.overall_score} label="词项覆盖参考" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <ScoreBar label="技能匹配" score={report.skill_match_score} />
                  <ScoreBar
                    label="关键词覆盖"
                    score={report.keyword_coverage_score}
                  />
                  <ScoreBar
                    label="要求词元覆盖"
                    score={report.experience_relevance_score}
                  />
                  <ScoreBar
                    label="成果表述检查"
                    score={report.writing_quality_score}
                  />
                </div>
              </div>
            </details>
            <p className="text-[12px] text-ink-400">
              兼容参考值：技能 35% + 关键词 25% + 经历词元 25% + 表达规则
              15%。该权重未经招聘结果验证，优先核对上方证据。
            </p>

            {report.missing_skills.length > 0 && (
              <div>
                <p className="field-label">
                  待核对词项（{report.missing_skills.length}）
                </p>
                <div className="flex flex-wrap gap-1">
                  {report.missing_skills.map((s) => (
                    <span
                      key={s}
                      className="chip bg-danger-100 text-danger-700 ring-1 ring-danger-600/20"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {!!report.related_skills?.length && <div className="rounded-lg bg-seal-100 p-3 text-[12px] text-seal-700"><p className="font-medium">相关工具证据待确认</p>{report.related_skills.map(item => <p key={item.term}>{item.term}：{item.tools.join('、')}</p>)}</div>}
            {report.missing_keywords.length > 0 && (
              <div>
                <p className="field-label">未覆盖关键词</p>
                <div className="flex flex-wrap gap-1">
                  {report.missing_keywords.map((s) => (
                    <span key={s} className="chip bg-seal-100 text-seal-700">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="field-label">{t("优化建议", "Suggestions")}</p>
              <ul className="flex flex-col gap-1.5">
                {report.suggestions.map((s, i) => (
                  <li
                    key={i}
                    className="soft-panel flex items-start gap-2 rounded-xl px-3 py-2 text-[11.5px] leading-relaxed text-ink-600"
                  >
                    <span className="mt-0.5 font-mono text-[12px] font-bold text-brand-600">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] text-ink-500">
                {t(`分析于 ${timeAgo(report.computed_at)} · 本地规则引擎`, `Analyzed ${timeAgo(report.computed_at)} · Local rules`)}
              </span>
              <Btn
                variant="ghost"
                className="h-7 text-[11.5px]"
                onClick={doMatch}
              >
                <IconRefresh size={11} /> {t("重新分析", "Re-analyze")}
              </Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export type { AIAction };
export { SECTION_LABELS };
