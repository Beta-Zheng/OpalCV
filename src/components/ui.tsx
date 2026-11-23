import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { enterTransition, exitTransition, PresenceLayer } from "./motion-layer";
import { cx } from "../lib/utils";
import { useApp, flushSave, forceSave, reloadFromStorage } from "../lib/store";
import { useT } from "../lib/i18n";
import { IconAlert, IconCheck, IconInfo, IconX } from "./icons";

/** Shared keyboard and dismissal behavior for anchored action menus. */
export function useActionMenu(
  open: boolean,
  setOpen: (open: boolean) => void,
  container: React.RefObject<HTMLDivElement>
) {
  const startAtEnd = useRef(false);
  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const trigger = () => root.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
    const items = () => Array.from(root.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)'));
    const position = () => {
      const menu = root.querySelector<HTMLElement>('[role="menu"]');
      const anchor = trigger();
      if (!open || !menu || !anchor) return;
      let top = 8, bottom = window.innerHeight - 8;
      for (let parent = root.parentElement; parent; parent = parent.parentElement) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowY)) {
          const bounds = parent.getBoundingClientRect();
          top = Math.max(top, bounds.top);
          bottom = Math.min(bottom, bounds.bottom);
        }
      }
      const bounds = anchor.getBoundingClientRect();
      const below = bottom - bounds.bottom - 6;
      const above = bounds.top - top - 6;
      const upwards = below < Math.min(menu.scrollHeight, 360) && above > below;
      menu.style.top = upwards ? "auto" : "100%";
      menu.style.bottom = upwards ? "calc(100% + 6px)" : "auto";
      menu.style.marginTop = upwards ? "0" : "6px";
      menu.style.maxHeight = `${Math.max(48, Math.min(360, upwards ? above : below))}px`;
    };
    const frame = open ? requestAnimationFrame(() => {
      position();
      const options = items();
      (options.find((item) => item.getAttribute("aria-checked") === "true") ??
        (startAtEnd.current ? options[options.length - 1] : options[0]))?.focus();
      startAtEnd.current = false;
    }) : undefined;
    const onKey = (event: KeyboardEvent) => {
      if (!open) {
        if (event.target === trigger() && ["ArrowDown", "ArrowUp"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          startAtEnd.current = event.key === "ArrowUp";
          setOpen(true);
        }
        return;
      }
      if (event.key === "Escape" || event.key === "Tab") {
        if (event.key === "Escape") event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        trigger()?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      event.stopPropagation();
      const options = items();
      const index = options.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 :
        (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
      options[next]?.focus();
    };
    const onOutside = (event: PointerEvent) => {
      if (open && !root.contains(event.target as Node)) setOpen(false);
    };
    const onBlur = (event: FocusEvent) => {
      if (open && !root.contains(event.relatedTarget as Node)) setOpen(false);
    };
    const onActivate = (event: MouseEvent) => {
      if ((event.target as Element).closest('[role^="menuitem"]')) trigger()?.focus();
    };
    root.addEventListener("keydown", onKey);
    root.addEventListener("focusout", onBlur);
    root.addEventListener("click", onActivate);
    document.addEventListener("pointerdown", onOutside);
    if (open) {
      window.addEventListener("resize", position);
      window.addEventListener("scroll", position, true);
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      root.removeEventListener("keydown", onKey);
      root.removeEventListener("focusout", onBlur);
      root.removeEventListener("click", onActivate);
      document.removeEventListener("pointerdown", onOutside);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open, setOpen, container]);
}

/* ---------------- 按钮 ---------------- */

type BtnVariant = "primary" | "dark" | "ghost" | "outline" | "danger" | "seal";

export function Btn({
  variant = "outline",
  size = "md",
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
}) {
  const styles: Record<BtnVariant, string> = {
    primary: "cta-ai text-white",
    dark: "bg-ink-900 text-white hover:bg-ink-800",
    ghost: "text-ink-600 hover:bg-subtle hover:text-ink-900",
    outline:
      "bg-subtle text-ink-800 hover:bg-paper-200 hover:text-ink-900",
    danger:
      "bg-danger-100/80 text-danger-700 hover:bg-danger-100",
    seal: "bg-seal-600 text-white hover:bg-seal-700",
  };
  return (
    <button
      type="button"
      data-size={size}
      data-variant={variant}
      className={cx(
        "app-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-[14px] font-medium leading-5 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-45",
        styles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

/* ---------------- 弹窗 ---------------- */

export function Modal({
  open,
  onClose,
  children,
  width = "max-w-lg",
  bare,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  bare?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion();
  const headingId = useId();
  const [labelledBy, setLabelledBy] = useState<string>();
  useEffect(() => {
    if (!open) { setLabelledBy(undefined); return; }
    const heading = dialogRef.current?.querySelector<HTMLElement>('h1,h2,h3');
    if (heading) { heading.id ||= headingId; setLabelledBy(heading.id); }
  }, [open, headingId]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () =>
      [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),select:not([disabled]),a[href],[tabindex="0"]'
        ) ?? []),
      ].filter((el) => el.getClientRects().length > 0);
    const frame = requestAnimationFrame(() =>
      (controls()[0] ?? dialogRef.current)?.focus()
    );
    const onKey = (e: KeyboardEvent) => {
      const dialogs = Array.from(document.querySelectorAll("[data-app-dialog]"))
        .filter((dialog) => !dialog.closest("[inert]"));
      if (dialogs[dialogs.length - 1] !== dialogRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const fields = controls();
        const first = fields[0];
        const last = fields[fields.length - 1];
        if (!fields.length) {
          e.preventDefault();
          dialogRef.current?.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first ||
            !dialogRef.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            !dialogRef.current?.contains(document.activeElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && <PresenceLayer key="modal" className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 bg-ink-950/35 backdrop-blur-[6px]"
          onClick={onClose}
        />
        <motion.div
          ref={dialogRef}
          data-app-dialog
          role="dialog"
          aria-modal="true"
          aria-label={labelledBy ? undefined : '简历操作对话框'}
          aria-labelledby={labelledBy}
          tabIndex={-1}
          initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.97, y: reducedMotion ? 0 : 8 }}
          animate={{
            opacity: 1,
            scale: 1,
            y: 0,
            transition: enterTransition,
          }}
          exit={{
            scale: reducedMotion ? 1 : 0.98,
            y: reducedMotion ? 0 : 4,
            transition: exitTransition,
          }}
          className={cx(
            "liquid-glass relative w-full overflow-hidden rounded-[28px]",
            width
          )}
        >
          {bare ? (
            children
          ) : (
            <div className="max-h-[86vh] overflow-y-auto">{children}</div>
          )}
        </motion.div>
      </PresenceLayer>}
    </AnimatePresence>
  );
}

export function ModalHeader({
  title,
  sub,
  infoTip,
  onClose,
}: {
  title: ReactNode;
  sub?: ReactNode;
  infoTip?: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pb-3 pt-5">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-[19px] font-bold leading-7 tracking-tight text-ink-900">
            {title}
          </h3>
          {infoTip && <InfoTip align="left" content={infoTip} />}
        </div>
        {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
      </div>
      {onClose && (
        <button onClick={onClose} className="tool-btn modal-close -mr-1 rounded-full" aria-label="关闭">
          <IconX size={16} />
        </button>
      )}
    </div>
  );
}

/* ---------------- 确认弹窗 ---------------- */

export function Confirm({
  open,
  title,
  desc,
  confirmText,
  danger,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  desc?: ReactNode;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const t = useT();
  const resolvedConfirm = confirmText ?? t("确认", "Confirm");
  return (
    <Modal open={open} onClose={onCancel} width="max-w-sm">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <span
            className={cx(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              danger
                ? "bg-danger-100 text-danger-600"
                : "bg-seal-100 text-seal-600"
            )}
          >
            <IconAlert size={16} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-ink-900">{title}</h3>
            {desc && (
              <div className="mt-1 text-[13px] leading-relaxed text-ink-500">
                {desc}
              </div>
            )}
            {children}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={onCancel}>
            {t("取消", "Cancel")}
          </Btn>
          <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {resolvedConfirm}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- 开关 ---------------- */

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "app-switch relative inline-flex h-10 w-11 shrink-0 items-center justify-center rounded-sm"
      )}
    >
      <span className={cx("relative h-6 w-11 rounded-full transition-colors duration-150", checked ? "bg-brand-600" : "bg-ink-400")}>
        <span className={cx("absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
      </span>
    </button>
  );
}

/* ---------------- 评分环 ---------------- */

export function ScoreRing({
  score,
  size = 92,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color =
    score >= 75
      ? "var(--color-brand-600)"
      : score >= 50
      ? "var(--color-seal-500)"
      : "var(--color-danger-600)";
  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * score) / 100}
          style={{
            ["--ring-c" as string]: `${c}`,
            transition: "stroke-dashoffset .2s",
          }}
          className="anim-ring-draw"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono text-[22px] font-bold leading-none"
          style={{ color }}
        >
          {score}
        </span>
        {label && (
          <span className="mt-1 text-[10px] text-ink-400">{label}</span>
        )}
      </div>
    </div>
  );
}

export function ScoreBar({ label, score }: { label: string; score: number }) {
  const color =
    score >= 75
      ? "bg-brand-500"
      : score >= 50
      ? "bg-seal-500"
      : "bg-danger-600";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-ink-500">{label}</span>
        <span className="font-mono font-bold text-ink-800">{score}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-200">
        <div
          className={cx("anim-bar-grow h-full rounded-full", color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/* ---------------- Toast ---------------- */

export function ToastHost() {
  const reducedMotion = useReducedMotion();
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  const iconOf = {
    ok: <IconCheck size={14} />,
    warn: <IconAlert size={14} />,
    err: <IconAlert size={14} />,
    info: <IconInfo size={14} />,
  };
  const iconTone = {
    ok: "text-brand-600",
    warn: "text-seal-600",
    err: "text-danger-600",
    info: "text-brand-600",
  };
  return (
    <div className="pointer-events-none fixed left-1/2 top-4 z-[85] flex w-[min(360px,calc(100vw-32px))] -translate-x-1/2 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout={reducedMotion ? false : "position"}
            initial={{ opacity: 0, y: reducedMotion ? 0 : -10, scale: 0.97 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              transition: enterTransition,
            }}
            exit={{
              opacity: 0,
              y: reducedMotion ? 0 : -8,
              scale: 0.97,
              transition: exitTransition,
            }}
            className="glass-tip pointer-events-auto relative flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-[12.5px] font-medium text-ink-900"
          >
            <span className={cx("shrink-0", iconTone[t.kind])}>{iconOf[t.kind]}</span>
            <span className="min-w-0 flex-1 leading-snug">{t.msg}</span>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-full p-0.5 text-ink-400 transition hover:bg-subtle hover:text-ink-900"
              aria-label="关闭提示"
            >
              <IconX size={12} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- 自动保存状态指示 ---------------- */

export function SaveIndicator({ compact = false }: { compact?: boolean } = {}) {
  const lastSavedAt = useApp((s) => s.lastSavedAt);
  const saveStatus = useApp((s) => s.saveStatus);
  const t = useT();
  const [flash, setFlash] = useState(false);
  const prev = useRef(lastSavedAt);
  useEffect(() => {
    if (lastSavedAt && lastSavedAt !== prev.current) {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 900);
      prev.current = lastSavedAt;
      return () => clearTimeout(timer);
    }
    prev.current = lastSavedAt;
  }, [lastSavedAt]);

  if (saveStatus === "conflict")
    return (
      <span role="alert" className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-amber-600">
        <span>
          {compact
            ? t("已在其他窗口修改", "Edited in another tab")
            : t("内容已在其他标签页更新：", "Updated in another tab: ")}
        </span>
        <button
          type="button"
          className="font-semibold underline hover:text-amber-700"
          onClick={() => void reloadFromStorage()}
        >
          {t("载入最新", "Load latest")}
        </button>
        <span aria-hidden="true">·</span>
        <button
          type="button"
          className="underline hover:text-amber-700"
          onClick={() => void forceSave()}
        >
          {t("覆盖保存", "Keep mine")}
        </button>
      </span>
    );
  if (saveStatus === "error")
    return (
      <span role="alert" className="text-[11px] text-danger-700">
        {compact
          ? t("保存失败 ", "Save failed ")
          : t("保存失败，请先下载备份并检查浏览器存储空间 ", "Save failed — download a backup and check storage ")}
        <button type="button" className="underline" onClick={() => void flushSave()}>
          {t("重试保存", "Retry")}
        </button>
      </span>
    );
  if (saveStatus === "saving")
    return (
      <span role="status" className="text-[11px] text-ink-400">
        {t("正在保存…", "Saving…")}
      </span>
    );
  if (!lastSavedAt)
    return (
      <span className="font-mono text-[11px] text-ink-300">
        {t("尚未修改", "No edits yet")}
      </span>
    );
  const d = new Date(lastSavedAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 font-mono text-[11px] transition-colors duration-300",
        flash ? "text-brand-600" : "text-ink-400"
      )}
    >
      <span
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          flash ? "anim-pulse-dot bg-brand-500" : "bg-brand-400"
        )}
      />
      {compact
        ? t("已保存", "Saved")
        : t(`仅此浏览器 · 已保存 ${hhmm}`, `Local only · Saved ${hhmm}`)}
    </span>
  );
}

/* ---------------- 空状态 ---------------- */

export function Empty({
  icon,
  title,
  desc,
  children,
  accent,
}: {
  icon: ReactNode;
  title: string;
  desc?: string;
  children?: ReactNode;
  accent?: "ai";
}) {
  return (
    <div className="anim-fade-up flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-surface/60 px-6 py-10 text-center">
      <span
        className={cx(
          "mb-3 flex h-12 w-12 items-center justify-center rounded-xl",
          accent === "ai"
            ? "ai-breathe text-white"
            : "bg-paper-200 text-ink-400"
        )}
        style={
          accent === "ai"
            ? {
                backgroundImage:
                  "linear-gradient(135deg, var(--color-sp-a), var(--color-sp-b) 55%, var(--color-sp-c))",
              }
            : undefined
        }
      >
        {icon}
      </span>
      <p className="text-[14px] font-bold text-ink-800">{title}</p>
      {desc && (
        <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-400">
          {desc}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ---------------- 极简 ⓘ 悬浮/点击说明气泡 ---------------- */

export function InfoTip(_props: {
  content: string;
  label?: string;
  align?: "left" | "center" | "right";
  className?: string;
}) {
  return null;
}

/* ---------------- 液态玻璃下拉选择器 ---------------- */

export function GlassSelect({
  value,
  options,
  onChange,
  placeholder = "请选择",
  ariaLabel,
  disabled,
  className,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useActionMenu(open, setOpen, containerRef);
  const current = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className={cx("relative inline-block", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cx(
          "liquid-input flex min-h-10 w-full items-center justify-between gap-2 rounded-full px-4 py-2 text-[13.5px] text-ink-900 transition-all disabled:cursor-not-allowed disabled:opacity-45",
          !current && "text-ink-400"
        )}
      >
        <span className="truncate">{current ? current.label : placeholder}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={cx("shrink-0 text-ink-400 transition-transform duration-150", open && "rotate-180")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="glass-tip app-menu absolute left-0 z-50 min-w-full rounded-2xl p-1.5"
        >
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cx(
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors",
                  active
                    ? "glass-lens font-semibold"
                    : "text-ink-700 hover:bg-subtle hover:text-ink-900"
                )}
              >
                <span className="truncate">{opt.label}</span>
                {active && <IconCheck size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
