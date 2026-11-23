import {
  Fragment,
  useEffect,
  useId,
  useState,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  AIAction,
  Block,
  BulletStyleKey,
  Resume,
  Section,
  SectionType,
} from "../types";
import { ACTION_LABELS, BULLET_STYLE_OPTIONS, EN_SECTION_LABELS, SECTION_LABELS } from "../types";
import {
  cx,
  fileToDataUrl,
  prepEditorHtml,
  resolveBulletStyle,
  stripHtml,
} from "../lib/utils";
import { useApp, useAppSlice } from "../lib/store";
import { actionHint, actionLabel, useT, useUiLang } from "../lib/i18n";
import { selectProvider } from "../lib/ai";
import { GlassSelect } from "./ui";
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconEye,
  IconEyeOff,
  IconMoreHorizontal,
  IconPlus,
  IconSettings,
  IconSpark,
  IconTrash,
  IconUpload,
  IconX,
} from "./icons";
import { Confirm, useActionMenu } from "./ui";
import { BulletGlyph } from "./template";
import type { ResumeLocation } from "../lib/preview-navigation";

/* ---------------- 基础表单件 ---------------- */

function F({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("block min-w-0", className)}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/* ---------------- 行内加粗（Markdown ** 标记） ---------------- */

function wrapSelection(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  onChange: (v: string) => void
) {
  if (!el) return;
  const s = el.selectionStart ?? 0;
  const e = el.selectionEnd ?? 0;
  const v = el.value;
  const sel = v.slice(s, e);
  const nv = v.slice(0, s) + "**" + sel + "**" + v.slice(e);
  onChange(nv);
  requestAnimationFrame(() => {
    el.focus();
    try {
      el.setSelectionRange(s + 2, s + 2 + sel.length);
    } catch {
      /* noop */
    }
  });
}

function BoldButton({
  elRef,
  onChange,
}: {
  elRef: RefObject<HTMLInputElement | HTMLTextAreaElement>;
  onChange: (v: string) => void;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => wrapSelection(elRef.current, onChange)}
      className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded border border-ink-200 bg-surface/90 text-[12px] font-bold text-ink-500 transition hover:border-brand-400 hover:text-brand-700"
      title="选中文字后点击：用 ** 包裹以加粗"
      aria-label="加粗选中文字"
    >
      B
    </button>
  );
}

function RichField({
  label,
  value,
  onChange,
  placeholder,
  textarea,
  rows,
  mono,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
  mono?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const [selected, setSelected] = useState(false);
  const selectionChanged = (el: HTMLInputElement | HTMLTextAreaElement) =>
    setSelected((el.selectionStart ?? 0) < (el.selectionEnd ?? 0));
  return (
    <F label={label} className={className}>
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setSelected(false);
        }}
      >
        {textarea ? (
          <textarea
            ref={ref as RefObject<HTMLTextAreaElement>}
            onSelect={(e) => selectionChanged(e.currentTarget)}
            className={cx(
              "field-input resize-y leading-relaxed pr-8",
              mono && "font-mono"
            )}
            rows={rows ?? 4}
            aria-label={label}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <input
            ref={ref as RefObject<HTMLInputElement>}
            onSelect={(e) => selectionChanged(e.currentTarget)}
            className={cx("field-input", selected && "pr-8", mono && "font-mono")}
            aria-label={label}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
        {selected && <BoldButton elRef={ref} onChange={onChange} />}
      </div>
    </F>
  );
}

/** 轻量行内富文本编辑器：contentEditable + 加粗/斜体工具栏，输出消毒后的 HTML。
 *  与预览端 renderRich 配合，实现「要点/描述统一为富文本、可自定义加粗」。
 *
 *  受控同步策略：聚焦即真相（半受控）。用户正在输入时 document.activeElement
 *  就是编辑器本体，此时 value 变化一律不重写 innerHTML —— 彻底消除「每次按键
 *  setState → effect 重写 DOM → 光标被重置到末尾/开头」的竞争窗口。这也是历史上
 *  「要点无法编辑 / 长描述打不进字」类问题的共同根因：早期用 emittingRef +
 *  setTimeout(0) 做时间窗防抖，若 effect 恰好在防抖重置之后执行仍会重写 DOM，
 *  时序敏感、难以复现。外部程序性修改（AI 建议、撤销）几乎都发生在失焦状态，
 *  失焦后 effect 照常同步，功能不受影响。 */
function RichTextEditor({
  value,
  onChange,
  placeholder,
  ariaLabel = "经历概述",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 正在编辑：DOM 即真相，禁止重写（否则光标/选区被重置，用户表现为「无法编辑」）
    if (document.activeElement === el) return;
    const desired = prepEditorHtml(value);
    if (el.innerHTML !== desired) {
      el.innerHTML = desired;
    }
  }, [value]);
  const emit = () => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== prepEditorHtml(value)) onChange(el.innerHTML);
  };
  return (
    <div className="inline-editor relative">
      <div className="inline-format absolute right-1 top-1 z-10 flex items-center gap-0.5 rounded bg-surface/95">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => document.execCommand("bold")}
          className="flex h-6 w-6 items-center justify-center rounded text-[13px] font-bold text-ink-500 transition hover:bg-brand-100 hover:text-brand-700"
          title="选中文字后加粗"
          aria-label="加粗"
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => document.execCommand("italic")}
          className="flex h-6 w-6 items-center justify-center rounded text-[13px] italic text-ink-500 transition hover:bg-brand-100 hover:text-brand-700"
          title="选中文字后斜体"
          aria-label="斜体"
        >
          I
        </button>
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        data-ph={placeholder}
        className={cx(
          "field-input min-h-[2.5rem] overflow-auto pr-16 leading-relaxed",
          className
        )}
        onInput={emit}
        onBlur={emit}
        /* 粘贴一律降级为纯文本：编辑器只支持行内加粗/斜体，放行富文本粘贴会
         * 把网页的 <ul>/<li>/<span style> 等整段塞进存储值，预览端渲染出错
         * （历史上曾带入 scrollbar-color 内联样式与损坏的 li 标签）。
         * 多行文本的换行转成 <br> 插入（execCommand("insertText") 会把 \n
         * 折叠成空格，换行丢失）；末尾夹带的换行/空格直接削掉。 */
        onPaste={(e) => {
          e.preventDefault();
          const raw = e.clipboardData.getData("text/plain");
          if (!raw) return;
          const text = raw.replace(/\r\n?/g, "\n").replace(/[\s\u00a0]+$/, "");
          if (!text) return;
          const lines = text.split("\n");
          if (lines.length === 1) {
            document.execCommand("insertText", false, text);
          } else {
            const esc = (s: string) =>
              s
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");
            document.execCommand(
              "insertHTML",
              false,
              lines.map(esc).join("<br>")
            );
          }
        }}
        onDrop={(e) => e.preventDefault()}
      />
    </div>
  );
}

export function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const t = draft.trim().replace(/[,，、]+$/, "");
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line-strong/80 bg-surface px-2.5 py-1.5 shadow-2xs transition-all focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
      {values.map((v) => (
        <span
          key={v}
          className="chip rounded-full bg-brand-50 px-2.5 text-brand-700"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((x) => x !== v))}
            className="opacity-60 transition hover:opacity-100"
            aria-label={`移除 ${v}`}
          >
            <IconX size={10} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length) {
            onChange(values.slice(0, -1));
          }
        }}
        onBlur={commit}
        placeholder={values.length ? "+ 添加…" : placeholder || "输入后回车添加"}
        className="min-w-[68px] flex-1 bg-transparent py-0.5 text-[13px] text-ink-900 outline-none placeholder:text-ink-400"
      />
    </div>
  );
}

/** 要点符号：编辑器行首、下拉选择器与预览共用同一套高精度 SVG 几何符号 */
function BulletMarker({
  style,
  index,
}: {
  style: BulletStyleKey;
  index: number;
}) {
  return <BulletGlyph style={style} index={index} size="editor" />;
}

const BULLET_LABEL_EN: Record<BulletStyleKey, string> = {
  diamond: "Diamond",
  disc: "Disc",
  square: "Square",
  circle: "Circle",
  arrow: "Arrow",
  check: "Check",
  ordered: "Numbered",
};

/** 模块级要点列表样式选择器：与要点编辑器同处一行，改动即时作用于本模块所有条目 */
function BulletStyleSelect({
  value,
  onChange,
}: {
  value: BulletStyleKey;
  onChange: (v: BulletStyleKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = useT();
  useActionMenu(open, setOpen, ref);
  const cur =
    BULLET_STYLE_OPTIONS.find((o) => o.key === value) ??
    BULLET_STYLE_OPTIONS[0];
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t("本模块要点列表样式（作用于该模块全部条目）", "Bullet marker style for this section")}
        className={cx(
          "editor-action inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] font-medium transition-all",
          open
            ? "bg-brand-500/12 text-brand-700 ring-1 ring-brand-500/25"
            : "bg-surface text-ink-600 shadow-xs ring-1 ring-ink-900/6 hover:bg-brand-50/70 hover:text-brand-700"
        )}
      >
        <span className="flex h-4 w-4 items-center justify-center text-brand-600">
          <BulletGlyph style={cur.key} index={0} size="menu" />
        </span>
        <span>{t(cur.label, BULLET_LABEL_EN[cur.key])}</span>
        <IconChevronDown
          size={11}
          className={cx(
            "opacity-70 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t("成果列表样式", "Bullet style")}
          className="app-menu glass-tip absolute bottom-full right-0 mb-1.5 z-40 w-48 !top-auto !mt-0 !max-h-none overflow-visible rounded-2xl p-1.5"
        >
          <p className="px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-ink-400">
            {t("成果列表样式", "Bullet Style")}
          </p>
          {BULLET_STYLE_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitemradio"
              tabIndex={-1}
              aria-checked={value === o.key}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
              className={cx(
                "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] transition",
                value === o.key
                  ? "bg-brand-500/12 font-semibold text-brand-700"
                  : "text-ink-600 hover:bg-surface/80"
              )}
            >
              <span
                className={cx(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
                  value === o.key
                    ? "bg-brand-500/15 text-brand-600"
                    : "bg-ink-900/5 text-ink-600"
                )}
              >
                <BulletGlyph style={o.key} index={0} size="menu" />
              </span>
              <span>{t(o.label, BULLET_LABEL_EN[o.key])}</span>
              {value === o.key && <IconCheck size={12} className="ml-auto text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BulletsEdit({
  label,
  value,
  marks,
  onChange,
  onMarksChange,
  bulletStyle,
  onBulletStyleChange,
}: {
  value: string[];
  label?: string;
  /** 与 value 平行的勾选标记；缺省视为全部勾选（历史数据兼容） */
  marks?: boolean[];
  onChange: (v: string[]) => void;
  onMarksChange: (m: boolean[]) => void;
  bulletStyle: BulletStyleKey;
  onBulletStyleChange: (v: BulletStyleKey) => void;
}) {
  const t = useT();
  const resolvedLabel = label ?? t("主要成果", "Key Achievements");
  const isAchievements = resolvedLabel === "主要成果" || resolvedLabel === "Key Achievements";
  const isMarked = (i: number) => marks?.[i] ?? true;
  const update = (i: number, html: string) =>
    onChange(value.map((b, idx) => (idx === i ? html : b)));
  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
    if (marks) onMarksChange(marks.filter((_, idx) => idx !== i));
  };
  const add = () => {
    onChange([...value, ""]);
    if (marks) onMarksChange([...marks, true]);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    if (marks) {
      const nm = [...marks];
      [nm[i], nm[j]] = [nm[j], nm[i]];
      onMarksChange(nm);
    }
  };
  /** 符号即开关：点击行首符号切换勾选。序号只数勾选条目（有序样式重编号，不留空洞） */
  const toggleMark = (i: number) => {
    const next = value.map((_, idx) => isMarked(idx));
    next[i] = !next[i];
    onMarksChange(next);
  };
  return (
    <div className="sm:col-span-2 min-w-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="field-label mb-0">{resolvedLabel}</span>
        <div className="ml-auto">
          <BulletStyleSelect
            value={bulletStyle}
            onChange={onBulletStyleChange}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {value.map((b, i) => {
          const marked = isMarked(i);
          // 有序样式的槽位序号 = 之前勾选条目数（与预览端编号规则一致）
          const ordinal = value
            .slice(0, i)
            .filter((_, idx) => isMarked(idx)).length;
          return (
            <div key={i} className="achievement-row flex items-start gap-1.5">
              <button
                type="button"
                onClick={() => toggleMark(i)}
                aria-pressed={marked}
                title={
                  marked
                    ? t("已勾选：预览显示列表符号（点击取消）", "Bullet marker shown (click to hide)")
                    : t("未勾选：预览不显示列表符号（点击勾选）", "Bullet marker hidden (click to show)")
                }
                className={cx(
                  "mt-[0.42rem] flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all",
                  marked
                    ? "text-brand-600 hover:bg-brand-500/12"
                    : "text-ink-300 hover:bg-ink-900/6 hover:text-ink-600"
                )}
              >
                <span
                  className={cx(
                    "flex items-center justify-center leading-none transition-opacity duration-150",
                    marked ? "opacity-100" : "opacity-35"
                  )}
                >
                  <BulletMarker style={bulletStyle} index={ordinal} />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <RichTextEditor
                  ariaLabel={`${t("成果", "Bullet")} ${i + 1}`}
                  value={b}
                  onChange={(html) => update(i, html)}
                  placeholder={
                    isAchievements
                      ? t("做了什么，带来了什么结果", "What you did and the measurable impact")
                      : t("输入一条内容", "Enter a bullet point")
                  }
                />
              </div>
              <div className="achievement-actions flex shrink-0 flex-col">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="tool-btn h-5 w-5 disabled:opacity-30"
                  aria-label={t("上移成果", "Move up")}
                >
                  <IconChevronUp size={11} />
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  className="tool-btn h-5 w-5 disabled:opacity-30"
                  aria-label={t("下移成果", "Move down")}
                >
                  <IconChevronDown size={11} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="achievement-actions tool-btn h-6 w-6 hover:bg-danger-100 hover:text-danger-600"
                aria-label={t("删除成果", "Remove bullet")}
              >
                <IconX size={12} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={add}
          className="self-start inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 transition hover:text-brand-700"
        >
          <IconPlus size={12} /> {isAchievements ? t("添加成果", "Add Achievement") : t("添加要点", "Add Bullet")}
        </button>
      </div>
    </div>
  );
}

/* ---------------- AI 动作菜单 ---------------- */

export function AIActionMenu({
  onAction,
  hasJD,
  subtle,
}: {
  onAction: (a: AIAction) => void;
  hasJD: boolean;
  subtle?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useActionMenu(open, setOpen, menuRef);
  const { models, privacy, go } = useAppSlice("models", "privacy", "go");
  const uiLang = useUiLang();
  const t = useT();
  const rules = selectProvider(models, privacy).kind === "rules";
  return (
    <div
      className="relative"
      ref={menuRef}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cx(
          "editor-action inline-flex items-center gap-1.5 rounded-sm px-2.5 text-[12.5px] font-medium transition-all",
          subtle && !open
            ? "border border-transparent text-ink-500 opacity-75 hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700 hover:opacity-100"
            : "ai-ring text-brand-700",
          open && "ring-2 ring-brand-300/60"
        )}
        aria-label={t("优化这段", "Refine")}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <IconSpark size={13} />
        {t("优化这段", "Refine")}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div
            role="menu"
            aria-label={t("条目优化动作", "Entry refinement actions")}
            className="glass-tip app-menu absolute right-0 top-8 z-30 w-64 overflow-hidden rounded-2xl p-1"
          >
            <p className="rounded-xl bg-subtle/70 px-3 py-1.5 text-[11.5px] font-medium text-ink-400">
              {rules
                ? t("规则检查：精简措辞与核对提示", "Rule check: phrasing & review tips")
                : t("模型写作：生成后逐条确认", "AI draft: review each change before applying")}
            </p>
            {(Object.keys(ACTION_LABELS) as AIAction[]).map((a) => (
              <button
                key={a}
                role="menuitem"
                tabIndex={-1}
                disabled={
                  rules && ["rewrite", "expand", "translate"].includes(a)
                }
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  onAction(a);
                }}
                className="flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition hover:bg-brand-50 disabled:opacity-45"
              >
                <span className="mt-0.5 w-20 shrink-0 text-[12px] font-bold text-ink-800">
                  {actionLabel(a, ACTION_LABELS[a].label, uiLang)}
                </span>
                <span className="text-[11.5px] leading-snug text-ink-400">
                  {rules && ["rewrite", "expand", "translate"].includes(a)
                    ? t("需在模型与隐私中启用模型", "Enable a model in Models & Privacy")
                    : actionHint(a, ACTION_LABELS[a].hint, uiLang)}
                  {a === "jd_match" && !hasJD && (
                    <em className="ml-1 not-italic text-seal-600">
                      {t("（未绑定 JD）", "(No JD linked)")}
                    </em>
                  )}
                </span>
              </button>
            ))}
            {rules && (
              <div className="mt-1 pt-1">
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    go({ name: "models" });
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-[12px] font-medium text-brand-700 transition hover:bg-brand-50"
                >
                  <span>{t("前往「模型与隐私」启用模型", "Enable a model in Models & Privacy")}</span>
                  <IconArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- 单个 Block 编辑器 ---------------- */

const TYPE_LABEL: Record<Block["type"], string> = {
  summary: "总结",
  work_experience_item: "工作经历",
  project_experience_item: "项目",
  education_item: "教育",
  skill_group: "技能组",
  certification: "证书/奖项",
  custom_text: "自定义",
};

export function BlockCard({
  resume,
  section,
  block,
  index,
  total,
  onRequestAI,
  bulletStyle,
  onBulletStyleChange,
  revealLocation,
}: {
  resume: Resume;
  section: Section;
  block: Block;
  index: number;
  total: number;
  onRequestAI: (sectionId: string, blockId: string, action: AIAction) => void;
  /** 该模块解析后的要点样式（模块级设置 → 全局默认） */
  bulletStyle: BulletStyleKey;
  onBulletStyleChange: (v: BulletStyleKey) => void;
  revealLocation?: ResumeLocation | null;
}) {
  const { patchBlock, deleteBlock, moveBlock } = useAppSlice(
    "patchBlock",
    "deleteBlock",
    "moveBlock"
  );
  const t = useT();
  const [open, setOpen] = useState(() => block.order === 0 || ![block.title, block.description, ...block.bullets, ...block.skills].some(value => stripHtml(value).trim()));
  useEffect(() => {
    if (revealLocation?.sectionId === section.section_id && revealLocation.blockId === block.block_id) setOpen(true);
  }, [revealLocation, section.section_id, block.block_id]);
  const [confirmDel, setConfirmDel] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useActionMenu(moreOpen, setMoreOpen, moreRef);
  const jd = useApp((s) => s.jds[resume.id]);
  const [showPoints, setShowPoints] = useState(block.bullets.length > 0);
  const [showExtras, setShowExtras] = useState(!!block.subtitle || !!block.subtitles?.length);
  const isEntry = [
    "work_experience_item",
    "project_experience_item",
    "education_item",
  ].includes(block.type);
  const preview =
    block.title ||
    stripHtml(block.description).slice(0, 28) ||
    stripHtml(block.bullets[0] ?? "").slice(0, 28) ||
    t("（空白条目）", "(Empty entry)");

  if (block.type === "skill_group") {
    return (
      <div
        data-block-id={block.block_id}
        tabIndex={-1}
        className={cx(
          "group rounded-2xl border border-line bg-subtle/40 p-3 transition-colors",
          !block.visible && "opacity-50"
        )}
      >
        <div className="mb-2 flex items-center gap-2">
          <input
            className="field-input min-w-0 flex-1 py-1.5 text-[13.5px] font-semibold"
            value={block.title}
            aria-label={t("技能组名", "Skill category")}
            placeholder={t("技能分组名（如：核心技术）", "Category (e.g., Core Stack)")}
            onChange={(e) =>
              patchBlock(resume.id, section.section_id, block.block_id, {
                title: e.target.value,
              })
            }
          />
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => moveBlock(resume.id, section.section_id, block.block_id, "up")}
              className="tool-btn h-7 w-7 disabled:opacity-30"
              aria-label={t("上移", "Move Up")}
              title={t("上移", "Move Up")}
            >
              <IconChevronUp size={13} />
            </button>
            <button
              type="button"
              disabled={index === total - 1}
              onClick={() => moveBlock(resume.id, section.section_id, block.block_id, "down")}
              className="tool-btn h-7 w-7 disabled:opacity-30"
              aria-label={t("下移", "Move Down")}
              title={t("下移", "Move Down")}
            >
              <IconChevronDown size={13} />
            </button>
            <button
              type="button"
              onClick={() =>
                patchBlock(resume.id, section.section_id, block.block_id, {
                  visible: !block.visible,
                })
              }
              className="tool-btn h-7 w-7"
              aria-label={block.visible ? t("隐藏这段", "Hide Entry") : t("显示这段", "Show Entry")}
              title={block.visible ? t("隐藏这段", "Hide Entry") : t("显示这段", "Show Entry")}
            >
              {block.visible ? <IconEye size={13} /> : <IconEyeOff size={13} />}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="tool-btn h-7 w-7 hover:bg-danger-100 hover:text-danger-600"
              aria-label={t("删除这段", "Delete Entry")}
              title={t("删除这段", "Delete Entry")}
            >
              <IconTrash size={13} />
            </button>
          </div>
        </div>
        <TagInput
          values={block.skills}
          onChange={(v) =>
            patchBlock(resume.id, section.section_id, block.block_id, {
              skills: v,
            })
          }
          placeholder={t("React、TypeScript…（回车添加）", "PyTorch, JAX, TypeScript…")}
        />
        <Confirm
          open={confirmDel}
          danger
          title={t("删除该技能组？", "Delete this skill group?")}
          desc={t(
            `「${preview}」将从简历中移除，此操作不可撤销。`,
            `"${preview}" will be permanently removed from this resume.`
          )}
          confirmText={t("删除", "Delete")}
          onConfirm={() => {
            deleteBlock(resume.id, section.section_id, block.block_id);
            setConfirmDel(false);
          }}
          onCancel={() => setConfirmDel(false)}
        />
      </div>
    );
  }

  return (
    <div
      data-block-id={block.block_id}
      tabIndex={-1}
      className={cx(
        "group border-b border-line bg-transparent last:border-b-0"
      )}
    >
      <div
        data-editor-location-heading
        className={cx(
          "flex cursor-pointer items-center gap-2 px-3 py-2.5 transition-colors hover:bg-subtle/60",
          open && "bg-subtle/40"
        )}
        onClick={() => setOpen((v) => !v)}
      >
        <button
          className="tool-btn h-6 w-6"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          aria-label={open ? "折叠" : "展开"}
        >
          <IconChevronDown
            size={14}
            className={cx(
              "transition-transform duration-150",
              !open && "-rotate-90"
            )}
          />
        </button>
        {section.type === "custom" && (
          <span className="chip shrink-0 bg-paper-200 font-mono text-[11px] text-ink-500">
            {block.type === "summary" ? "文本" : TYPE_LABEL[block.type]}
          </span>
        )}
        <span
          className={cx(
            "min-w-0 flex-1 truncate text-[13.5px]",
            block.title ? "font-semibold text-ink-800" : "text-ink-500"
          )}
        >
          {preview}
        </span>
        {block.start_date && (
          <span className="hidden shrink-0 font-mono text-[11.5px] text-ink-400 sm:inline">
            {block.start_date}
            {block.end_date ? ` – ${block.end_date}` : ""}
          </span>
        )}
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <AIActionMenu
            hasJD={!!jd}
            subtle={!open}
            onAction={(a) => onRequestAI(section.section_id, block.block_id, a)}
          />
          <div
            className="relative"
            ref={moreRef}
          >
            <button
              type="button"
              className="tool-btn h-8 w-8"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-label={`更多操作 ${preview}`}
              title="更多操作"
              onClick={() => setMoreOpen((v) => !v)}
            >
              <IconMoreHorizontal size={15} />
            </button>
            {moreOpen && (
              <div
                role="menu"
                aria-label={t("条目操作", "Entry actions")}
                className="glass-tip app-menu absolute right-0 top-full z-20 mt-1 w-36 rounded-2xl p-1"
              >
                <button
                  role="menuitem"
                  tabIndex={-1}
                  className="block w-full rounded-xl px-3 py-2 text-left text-[12px] hover:bg-surface/80 disabled:opacity-40"
                  disabled={index === 0}
                  onClick={() => {
                    moveBlock(
                      resume.id,
                      section.section_id,
                      block.block_id,
                      "up"
                    );
                    setMoreOpen(false);
                  }}
                >
                  {t("上移", "Move Up")}
                </button>
                <button
                  role="menuitem"
                  tabIndex={-1}
                  className="block w-full rounded-xl px-3 py-2 text-left text-[12px] hover:bg-surface/80 disabled:opacity-40"
                  disabled={index === total - 1}
                  onClick={() => {
                    moveBlock(
                      resume.id,
                      section.section_id,
                      block.block_id,
                      "down"
                    );
                    setMoreOpen(false);
                  }}
                >
                  {t("下移", "Move Down")}
                </button>
                <button
                  role="menuitem"
                  tabIndex={-1}
                  className="block w-full rounded-xl px-3 py-2 text-left text-[12px] hover:bg-surface/80"
                  onClick={() => {
                    patchBlock(resume.id, section.section_id, block.block_id, {
                      visible: !block.visible,
                    });
                    setMoreOpen(false);
                  }}
                >
                  {block.visible ? t("隐藏这段", "Hide Entry") : t("显示这段", "Show Entry")}
                </button>
                <button
                  role="menuitem"
                  tabIndex={-1}
                  className="block w-full rounded-xl px-3 py-2 text-left text-[12px] text-danger-700 hover:bg-danger-100"
                  onClick={() => {
                    setConfirmDel(true);
                    setMoreOpen(false);
                  }}
                >
                  {t("删除这段", "Delete Entry")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{
              height: "auto",
              opacity: 1,
              transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
            }}
            exit={{
              height: 0,
              opacity: 0,
              transition: { duration: 0.16, ease: "easeIn" },
            }}
            className="overflow-visible"
          >
            <div
              className={cx(
                "@container grid grid-cols-1 gap-x-3 gap-y-2.5 @md:grid-cols-2 bg-subtle/45 px-3.5 py-3.5",
                !block.visible && "opacity-50"
              )}
            >
              {(isEntry ||
                block.type === "certification" ||
                block.type === "custom_text") && (
                <F
                  label={
                    block.type === "education_item"
                      ? t("学校", "School")
                      : block.type === "work_experience_item"
                      ? t("公司", "Company")
                      : block.type === "project_experience_item"
                      ? t("项目名称", "Project Name")
                      : block.type === "certification"
                      ? t("名称", "Title")
                      : t("标题", "Heading")
                  }
                >
                  <input
                    className="field-input"
                    value={block.title}
                    placeholder={
                      block.type === "education_item"
                        ? t("XX 大学", "Stanford University")
                        : block.type === "custom_text"
                        ? t("分类或标题（可选）", "Category or heading (optional)")
                        : t("公司 / 项目名", "Company / Project")
                    }
                    onChange={(e) =>
                      patchBlock(
                        resume.id,
                        section.section_id,
                        block.block_id,
                        { title: e.target.value }
                      )
                    }
                  />
                </F>
              )}
              {(isEntry || (block.type === "custom_text" && (showExtras || !!block.subtitle || !!block.subtitles?.length))) && (
                <Fragment>
                  <F
                    label={
                      block.type === "education_item"
                        ? t("专业与学历", "Degree & Major")
                        : block.type === "custom_text"
                        ? t("补充信息", "Subtitle")
                        : t("职位或角色", "Role / Title")
                    }
                  >
                    <input
                      className="field-input"
                      value={block.subtitle}
                      placeholder={
                        block.type === "education_item"
                          ? t("专业 · 学历", "M.S. in Computer Science")
                          : block.type === "custom_text"
                          ? t("补充说明（可选）", "Details (optional)")
                          : t("职位 / 角色", "Staff ML Engineer")
                      }
                      onChange={(e) =>
                        patchBlock(
                          resume.id,
                          section.section_id,
                          block.block_id,
                          { subtitle: e.target.value }
                        )
                      }
                    />
                  </F>
                  <details className="sm:col-span-2" open={block.subtitles?.length ? true : undefined}>
                    <summary className="cursor-pointer text-[12px] text-ink-500">
                      {t("更多补充信息", "More Subtitles")}
                    </summary>
                  {(block.subtitles ?? []).length > 0 && (
                    <div className="sm:col-span-2 flex flex-col gap-1.5">
                      {block.subtitles!.map((st, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span
                            className="shrink-0 text-[12px] text-ink-500"
                            aria-hidden="true"
                          >
                            ·
                          </span>
                          <input
                            className="field-input min-w-0 flex-1"
                            value={st}
                            placeholder={
                              block.type === "education_item"
                                ? t("补充专业与学历", "Additional degree / GPA / honors")
                                : t("补充职位或角色", "Additional role or team")
                            }
                            onChange={(e) => {
                              const next = [...(block.subtitles ?? [])];
                              next[i] = e.target.value;
                              patchBlock(
                                resume.id,
                                section.section_id,
                                block.block_id,
                                { subtitles: next }
                              );
                            }}
                          />
                          <button
                            className="tool-btn hover:bg-danger-100 hover:text-danger-600"
                            aria-label={`${t("删除副标题", "Remove subtitle")} ${i + 1}`}
                            onClick={() =>
                              patchBlock(
                                resume.id,
                                section.section_id,
                                block.block_id,
                                {
                                  subtitles: (block.subtitles ?? []).filter(
                                    (_, j) => j !== i
                                  ),
                                }
                              )
                            }
                          >
                            <IconTrash size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="sm:col-span-2 self-start inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 transition hover:text-brand-700"
                    onClick={() =>
                      patchBlock(
                        resume.id,
                        section.section_id,
                        block.block_id,
                        { subtitles: [...(block.subtitles ?? []), ""] }
                      )
                    }
                  >
                    <IconPlus size={12} />{" "}
                    {block.type === "education_item"
                      ? t("补充专业与学历", "Add Degree / Honors")
                      : t("补充职位或角色", "Add Role / Team")}
                  </button>
                  </details>
                </Fragment>
              )}
              {isEntry && (
                <>
                  <F label={t("开始时间", "Start Date")}>
                    <input
                      className="field-input font-mono"
                      value={block.start_date}
                      placeholder="2021-03"
                      onChange={(e) =>
                        patchBlock(
                          resume.id,
                          section.section_id,
                          block.block_id,
                          { start_date: e.target.value }
                        )
                      }
                    />
                  </F>
                  <F label={t("结束时间", "End Date")}>
                    <input
                      className="field-input font-mono"
                      value={block.end_date}
                      placeholder={t("至今 / 2024-06", "Present / 2024-06")}
                      onChange={(e) =>
                        patchBlock(
                          resume.id,
                          section.section_id,
                          block.block_id,
                          { end_date: e.target.value }
                        )
                      }
                    />
                  </F>
                  <F label={t("所在城市 / 地点（可选）", "Location (Optional)")} className="@md:col-span-2">
                    <input
                      className="field-input"
                      value={block.location}
                      placeholder={t("如：杭州 / 上海 · 远程", "e.g., San Francisco / Remote")}
                      onChange={(e) =>
                        patchBlock(
                          resume.id,
                          section.section_id,
                          block.block_id,
                          { location: e.target.value }
                        )
                      }
                    />
                  </F>
                </>
              )}
              {block.type === "certification" && (
                <F label={t("时间", "Year / Date")}>
                  <input
                    className="field-input font-mono"
                    value={block.start_date}
                    placeholder="2024"
                    onChange={(e) =>
                      patchBlock(
                        resume.id,
                        section.section_id,
                        block.block_id,
                        { start_date: e.target.value }
                      )
                    }
                  />
                </F>
              )}

              {block.type === "summary" || block.type === "custom_text" ? (
                <div className="sm:col-span-2 min-w-0">
                  <span className="field-label">
                    {section.type === "summary"
                      ? t("个人总结", "Summary")
                      : section.type === "skills"
                      ? t("技能说明", "Skills Overview")
                      : t("正文", "Body")}
                  </span>
                  <RichTextEditor
                    ariaLabel={section.type === "summary" ? t("个人总结", "Summary") : t("正文", "Body")}
                    value={block.description}
                    onChange={(html) =>
                      patchBlock(
                        resume.id,
                        section.section_id,
                        block.block_id,
                        { description: html }
                      )
                    }
                    placeholder={
                      section.type === "summary"
                        ? t("简要介绍经验、专长与代表成果", "Brief overview of experience, strengths, and key impact")
                        : t("填写内容", "Enter content")
                    }
                  />
                </div>
              ) : null}

              {block.type === "project_experience_item" && (
                <F label={t("技能标签", "Skills / Tags")} className="sm:col-span-2">
                  <TagInput
                    values={block.skills}
                    onChange={(v) =>
                      patchBlock(
                        resume.id,
                        section.section_id,
                        block.block_id,
                        { skills: v }
                      )
                    }
                    placeholder={t("React、TypeScript…", "PyTorch, JAX, TypeScript…")}
                  />
                </F>
              )}

              {block.type === "custom_text" && !(showExtras || block.subtitle || block.subtitles?.length) && (
                <button className="text-left text-[13px] text-ink-500" onClick={() => setShowExtras(true)}>
                  {t("添加补充信息", "Add Subtitle")}
                </button>
              )}
              {((block.type === "summary" || block.type === "custom_text") && !(showPoints || block.bullets.length > 0)) && (
                <button className="sm:col-span-2 text-left text-[13px] text-brand-700" onClick={() => setShowPoints(true)}>
                  {t("添加要点列表", "Add Bullet List")}
                </button>
              )}
              {(isEntry || ((block.type === "custom_text" || block.type === "summary") && (showPoints || block.bullets.length > 0))) && (
                <BulletsEdit
                  label={
                    block.type === "summary"
                      ? t("总结要点", "Summary Highlights")
                      : block.type === "custom_text"
                      ? t("内容要点", "Highlights")
                      : block.type === "education_item"
                      ? t("在校经历（可选）", "Coursework & Honors (Optional)")
                      : t("主要成果", "Key Achievements")
                  }
                  value={block.bullets}
                  marks={block.bullet_marks}
                  onChange={(v) =>
                    patchBlock(resume.id, section.section_id, block.block_id, {
                      bullets: v,
                    })
                  }
                  onMarksChange={(m) =>
                    patchBlock(resume.id, section.section_id, block.block_id, {
                      bullet_marks: m,
                    })
                  }
                  bulletStyle={bulletStyle}
                  onBulletStyleChange={onBulletStyleChange}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Confirm
        open={confirmDel}
        danger
        title={t("删除该条目？", "Delete this entry?")}
        desc={t(
          `「${preview}」将从简历中移除，此操作不可撤销。`,
          `"${preview}" will be permanently removed from this resume.`
        )}
        confirmText={t("删除", "Delete")}
        onConfirm={() => {
          deleteBlock(resume.id, section.section_id, block.block_id);
          setConfirmDel(false);
        }}
        onCancel={() => setConfirmDel(false)}
      />
    </div>
  );
}

/* ---------------- Section 卡片 ---------------- */

/** 单实例个人总结直编面板：消除冗余的「1条 + 折叠头 + 添加个人总结」套娃 */
function SummarySingletonEditor({
  resume,
  section,
  block,
  bulletStyle,
  onBulletStyleChange,
}: {
  resume: Resume;
  section: Section;
  block: Block;
  bulletStyle: BulletStyleKey;
  onBulletStyleChange: (v: BulletStyleKey) => void;
}) {
  const { patchBlock } = useAppSlice("patchBlock");
  const t = useT();
  const [showPoints, setShowPoints] = useState(block.bullets.length > 0);
  return (
    <div data-block-id={block.block_id} className="flex flex-col gap-3 px-4 pb-4 pt-1">
      <div className="min-w-0">
        <RichTextEditor
          ariaLabel={t("个人总结", "Summary")}
          value={block.description}
          onChange={(html) =>
            patchBlock(resume.id, section.section_id, block.block_id, {
              description: html,
            })
          }
          placeholder={t(
            "简要介绍经验、专长与代表成果",
            "Brief overview of experience, strengths, and key impact"
          )}
        />
      </div>
      {!(showPoints || block.bullets.length > 0) ? (
        <button
          type="button"
          className="self-start text-[12.5px] font-medium text-brand-700 hover:text-brand-800"
          onClick={() => setShowPoints(true)}
        >
          + {t("添加要点列表", "Add Bullet List")}
        </button>
      ) : (
        <BulletsEdit
          label={t("总结要点", "Summary Highlights")}
          value={block.bullets}
          marks={block.bullet_marks}
          onChange={(v) =>
            patchBlock(resume.id, section.section_id, block.block_id, {
              bullets: v,
            })
          }
          onMarksChange={(m) =>
            patchBlock(resume.id, section.section_id, block.block_id, {
              bullet_marks: m,
            })
          }
          bulletStyle={bulletStyle}
          onBulletStyleChange={onBulletStyleChange}
        />
      )}
    </div>
  );
}

export function SectionCard({
  resume,
  section,
  onRequestAI,
  dragHandle,
  revealLocation,
}: {
  resume: Resume;
  section: Section;
  onRequestAI: (sectionId: string, blockId: string, action: AIAction) => void;
  dragHandle?: ReactNode;
  revealLocation?: ResumeLocation | null;
}) {
  const {
    addBlock,
    toggleSection,
    deleteSection,
    renameSection,
    setSectionBulletStyle,
    setSectionType,
  } = useAppSlice(
    "addBlock",
    "toggleSection",
    "deleteSection",
    "renameSection",
    "setSectionBulletStyle",
    "setSectionType"
  );
  const [confirmDel, setConfirmDel] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [secMenuOpen, setSecMenuOpen] = useState(false);
  const secMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!secMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!secMenuRef.current?.contains(e.target as Node)) setSecMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSecMenuOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [secMenuOpen]);
  const [collapsed, setCollapsed] = useState(false);
  const t = useT();
  const jd = useApp((s) => s.jds[resume.id]);
  const visibleBlocks = section.blocks;
  // 模块级要点样式：本模块设置优先，未设置则继承全局默认
  const bulletStyle: BulletStyleKey = resolveBulletStyle(
    section.bullet_style,
    resume.theme.bullet_style
  );
  const setBulletStyle = (v: BulletStyleKey) =>
    setSectionBulletStyle(resume.id, section.section_id, v);

  return (
    <section
      className={cx(
        "group/sec soft-panel rounded-[22px] transition-all duration-200",
        !section.visible && "opacity-65"
      )}
    >
      <header data-editor-location-heading className="flex items-center gap-2 px-4 pb-2 pt-3.5">
        {dragHandle}
        {editingTitle ? (
          <input
            autoFocus
            defaultValue={section.title}
            onBlur={(e) => {
              renameSection(
                resume.id,
                section.section_id,
                e.target.value.trim() || section.title
              );
              setEditingTitle(false);
            }}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.target as HTMLInputElement).blur()
            }
            className="field-input max-w-[180px] py-0.5 font-display text-[15px] font-bold"
          />
        ) : (
          <h3
            onDoubleClick={() => {
              if (section.type !== "basic_info") setEditingTitle(true);
            }}
            title={section.type !== "basic_info" ? "双击可重命名栏目" : undefined}
            className={cx(
              "font-display text-[15.5px] font-bold text-ink-900",
              section.type !== "basic_info" && "cursor-text"
            )}
          >
            {section.title}
            {section.type === "custom" && (
              <span className="ml-1.5 align-middle text-[12px] font-normal text-ink-500">
                自定义
              </span>
            )}
          </h3>
        )}
        {section.type !== "basic_info" && section.type !== "summary" && visibleBlocks.length > 0 && (
          <span className="text-[12px] text-ink-400">
            {t(`${visibleBlocks.length} 条`, `${visibleBlocks.length} ${visibleBlocks.length === 1 ? "item" : "items"}`)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {section.type === "summary" && visibleBlocks.length === 1 && (
            <AIActionMenu
              hasJD={!!jd}
              onAction={(a) =>
                onRequestAI(section.section_id, visibleBlocks[0].block_id, a)
              }
            />
          )}
          <div className="flex items-center gap-0.5 opacity-45 transition-opacity group-hover/sec:opacity-100 focus-within:opacity-100">
          {section.type !== "basic_info" && (
            <div ref={secMenuRef} className="relative">
              <button
                type="button"
                className={cx(
                  "tool-btn",
                  secMenuOpen && "bg-brand-50 text-brand-700"
                )}
                aria-label={t("栏目设置", "Section settings")}
                aria-expanded={secMenuOpen}
                title={t("栏目设置（用途与重命名）", "Section settings (type & rename)")}
                onClick={() => setSecMenuOpen((v) => !v)}
              >
                <IconSettings size={15} />
              </button>
              {secMenuOpen && (
                <div className="liquid-glass absolute right-0 top-full z-30 mt-1.5 w-60 rounded-2xl p-3.5">
                  <div className="block text-[12px] font-medium text-ink-600">
                    <span className="mb-1.5 block">{t("栏目用途", "Section Type")}</span>
                    <GlassSelect
                      ariaLabel={`${t("栏目用途", "Section type")}: ${section.title}`}
                      className="w-full"
                      value={section.type}
                      onChange={(v) =>
                        setSectionType(
                          resume.id,
                          section.section_id,
                          v as Exclude<SectionType, "basic_info">
                        )
                      }
                      options={Object.entries(SECTION_LABELS)
                        .filter(([type]) => type !== "basic_info")
                        .map(([type, label]) => ({
                          value: type,
                          label: t(label, EN_SECTION_LABELS[type as SectionType] ?? label),
                        }))}
                    />
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-full bg-subtle px-3 py-1.5 text-center text-[12.5px] font-medium text-brand-700 transition hover:bg-brand-50"
                    onClick={() => {
                      setSecMenuOpen(false);
                      setEditingTitle(true);
                    }}
                  >
                    {t("重命名栏目", "Rename Section")}
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="tool-btn rounded-full"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={!collapsed}
            aria-label={collapsed ? t("展开模块", "Expand section") : t("折叠模块", "Collapse section")}
            title={collapsed ? t("展开模块", "Expand section") : t("折叠模块", "Collapse section")}
          >
            <IconChevronDown
              size={15}
              className={cx("transition-transform duration-200", collapsed && "-rotate-90")}
            />
          </button>
          <button
            className="tool-btn rounded-full"
            onClick={() => toggleSection(resume.id, section.section_id)}
            aria-label={t("显示/隐藏模块", "Toggle visibility")}
            title={
              section.visible
                ? t("隐藏模块（保留排序位置，不参与预览/导出）", "Hide section from preview & export")
                : t("显示模块", "Show section")
            }
          >
            {section.visible ? <IconEye size={15} /> : <IconEyeOff size={15} />}
          </button>
          {section.type === "custom" && (
            <button
              className="tool-btn rounded-full hover:bg-danger-100 hover:text-danger-600"
              onClick={() => setConfirmDel(true)}
              aria-label={t("删除模块", "Delete section")}
            >
              <IconTrash size={15} />
            </button>
          )}
          </div>
        </div>
      </header>

      {collapsed ? null : !section.visible ? (
        <p className="px-4 py-3 text-[12px] text-ink-400">
          {t("栏目已隐藏，不参与预览和导出。", "Section hidden from preview and export.")}
        </p>
      ) : section.type === "basic_info" ? (
        <BasicInfoEditor resume={resume} />
      ) : visibleBlocks.length === 0 ? (
        <div className="flex items-center justify-between px-4 py-3">
          <p className="text-[12px] text-ink-500">{t("暂无内容", "No entries yet")}</p>
          <button
            onClick={() => addBlock(resume.id, section.section_id)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 transition hover:text-brand-700"
          >
            <IconPlus size={13} />{" "}
            {t(
              `添加${section.type === "custom" ? section.title : SECTION_LABELS[section.type]}`,
              `Add ${section.type === "custom" ? section.title : EN_SECTION_LABELS[section.type]}`
            )}
          </button>
        </div>
      ) : section.type === "summary" && visibleBlocks.length === 1 ? (
        <SummarySingletonEditor
          resume={resume}
          section={section}
          block={visibleBlocks[0]}
          bulletStyle={bulletStyle}
          onBulletStyleChange={setBulletStyle}
        />
      ) : (
        <div className="flex flex-col gap-2 p-2.5">
          {visibleBlocks.map((b, i) => (
            <BlockCard
              key={b.block_id}
              resume={resume}
              section={section}
              block={b}
              index={i}
              total={visibleBlocks.length}
              onRequestAI={onRequestAI}
              bulletStyle={bulletStyle}
              onBulletStyleChange={setBulletStyle}
              revealLocation={revealLocation}
            />
          ))}
          <button
            onClick={() => addBlock(resume.id, section.section_id)}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink-200 py-2 text-[12px] font-medium text-ink-400 transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
          >
            <IconPlus size={13} />{" "}
            {t(
              `添加${section.type === "custom" ? section.title : SECTION_LABELS[section.type]}`,
              `Add ${section.type === "custom" ? section.title : EN_SECTION_LABELS[section.type]}`
            )}
          </button>
        </div>
      )}

      <Confirm
        open={confirmDel}
        danger
        title={t("删除整个模块？", "Delete entire section?")}
        desc={t(
          `「${section.title}」及其 ${section.blocks.length} 个条目将被移除。`,
          `"${section.title}" and its ${section.blocks.length} entries will be removed.`
        )}
        confirmText={t("删除模块", "Delete Section")}
        onConfirm={() => {
          deleteSection(resume.id, section.section_id);
          setConfirmDel(false);
        }}
        onCancel={() => setConfirmDel(false)}
      />
    </section>
  );
}

function ImageUploadField({
  label,
  url,
  onFile,
  onClear,
  rounded,
  placeholder,
}: {
  label: string;
  url?: string;
  onFile: (file: File) => void;
  onClear: () => void;
  rounded: string;
  placeholder: string;
}) {
  const id = useId();
  const t = useT();
  return (
    <div className="block min-w-0">
      <span className="field-label">{label}</span>
      <div className="flex items-center gap-2">
        <div
          className={cx(
            "h-14 w-14 shrink-0 overflow-hidden bg-paper-100 ring-1 ring-ink-100",
            rounded
          )}
        >
          {url ? (
            <img src={url} alt={label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[1.1em] font-bold text-ink-500">
              {placeholder}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor={id}
            className="inline-flex cursor-pointer items-center gap-1 text-[12px] font-medium text-brand-600 hover:text-brand-700"
          >
            <IconUpload size={12} /> {t("上传", "Upload")}
          </label>
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
          {url && (
            <button
              type="button"
              onClick={onClear}
              className="text-left text-[12px] text-danger-600 hover:text-danger-700"
            >
              {t("清除", "Clear")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function BasicInfoEditor({ resume }: { resume: Resume }) {
  const { patchBasic, setAvatar, setSchoolBadge, toast } = useAppSlice(
    "patchBasic",
    "setAvatar",
    "setSchoolBadge",
    "toast"
  );
  const t = useT();
  const b = resume.data.basic_info;
  const fields: Array<{
    key: "name" | "title" | "email" | "phone" | "location" | "website";
    label: string;
    ph: string;
  }> = [
    { key: "name", label: t("姓名", "Full Name"), ph: t("张三", "Alex Chen") },
    { key: "title", label: t("目标职位", "Target Role"), ph: t("高级前端工程师", "Senior Frontend Engineer") },
    { key: "email", label: t("邮箱", "Email"), ph: "you@example.com" },
    { key: "phone", label: t("电话", "Phone"), ph: "138-0000-0000" },
    { key: "location", label: t("所在城市", "Location"), ph: t("上海", "San Francisco") },
    { key: "website", label: t("主页 / GitHub", "Website / GitHub"), ph: "github.com/you" },
  ];

  const handleImage = async (
    file: File | undefined,
    setter: (url: string | null) => void,
    label: string
  ) => {
    if (!file) return;
    try {
      const url = await fileToDataUrl(file);
      setter(url);
      toast("ok", `${label}已更新`);
    } catch (e) {
      toast("err", e instanceof Error ? e.message : "上传失败");
    }
  };

  return (
    <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 px-3 py-3 @xl:grid-cols-2">
      {fields.map((f) => (
        <RichField
          key={f.key}
          label={f.label}
          value={b[f.key]}
          placeholder={f.ph}
          onChange={(v) => patchBasic(resume.id, { [f.key]: v })}
        />
      ))}
      {/* 头像/校徽仅学术双栏模板渲染（template.tsx 中只有该分支使用），单栏与 ATS 不提供上传入口 */}
      {resume.template_id === "academic_photo" && (
        <>
          <ImageUploadField
            label={t("头像", "Photo")}
            url={resume.data.avatar_url}
            onFile={(file) =>
              handleImage(file, (url) => setAvatar(resume.id, url), t("头像", "Photo"))
            }
            onClear={() => setAvatar(resume.id, null)}
            rounded="rounded-lg"
            placeholder="?"
          />
          <ImageUploadField
            label={t("校徽", "School Badge")}
            url={resume.data.school_badge_url}
            onFile={(file) =>
              handleImage(file, (url) => setSchoolBadge(resume.id, url), t("校徽", "School Badge"))
            }
            onClear={() => setSchoolBadge(resume.id, null)}
            rounded="rounded-full"
            placeholder={t("校", "U")}
          />
        </>
      )}
      {/* 自定义信息项：固定六项之外的补充字段（如 期望薪资 / 政治面貌），随联系方式一行渲染 */}
      <div className="sm:col-span-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="field-label">{t("补充信息", "Additional Info")}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-600 transition hover:text-brand-700"
            onClick={() =>
              patchBasic(resume.id, {
                custom_fields: [
                  ...(b.custom_fields ?? []),
                  { label: "", value: "" },
                ],
              })
            }
          >
            <IconPlus size={12} /> {t("添加信息", "Add Field")}
          </button>
        </div>
        {(b.custom_fields ?? []).length === 0 && (
          <details className="text-[12px] text-ink-500">
            <summary className="cursor-pointer">{t("哪些信息适合放在这里？", "What belongs here?")}</summary>
            <p className="mt-1">
              {t(
                "可按岗位要求补充到岗时间等信息，填写名称与内容后显示在简历上。",
                "Add optional items like work authorization, availability, or LinkedIn URL."
              )}
            </p>
          </details>
        )}
        {(b.custom_fields ?? []).length > 0 && (
          <div className="flex flex-col gap-1.5">
            {(b.custom_fields ?? []).map((f, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  className="field-input w-24 shrink-0"
                  value={f.label}
                  placeholder={t("字段名", "Label")}
                  aria-label={`${t("信息项字段名", "Custom field label")} ${i + 1}`}
                  onChange={(e) => {
                    const next = [...(b.custom_fields ?? [])];
                    next[i] = { ...next[i], label: e.target.value };
                    patchBasic(resume.id, { custom_fields: next });
                  }}
                />
                <input
                  className="field-input min-w-0 flex-1"
                  value={f.value}
                  placeholder={t("内容（如 20-30k）", "Value (e.g., US Citizen / LinkedIn)")}
                  aria-label={`${t("信息项内容", "Custom field value")} ${i + 1}`}
                  onChange={(e) => {
                    const next = [...(b.custom_fields ?? [])];
                    next[i] = { ...next[i], value: e.target.value };
                    patchBasic(resume.id, { custom_fields: next });
                  }}
                />
                <button
                  type="button"
                  className="tool-btn hover:bg-danger-100 hover:text-danger-600"
                  aria-label={`删除信息项 ${f.label || i + 1}`}
                  onClick={() =>
                    patchBasic(resume.id, {
                      custom_fields: (b.custom_fields ?? []).filter(
                        (_, j) => j !== i
                      ),
                    })
                  }
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
