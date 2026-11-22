import { Fragment, useState } from "react";
import type { Application, ApplicationStatus, ResumeSnapshot } from "../types";
import { useAppSlice } from "../lib/store";
import { appStatusLabel, useT, useUiLang } from "../lib/i18n";
import { nowISO, uid, fmtDate } from "../lib/utils";
import { Btn, Confirm, GlassSelect, InfoTip, Modal, ModalHeader } from "../components/ui";
import {
  APPLICATION_LABELS,
  TERMINAL_STATUSES,
  applicationStats,
  hasSubmission,
} from "../lib/applications";
import SnapshotView from "../components/snapshot-view";
import {
  IconFile,
  IconCheck,
  IconUser,
  IconAward,
  IconX,
  IconRefresh,
  IconAlert,
  IconEdit,
  IconEye,
  IconTrash,
  IconArrowRight,
} from "../components/icons";

export { APPLICATION_LABELS } from "../lib/applications";
const STATUS_ICONS = {
  saved: IconFile,
  applied: IconCheck,
  interview: IconUser,
  offer: IconAward,
  rejected: IconX,
  withdrawn: IconRefresh,
  closed: IconAlert,
};
const STATUS_COLORS = {
  saved: "bg-paper-100 text-ink-500",
  applied: "bg-brand-50 text-brand-700",
  interview: "bg-seal-100 text-seal-700",
  offer: "bg-ok-bg text-ok",
  rejected: "bg-danger-100 text-danger-700",
  withdrawn: "bg-paper-100 text-ink-500",
  closed: "bg-paper-100 text-ink-500",
};
const STATUS_DOTS: Record<ApplicationStatus, string> = {
  saved: "bg-slate-400",
  applied: "bg-sky-500",
  interview: "bg-indigo-500",
  offer: "bg-emerald-500",
  rejected: "bg-rose-400",
  withdrawn: "bg-slate-400",
  closed: "bg-slate-400",
};

/** 识别系统自动生成的默认状态日志，避免与状态标签重复刷屏 */
function isAutoEventNote(note?: string): boolean {
  const s = (note || "").trim();
  if (!s) return true;
  if (
    s === "创建投递记录" ||
    s === "更新投递状态" ||
    s === "旧记录当前状态，此前历史未知" ||
    s === "Current status"
  ) {
    return true;
  }
  return /^推进状态至「.*」$/.test(s) || /^Moved to /i.test(s);
}

/** 提取最近一条用户手写的真实反馈（跳过系统自动流水账） */
function latestUserFeedback(a: Application): string {
  const events = a.events || [];
  for (let i = events.length - 1; i >= 0; i--) {
    const n = (events[i].note || "").trim();
    if (!isAutoEventNote(n)) return n;
  }
  return "";
}

function shortDate(ymd: string, today: string): string {
  if (!ymd) return "";
  return ymd.slice(0, 4) === today.slice(0, 4) ? ymd.slice(5, 10) : ymd.slice(0, 10);
}

function shortTimestamp(iso: string, today: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(5, 16);
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return y === today.slice(0, 4) ? `${m}-${day} ${hh}:${mm}` : `${y}-${m}-${day} ${hh}:${mm}`;
}
function StatusBadge({ status }: { status: ApplicationStatus }) {
  const Icon = STATUS_ICONS[status];
  const uiLang = useUiLang();
  return (
    <span
      className={`chip inline-flex items-center gap-1 ${STATUS_COLORS[status]}`}
    >
      <Icon size={13} />
      {appStatusLabel(status, APPLICATION_LABELS[status], uiLang)}
    </span>
  );
}
export function ApplicationForm({
  initial,
  resumeId,
  onClose,
}: {
  initial?: Application;
  resumeId?: string;
  onClose: () => void;
}) {
  const app = useAppSlice("resumes", "snapshots", "saveApplication", "toast");
  const uiLang = useUiLang();
  const t = useT();
  const source =
    app.resumes.find((r) => r.id === (resumeId ?? initial?.resume_id)) ??
    app.resumes.find((r) => !r.archived_at);
  const [feedback, setFeedback] = useState("");
  const locked = !!initial?.snapshot_id && hasSubmission(initial);
  const [draft, setDraft] = useState<Application>(
    initial ?? {
      id: uid("application"),
      resume_id: source?.id ?? "",
      company: source?.target?.company ?? "",
      role: source?.target?.job_title ?? source?.data.basic_info.title ?? "",
      url: "",
      status: "saved",
      notes: "",
      applied_at: "",
      follow_up_at: "",
      created_at: nowISO(),
      updated_at: nowISO(),
    }
  );
  const patch = (value: Partial<Application>) =>
    setDraft((s) => ({ ...s, ...value }));
  const submit = () => {
    if (
      !draft.company.trim() ||
      !draft.role.trim() ||
      !app.resumes.some((r) => r.id === draft.resume_id)
    ) {
      app.toast("warn", "请填写公司、职位并选择简历");
      return;
    }
    if (draft.url.trim()) {
      try {
        const url = new URL(draft.url);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      } catch {
        app.toast("warn", "岗位链接需以 http:// 或 https:// 开头");
        return;
      }
    }
    const saved = app.saveApplication(
      {
        ...draft,
        company: draft.company.trim(),
        role: draft.role.trim(),
        applied_at:
          ["applied", "interview", "offer", "rejected"].includes(
            draft.status
          ) && !draft.applied_at
            ? fmtDate(nowISO())
            : draft.applied_at,
      },
      feedback
    );
    if (!saved) {
      app.toast("warn", "记录未保存，请检查关联简历与投递版本");
      return;
    }
    app.toast("ok", "投递记录已保存；该操作不会向企业发送简历");
    onClose();
  };
  return (
    <Modal open onClose={onClose}>
      <ModalHeader
        title={initial ? t("编辑投递记录", "Edit Application") : t("新增投递记录", "New Application")}
        sub={t("记录实际投递进度与当时版本，所有数据保存在本机", "Track real progress & pinned resume snapshot locally")}
        onClose={onClose}
      />
      <div className="flex flex-col gap-3 px-5 pb-5">
        {(
          [
            ["company", t("公司", "Company")],
            ["role", t("职位", "Role")],
            ["url", t("岗位链接", "Job URL")],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="text-[12px]">
            {label}
            <input
              className="field-input mt-1"
              value={draft[key]}
              onChange={(e) => patch({ [key]: e.target.value })}
            />
          </label>
        ))}
        <div className="text-[12px] text-ink-500">
          <span className="mb-1.5 block font-medium">{t("关联简历", "Linked Resume")}</span>
          <GlassSelect
            ariaLabel={t("关联简历", "Linked resume")}
            className="w-full"
            disabled={locked}
            placeholder={t("请选择", "Select…")}
            value={draft.resume_id}
            onChange={(v) => patch({ resume_id: v, snapshot_id: undefined })}
            options={app.resumes
              .filter((r) => !r.archived_at || r.id === draft.resume_id)
              .map((r) => ({ value: r.id, label: r.title }))}
          />
        </div>
        <div className="text-[12px] text-ink-500">
          <span className="mb-1.5 block font-medium">{t("投递时的版本", "Pinned Snapshot")}</span>
          <GlassSelect
            ariaLabel={t("投递时的版本", "Pinned snapshot")}
            className="w-full"
            disabled={locked}
            value={draft.snapshot_id ?? ""}
            onChange={(v) => patch({ snapshot_id: v || undefined })}
            options={[
              { value: "", label: t("实际投递时自动固定当前内容", "Auto-pin current version on apply") },
              ...app.snapshots
                .filter((s) => s.resume_id === draft.resume_id)
                .map((s) => ({
                  value: s.id,
                  label: `${s.label} · ${fmtDate(s.created_at)}`,
                })),
            ]}
          />
        </div>
        {locked && (
          <p className="text-[12px] text-ink-500">
            {t("投递版本已固定。再次使用不同简历投递，请新增记录。", "Snapshot is locked. Create a new record to apply with a different resume.")}
          </p>
        )}
        <div className="text-[12px] text-ink-500">
          <span className="mb-1.5 block font-medium">{t("状态", "Status")}</span>
          <GlassSelect
            ariaLabel={t("状态", "Status")}
            className="w-full"
            value={draft.status}
            onChange={(v) => patch({ status: v as ApplicationStatus })}
            options={Object.entries(APPLICATION_LABELS).map(([id, label]) => ({
              value: id,
              label: appStatusLabel(id, label, uiLang),
            }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ["applied_at", t("投递日期", "Applied Date")],
              ["follow_up_at", t("跟进日期", "Follow-up Date")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="text-[12px]">
              {label}
              <input
                type="date"
                className="field-input mt-1"
                value={draft[key]}
                onInput={(e) => patch({ [key]: e.currentTarget.value })}
                onChange={(e) => patch({ [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label className="text-[12px]">
          {t("备注", "Notes")}
          <textarea
            className="field-input mt-1"
            rows={3}
            value={draft.notes}
            onChange={(e) => patch({ notes: e.target.value })}
          />
        </label>
        <label className="text-[12px]">
          {t("新增反馈（追加到时间线）", "Add Timeline Update")}
          <textarea
            className="field-input mt-1"
            rows={2}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={t("如：一面安排在周五，重点准备项目经历", "e.g., Technical round on Friday, focus on system design")}
            maxLength={10000}
          />
        </label>
        <Btn variant="primary" onClick={submit}>
          {t("保存记录", "Save Application")}
        </Btn>
      </div>
    </Modal>
  );
}

export default function Applications({ initialDueOnly = false }: { initialDueOnly?: boolean }) {
  const app = useAppSlice(
    "applications",
    "resumes",
    "snapshots",
    "go",
    "saveApplication",
    "deleteApplication"
  );
  const [edit, setEdit] = useState<Application | "new" | null>(null);
  const [quick, setQuick] = useState<Application | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "pipeline" | "gantt">("cards");
  const uiLang = useUiLang();
  const t = useT();
  const [quickFilter, setQuickFilter] = useState<
    "all" | "submitted" | "interview" | "offer" | "followup"
  >(initialDueOnly ? "followup" : "all");
  const [remove, setRemove] = useState<Application | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [viewSnapshot, setViewSnapshot] = useState<ResumeSnapshot | null>(null);
  const today = fmtDate(nowISO());
  const stats = applicationStats(app.applications, today);
  const isDue = (a: Application) =>
    !!a.follow_up_at &&
    a.follow_up_at <= today &&
    !TERMINAL_STATUSES.includes(a.status);
  const matchesQuickFilter = (a: Application) => {
    if (quickFilter === "all") return true;
    if (quickFilter === "submitted") return hasSubmission(a);
    if (quickFilter === "interview")
      return (
        hasSubmission(a) &&
        (a.status === "interview" ||
          !!a.events?.some((e) => e.status === "interview"))
      );
    if (quickFilter === "offer")
      return (
        hasSubmission(a) &&
        (a.status === "offer" || !!a.events?.some((e) => e.status === "offer"))
      );
    return isDue(a);
  };
  const list = app.applications
    .filter(
      (a) =>
        matchesQuickFilter(a) &&
        (status === "all" || a.status === status) &&
        [a.company, a.role].join(" ").toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => {
      return (
        Number(isDue(b)) - Number(isDue(a)) ||
        b.updated_at.localeCompare(a.updated_at)
      );
    });
  const toggleQuickFilter = (
    next: "submitted" | "interview" | "offer" | "followup"
  ) => {
    setQuickFilter((cur) => (cur === next ? "all" : next));
    setStatus("all");
  };
  const openSnapshot = (a: Application) => {
    if (!a.snapshot_id) return;
    const snapshot = app.snapshots.find((s) => s.id === a.snapshot_id);
    if (snapshot) setViewSnapshot(snapshot);
  };
  const advanceStatus = (a: Application, nextStatus: ApplicationStatus) => {
    const applied =
      a.applied_at ||
      (["applied", "interview", "offer", "rejected"].includes(nextStatus)
        ? today
        : "");
    const note = t(
      `推进状态至「${APPLICATION_LABELS[nextStatus]}」`,
      `Moved to ${appStatusLabel(nextStatus, APPLICATION_LABELS[nextStatus], "en")}`
    );
    app.saveApplication(
      { ...a, status: nextStatus, applied_at: applied, updated_at: nowISO() },
      note
    );
  };
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[28px] font-bold tracking-tight text-ink-900">{t("投递记录", "Applications")}</h1>
          <InfoTip
            align="left"
            label={t("投递记录说明", "About Applications")}
            content={t(
              "记录投递进度与当时导出的简历快照，所有数据仅保存在本机，不会自动向企业发送。",
              "Track application status alongside pinned resume snapshots. All data stays local and is never sent automatically."
            )}
          />
        </div>
        <Btn
          variant="primary"
          className="cta-ai rounded-full"
          disabled={!app.resumes.some((r) => !r.archived_at)}
          title={
            !app.resumes.some((r) => !r.archived_at)
              ? t("请先创建一份简历后再记录投递", "Create a resume first before logging applications")
              : undefined
          }
          onClick={() => setEdit("new")}
        >
          {t("新增记录", "New Application")}
        </Btn>
      </div>
      {stats.followups > 0 && (
        <div className="pastel-aurora mt-5 flex items-center justify-between gap-3 rounded-[22px] p-4">
          <p className="text-[14px] font-medium text-ink-900">
            {t(`今天有 ${stats.followups} 条投递需要跟进`, `${stats.followups} follow-ups due today`)}
          </p>
          <Btn size="sm" className="rounded-full" onClick={() => { setQuickFilter("followup"); setStatus("all"); setQuery(""); }}>
            {t("查看待跟进", "View Due")}
          </Btn>
        </div>
      )}
      {app.applications.length > 0 && <>
      <div className="my-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4" role="group" aria-label={t("按投递状态快捷筛选", "Quick status filters")}>
        {(
          [
            ["submitted", t("已投递", "Applied"), stats.submitted, "pastel-indigo", "ring-brand-500/70"],
            ["interview", t("面试中", "Interviewing"), stats.interviews, "pastel-violet", "ring-violet-500/70"],
            ["offer", "Offer", stats.offers, "pastel-mint", "ring-emerald-500/70"],
            ["followup", t("待跟进", "Follow-ups"), stats.followups, "pastel-amber", "ring-amber-500/75"],
          ] as const
        ).map(([key, label, count, bg, activeRing]) => {
          const active = quickFilter === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => toggleQuickFilter(key)}
              className={`group rounded-[22px] px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${bg} ${
                active ? `ring-2 ${activeRing} shadow-sm` : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] font-medium text-ink-500">{label}</p>
                {active && (
                  <span className="chip rounded-full bg-surface/90 px-2 py-0 text-[10.5px] font-semibold text-brand-700">
                    {t("筛选中", "Active")}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[26px] font-bold tabular-nums text-ink-900">{count}</p>
            </button>
          );
        })}
      </div>
      <div className="my-5 flex flex-wrap items-center gap-3">
        <input
          aria-label={t("搜索投递记录", "Search applications")}
          className="liquid-input min-w-44 max-w-xs flex-1 rounded-full px-4 py-2 text-[13px] text-ink-900 placeholder:text-ink-400"
          placeholder={t("搜索公司或职位…", "Search company or role…")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <GlassSelect
          ariaLabel={t("筛选投递状态", "Filter status")}
          className="w-36"
          value={status}
          onChange={(v) => {
            setStatus(v);
            if (v !== "all") setQuickFilter("all");
          }}
          options={[
            { value: "all", label: t("全部状态", "All Statuses") },
            ...Object.entries(APPLICATION_LABELS).map(([id, label]) => ({
              value: id,
              label: appStatusLabel(id, label, uiLang),
            })),
          ]}
        />
        {(quickFilter !== "all" || status !== "all" || query) && (
          <Btn
            size="sm"
            variant="ghost"
            onClick={() => {
              setQuickFilter("all");
              setStatus("all");
              setQuery("");
            }}
          >
            {t("重置筛选", "Reset")}
          </Btn>
        )}
        <div
          className="liquid-glass ml-auto inline-flex items-center gap-0.5 rounded-full p-1"
          role="tablist"
          aria-label={t("投递记录视图", "Applications view")}
        >
          {(
            [
              ["cards", t("卡片", "Cards")],
              ["pipeline", t("流水线", "Pipeline")],
              ["gantt", t("甘特图", "Timeline")],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewMode === mode}
              onClick={() => setViewMode(mode)}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition-all ${
                viewMode === mode
                  ? "glass-lens font-semibold text-ink-900"
                  : "text-ink-500 hover:text-ink-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      </>}
      {!list.length && <section className="soft-panel mt-5 rounded-[24px] p-6 text-center sm:p-8">
        <h2 className="font-semibold">{app.applications.length ? t("没有符合条件的投递记录", "No matching applications") : t("求职进度，一处跟进", "Track every application in one place")}</h2>
        {!app.applications.length && <div className="mx-auto mt-5 flex max-w-xl items-center justify-center gap-1 text-[11px] sm:gap-3 sm:text-[13px]">
          {[[t("待投", "Saved"), 'bg-paper-100 text-ink-700'], [t("已投", "Applied"), 'bg-brand-50 text-brand-700'], [t("面试", "Interview"), 'bg-seal-100 text-seal-700'], ['Offer', 'bg-green-50 text-green-700']].map(([label, color], index) => <Fragment key={label}>
            <span className={`rounded-lg px-2 py-2 font-semibold ${color}`}>{label}</span>{index < 3 && <span aria-hidden="true" className="text-ink-400">→</span>}
          </Fragment>)}
        </div>}
        <p className="mt-3 text-[13px] text-ink-500">{app.applications.length ? t("试试其他条件，或查看全部记录。", "Try another filter or view all records.") : t("每条记录关联当时的简历版本，并追踪面试、反馈和跟进日期。", "Link each entry to the exact resume snapshot and track interviews & follow-ups.")}</p>
        <div className="mt-4">
          {app.applications.length ? <Btn onClick={() => { setQuery(''); setStatus('all'); setQuickFilter('all'); }}>{t("清除筛选", "Clear Filters")}</Btn> :
            app.resumes.some(r => !r.archived_at) ? <Btn variant="primary" onClick={() => setEdit('new')}>{t("记录第一次投递", "Log First Application")}</Btn> : <Btn variant="primary" onClick={() => app.go({name:'home'})}>{t("前往创建简历", "Create a Resume First")}</Btn>}
        </div>
      </section>}
      {list.length > 0 && viewMode === "pipeline" && (
        <ApplicationPipeline
          list={list}
          today={today}
          onAdvance={advanceStatus}
          onQuick={setQuick}
          onEdit={setEdit}
          onOpenResume={(id) => app.go({ name: "editor", resumeId: id })}
          onViewSnapshot={openSnapshot}
          onRemove={setRemove}
        />
      )}
      {list.length > 0 && viewMode === "gantt" && (
        <ApplicationGantt
          list={list}
          today={today}
          onQuick={setQuick}
        />
      )}
      {list.length > 0 && viewMode === "cards" && (
      <div className="grid gap-3.5 lg:grid-cols-2">
        {list.map((a) => {
          const stepIndex =
            a.status === "saved"
              ? 1
              : a.status === "applied"
              ? 2
              : a.status === "interview"
              ? 3
              : a.status === "offer"
              ? 4
              : 0;
          const isOffer = a.status === "offer";
          const isTerminal = TERMINAL_STATUSES.includes(a.status);
          const feedback = latestUserFeedback(a);
          return (
          <article
            key={a.id}
            className="soft-panel flex flex-col rounded-[22px] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-bold text-ink-900">
                  {a.company} · {a.role}
                </h2>
                <p className="mt-0.5 text-[12px] text-ink-400 tabular-nums">
                  {a.applied_at
                    ? `${t("投递", "Applied")} ${shortDate(a.applied_at, today)}`
                    : t("待投递", "Not applied")}
                  {!isTerminal && a.follow_up_at && ` · ${t("跟进", "Follow up")} ${shortDate(a.follow_up_at, today)}`}
                </p>
              </div>
              <StatusBadge status={a.status} />
            </div>
            {stepIndex > 0 && (
              <div className="mt-3 flex items-center gap-1.5" aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                  <div key={n} className="h-1 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: n <= stepIndex ? "100%" : "0%",
                        background: isOffer
                          ? "#10B981"
                          : "linear-gradient(90deg, #38BDF8, #6366F1)",
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
            {isDue(a) && (
              <p className="mt-2.5 inline-flex self-start rounded-full bg-seal-100 px-2.5 py-0.5 text-[11.5px] font-medium text-seal-700">
                {t("已到跟进日期", "Follow-up due")}
              </p>
            )}
            {a.notes && <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-ink-700">{a.notes}</p>}
            {feedback && (
              <p className="mt-2.5 rounded-xl bg-surface/80 px-3 py-2 text-[12.5px] text-ink-700">
                {feedback}
              </p>
            )}
            <details className="mt-2.5 text-[12px]">
              <summary className="cursor-pointer select-none text-ink-500 hover:text-ink-800">
                {t("进度记录", "History")} · {a.events?.length ?? 1}
              </summary>
              <ol className="mt-2 space-y-1.5 pl-1">
                {(
                  a.events ?? [
                    {
                      id: a.id,
                      status: a.status,
                      at: a.updated_at,
                      note: "",
                      legacy: true,
                    },
                  ]
                )
                  .slice()
                  .reverse()
                  .map((event) => {
                    const customNote = !isAutoEventNote(event.note) ? event.note.trim() : "";
                    return (
                      <li key={event.id} className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-2 font-medium text-ink-700">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOTS[event.status]}`}
                              aria-hidden="true"
                            />
                            {appStatusLabel(event.status, APPLICATION_LABELS[event.status], uiLang)}
                          </span>
                          <time className="shrink-0 text-[11px] text-ink-400 tabular-nums">
                            {shortTimestamp(event.at, today)}
                          </time>
                        </div>
                        {customNote && (
                          <p className="pl-3.5 text-[11.5px] text-ink-500 whitespace-pre-wrap">
                            {customNote}
                          </p>
                        )}
                      </li>
                    );
                  })}
              </ol>
            </details>
            <div className="mt-auto flex items-center justify-between gap-2 pt-3.5">
              <Btn size="sm" variant="primary" className="rounded-full" onClick={() => setQuick(a)}>
                {t("更新进度", "Update Status")}
              </Btn>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title={t("编辑详情", "Edit details")}
                  aria-label={t("编辑详情", "Edit details")}
                  onClick={() => setEdit(a)}
                  className="tool-btn h-8 w-8 rounded-full hover:bg-surface"
                >
                  <IconEdit size={14} />
                </button>
                <button
                  type="button"
                  title={t("编辑当前简历", "Open resume")}
                  aria-label={t("编辑当前简历", "Open resume")}
                  onClick={() => app.go({ name: "editor", resumeId: a.resume_id })}
                  className="tool-btn h-8 w-8 rounded-full hover:bg-surface"
                >
                  <IconFile size={14} />
                </button>
                {a.snapshot_id && (
                  <button
                    type="button"
                    title={t("查看投递版本", "View snapshot")}
                    aria-label={t("查看投递版本", "View snapshot")}
                    onClick={() => openSnapshot(a)}
                    className="tool-btn h-8 w-8 rounded-full hover:bg-surface"
                  >
                    <IconEye size={14} />
                  </button>
                )}
                <button
                  type="button"
                  title={t("删除记录", "Delete")}
                  aria-label={t("删除记录", "Delete")}
                  onClick={() => setRemove(a)}
                  className="tool-btn h-8 w-8 rounded-full hover:bg-danger-100 hover:text-danger-600"
                >
                  <IconTrash size={14} />
                </button>
              </div>
            </div>
          </article>
          );
        })}
      </div>
      )}
      {edit && (
        <ApplicationForm
          initial={edit === "new" ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}
      {quick && <QuickFeedback initial={quick} onClose={() => setQuick(null)} />}
      {viewSnapshot && (
        <SnapshotView application
          snapshot={viewSnapshot}
          onClose={() => setViewSnapshot(null)}
        />
      )}
      <Confirm
        open={!!remove}
        title={t("删除投递记录？", "Delete application?")}
        desc={t("关联简历与版本快照会保留。", "Linked resumes and version snapshots will be preserved.")}
        confirmText={t("删除记录", "Delete")}
        onConfirm={() => {
          if (remove) app.deleteApplication(remove.id);
          setRemove(null);
        }}
        onCancel={() => setRemove(null)}
      />
    </div>
  );
}

function QuickFeedback({ initial, onClose }: { initial: Application; onClose: () => void }) {
  const app = useAppSlice('saveApplication');
  const uiLang = useUiLang();
  const t = useT();
  const [status, setStatus] = useState(initial.status);
  const [note, setNote] = useState('');
  const [followup, setFollowup] = useState(initial.follow_up_at);
  return <Modal open onClose={onClose}>
    <ModalHeader title={t("更新投递进度", "Update Status")} sub={`${initial.company} · ${initial.role}`} onClose={onClose} />
    <div className="space-y-4 p-5">
      <div className="field-label block">
        <span className="mb-1.5 block">{t("当前状态", "Current Status")}</span>
        <GlassSelect
          ariaLabel={t("当前状态", "Current Status")}
          className="w-full"
          value={status}
          onChange={(v) => setStatus(v as ApplicationStatus)}
          options={Object.entries(APPLICATION_LABELS).map(([value, label]) => ({
            value,
            label: appStatusLabel(value, label, uiLang),
          }))}
        />
      </div>
      <label className="field-label block">
        {t("追加反馈", "Add Note")}
        <textarea
          aria-label={t("追加反馈", "Add Note")}
          className="field-input mt-1"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={t("如：周五技术面试，准备检索项目复盘", "e.g., Technical interview Friday, prep system design")}
        />
      </label>
      <label className="field-label block">
        {t("下次跟进", "Next Follow-up")}
        <input
          aria-label={t("下次跟进", "Next Follow-up")}
          type="date"
          className="field-input mt-1"
          value={followup}
          onChange={e => setFollowup(e.target.value)}
        />
      </label>
      <div className="flex justify-end gap-2">
        <Btn onClick={onClose}>{t("取消", "Cancel")}</Btn>
        <Btn
          variant="primary"
          disabled={status === initial.status && followup === initial.follow_up_at && !note.trim()}
          onClick={() => {
            const applied = initial.applied_at || (['applied', 'interview', 'offer', 'rejected'].includes(status) ? fmtDate(nowISO()) : '');
            if (app.saveApplication({ ...initial, status, applied_at: applied, follow_up_at: followup, updated_at: nowISO() }, note.trim())) onClose();
          }}
        >
          {t("保存进度", "Save Progress")}
        </Btn>
      </div>
    </div>
  </Modal>;
}

/* ================= 流水线看板视图（Pipeline / Kanban） ================= */

function ApplicationPipeline({
  list,
  today,
  onAdvance,
  onQuick,
  onEdit,
  onOpenResume,
  onViewSnapshot,
  onRemove,
}: {
  list: Application[];
  today: string;
  onAdvance: (a: Application, next: ApplicationStatus) => void;
  onQuick: (a: Application) => void;
  onEdit: (a: Application) => void;
  onOpenResume: (resumeId: string) => void;
  onViewSnapshot: (a: Application) => void;
  onRemove: (a: Application) => void;
}) {
  const t = useT();
  const uiLang = useUiLang();
  const lanes: Array<{
    key: "saved" | "applied" | "interview" | "offer";
    label: string;
    dot: string;
    bg: string;
    next?: { status: ApplicationStatus; label: string };
  }> = [
    {
      key: "saved",
      label: t("待投递", "Saved"),
      dot: "#94A3B8",
      bg: "soft-panel",
      next: { status: "applied", label: t("标记已投递", "Mark Applied") },
    },
    {
      key: "applied",
      label: t("已投递", "Applied"),
      dot: "#6366F1",
      bg: "pastel-indigo",
      next: { status: "interview", label: t("进入面试", "Interview") },
    },
    {
      key: "interview",
      label: t("面试中", "Interviewing"),
      dot: "#8B5CF6",
      bg: "pastel-violet",
      next: { status: "offer", label: t("收到 Offer", "Got Offer") },
    },
    {
      key: "offer",
      label: "Offer",
      dot: "#10B981",
      bg: "pastel-mint",
    },
  ];

  const closedItems = list.filter((a) =>
    ["rejected", "withdrawn", "closed"].includes(a.status)
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 overflow-x-auto pb-1 md:grid-cols-2 xl:grid-cols-4">
        {lanes.map((lane) => {
          const items = list.filter((a) => a.status === lane.key);
          return (
            <section
              key={lane.key}
              aria-label={lane.label}
              className={`flex min-h-[240px] min-w-0 flex-col gap-2.5 rounded-[22px] p-3 ${lane.bg}`}
            >
              <header className="flex items-center justify-between px-1.5 pb-1 pt-0.5">
                <span className="flex items-center gap-2 text-[13px] font-bold text-ink-900">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: lane.dot }}
                    aria-hidden="true"
                  />
                  {lane.label}
                </span>
                <span className="rounded-full bg-surface/90 px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-500">
                  {items.length}
                </span>
              </header>

              {items.length === 0 ? (
                <p className="my-auto py-8 text-center text-[12px] text-ink-400">
                  {t("暂无记录", "Empty")}
                </p>
              ) : (
                items.map((a) => {
                  const due =
                    !!a.follow_up_at &&
                    a.follow_up_at <= today &&
                    !TERMINAL_STATUSES.includes(a.status);
                  const latestNote = latestUserFeedback(a) || a.notes;
                  return (
                    <article
                      key={a.id}
                      className="rounded-2xl bg-surface p-3.5 shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:shadow-sm"
                    >
                      <button
                        type="button"
                        onClick={() => onQuick(a)}
                        className="w-full text-left"
                      >
                        <p className="truncate text-[14px] font-bold text-ink-900">
                          {a.company}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-ink-500">
                          {a.role}
                        </p>
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-ink-400">
                        {a.applied_at && (
                          <span>{t(`投递 ${a.applied_at.slice(5)}`, `Applied ${a.applied_at.slice(5)}`)}</span>
                        )}
                        {due && (
                          <span className="chip resume-badge-copy rounded-full px-2 py-0 text-[10.5px] font-medium">
                            {t("待跟进", "Due")}
                          </span>
                        )}
                      </div>
                      {latestNote && (
                        <p className="mt-2 line-clamp-2 rounded-xl bg-subtle/80 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink-600">
                          {latestNote}
                        </p>
                      )}
                      <div className="mt-2.5 flex items-center justify-between gap-1">
                        {lane.next ? (
                          <button
                            type="button"
                            onClick={() => onAdvance(a, lane.next!.status)}
                            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100"
                          >
                            {lane.next.label}
                            <IconArrowRight size={11} className="shrink-0" />
                          </button>
                        ) : (
                          <span className="shrink-0 whitespace-nowrap text-[11px] font-semibold text-emerald-600">
                            {t("已达成", "Received")}
                          </span>
                        )}
                        <div className="flex shrink-0 items-center">
                          <button
                            type="button"
                            title={t("编辑详情", "Edit")}
                            aria-label={t("编辑详情", "Edit")}
                            onClick={() => onEdit(a)}
                            className="tool-btn h-6 w-6 rounded-full"
                          >
                            <IconEdit size={12} />
                          </button>
                          <button
                            type="button"
                            title={t("打开简历", "Open resume")}
                            aria-label={t("打开简历", "Open resume")}
                            onClick={() => onOpenResume(a.resume_id)}
                            className="tool-btn h-6 w-6 rounded-full"
                          >
                            <IconFile size={12} />
                          </button>
                          {a.snapshot_id && (
                            <button
                              type="button"
                              title={t("查看快照", "View snapshot")}
                              aria-label={t("查看快照", "View snapshot")}
                              onClick={() => onViewSnapshot(a)}
                              className="tool-btn h-6 w-6 rounded-full"
                            >
                              <IconEye size={12} />
                            </button>
                          )}
                          <button
                            type="button"
                            title={t("删除", "Delete")}
                            aria-label={t("删除", "Delete")}
                            onClick={() => onRemove(a)}
                            className="tool-btn h-6 w-6 rounded-full hover:bg-danger-100 hover:text-danger-600"
                          >
                            <IconTrash size={12} />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          );
        })}
      </div>

      {closedItems.length > 0 && (
        <details className="soft-panel rounded-[20px] p-4">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-600">
            {t(`已结束 / 拒绝 / 撤回 · ${closedItems.length}`, `Closed / Rejected / Withdrawn · ${closedItems.length}`)}
          </summary>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {closedItems.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-2xl bg-surface px-3.5 py-2.5"
              >
                <button
                  type="button"
                  onClick={() => onQuick(a)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13px] font-semibold text-ink-800">
                    {a.company} · {a.role}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {appStatusLabel(a.status, APPLICATION_LABELS[a.status], uiLang)}
                    {a.applied_at ? ` · ${a.applied_at}` : ""}
                  </p>
                </button>
                <button
                  type="button"
                  title={t("删除", "Delete")}
                  aria-label={t("删除", "Delete")}
                  onClick={() => onRemove(a)}
                  className="tool-btn h-7 w-7 shrink-0 rounded-full hover:bg-danger-100 hover:text-danger-600"
                >
                  <IconTrash size={12} />
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/* ================= 甘特时间轴视图（Timeline / Gantt） ================= */

function parseDayMs(dateLike?: string): number | null {
  if (!dateLike) return null;
  const iso = dateLike.length === 10 ? `${dateLike}T12:00:00Z` : dateLike;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function ApplicationGantt({
  list,
  today,
  onQuick,
}: {
  list: Application[];
  today: string;
  onQuick: (a: Application) => void;
}) {
  const t = useT();
  const uiLang = useUiLang();
  const DAY = 86_400_000;
  const todayMs = parseDayMs(today) ?? Date.now();

  // 计算全部记录的全局时间范围（至少保留 14 天跨度，左右各留 2 天呼吸感）
  let minMs = todayMs - 10 * DAY;
  let maxMs = todayMs + 4 * DAY;

  const rows = list.map((a) => {
    const startMs =
      parseDayMs(a.applied_at) ??
      parseDayMs(a.events?.[0]?.at) ??
      parseDayMs(a.updated_at) ??
      todayMs;
    const isTerminal = TERMINAL_STATUSES.includes(a.status);
    const endRaw = isTerminal
      ? parseDayMs(a.events?.[a.events.length - 1]?.at) ??
        parseDayMs(a.updated_at) ??
        startMs
      : Math.max(todayMs, startMs);
    const endMs = Math.max(startMs, endRaw);
    const followMs = !isTerminal ? parseDayMs(a.follow_up_at) : null;
    const eventDots = (a.events ?? [])
      .map((ev) => ({
        id: ev.id,
        ms: parseDayMs(ev.at),
        status: ev.status,
        note: ev.note,
        date: fmtDate(ev.at),
      }))
      .filter((e): e is { id: string; ms: number; status: ApplicationStatus; note: string; date: string } => e.ms !== null);

    minMs = Math.min(minMs, startMs);
    maxMs = Math.max(maxMs, endMs, followMs ?? endMs);
    const days = Math.max(1, Math.round((endMs - startMs) / DAY));
    return { app: a, startMs, endMs, followMs, eventDots, days };
  });

  const rangeStart = minMs - 2 * DAY;
  const rangeEnd = Math.max(maxMs + 2 * DAY, rangeStart + 14 * DAY);
  const span = rangeEnd - rangeStart;
  const pct = (ms: number) =>
    Math.min(100, Math.max(0, ((ms - rangeStart) / span) * 100));

  const ticks = Array.from({ length: 6 }, (_, i) => {
    const ms = rangeStart + (span * i) / 5;
    return fmtDate(new Date(ms).toISOString()).slice(5);
  });
  const todayPct = pct(todayMs);

  const barGradient = (s: ApplicationStatus) => {
    if (s === "offer") return "linear-gradient(90deg, #10B981, #34D399)";
    if (s === "interview") return "linear-gradient(90deg, #6366F1, #A855F7)";
    if (s === "applied") return "linear-gradient(90deg, #38BDF8, #6366F1)";
    if (s === "saved") return "linear-gradient(90deg, #94A3B8, #64748B)";
    return "linear-gradient(90deg, #64748B, #94A3B8)";
  };

  return (
    <section className="soft-panel overflow-x-auto rounded-[24px] p-5">
      <div className="min-w-[600px]">
        <div className="grid grid-cols-[190px_1fr] gap-4 pb-3 text-[11.5px] font-medium text-ink-400">
          <span>{t("公司 · 职位", "Company · Role")}</span>
          <div className="flex justify-between font-mono">
            {ticks.map((tk, i) => (
              <span key={i}>{tk}</span>
            ))}
          </div>
        </div>

        <div className="relative">
          {/* 今天参考线 */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 top-0 z-10 border-l-[1.5px] border-dashed border-danger-600/70"
            style={{ left: `calc(190px + 16px + (100% - 206px) * ${todayPct / 100})` }}
          >
            <span className="absolute -left-5 -top-6 rounded-full bg-danger-600 px-1.5 py-0.5 text-[10px] font-bold text-white whitespace-nowrap">
              {t("今天", "Today")}
            </span>
          </div>

          <div className="divide-y divide-line/50">
            {rows.map(({ app: a, startMs, endMs, followMs, eventDots, days }) => {
              const rawLeft = pct(startMs);
              const rawRight = pct(endMs);
              const rawWidth = rawRight - rawLeft;
              // 当天投递（宽度接近 0）向左延展极短胶囊并紧贴「今天」线，绝不向右溢出今天线
              const width = Math.max(1.8, rawWidth);
              const left = rawWidth < 1.8 ? Math.max(0, rawRight - width) : rawLeft;
              const due =
                !!a.follow_up_at &&
                a.follow_up_at <= today &&
                !TERMINAL_STATUSES.includes(a.status);
              const followPct = followMs !== null ? pct(followMs) : null;
              const barEndPct = left + width;

              return (
                <div
                  key={a.id}
                  className="grid grid-cols-[190px_1fr] items-center gap-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => onQuick(a)}
                    className="min-w-0 text-left group"
                  >
                    <p className="truncate text-[13.5px] font-bold text-ink-900 group-hover:text-brand-700">
                      {a.company} · {a.role}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={a.status} />
                      <span className="font-mono text-[11px] text-ink-400">
                        {t(`${days} 天`, `${days}d`)}
                      </span>
                      {due && (
                        <span className="chip resume-badge-copy rounded-full px-1.5 py-0 text-[10px] font-medium">
                          {t("待跟进", "Due")}
                        </span>
                      )}
                    </div>
                  </button>

                  <div className="relative h-6 rounded-full bg-surface/65">
                    {/* 持续进度条 */}
                    <button
                      type="button"
                      onClick={() => onQuick(a)}
                      title={`${a.company} · ${a.role} (${appStatusLabel(a.status, APPLICATION_LABELS[a.status], uiLang)} · ${t(`${days} 天`, `${days}d`)})`}
                      className="absolute top-1 flex h-4 items-center overflow-hidden rounded-full px-2 text-[10px] font-semibold text-white shadow-xs transition-transform hover:scale-y-110"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: barGradient(a.status),
                      }}
                    >
                      <span className="truncate">
                        {width > 12
                          ? `${appStatusLabel(a.status, APPLICATION_LABELS[a.status], uiLang)} · ${t(`${days}天`, `${days}d`)}`
                          : ""}
                      </span>
                    </button>

                    {/* 历史事件节点 */}
                    {eventDots.map((ev) => (
                      <span
                        key={ev.id}
                        title={`${ev.date} · ${appStatusLabel(ev.status, APPLICATION_LABELS[ev.status], uiLang)}${ev.note ? `：${ev.note}` : ""}`}
                        className="absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-600 bg-white shadow-xs"
                        style={{ left: `${pct(ev.ms)}%` }}
                      />
                    ))}

                    {/* 下次跟进虚线与目标点 */}
                    {followPct !== null && (
                      <>
                        {followPct > barEndPct && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 border-t-2 border-dashed border-amber-500/80"
                            style={{
                              left: `${barEndPct}%`,
                              width: `${followPct - barEndPct}%`,
                            }}
                          />
                        )}
                        <span
                          title={`${t("下次跟进", "Follow up")}: ${a.follow_up_at}`}
                          className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500 ring-4 ring-amber-500/20"
                          style={{ left: `${followPct}%` }}
                        />
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11.5px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-full" style={{ background: "linear-gradient(90deg, #38BDF8, #6366F1)" }} />
            {t("已投递", "Applied")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-full" style={{ background: "linear-gradient(90deg, #6366F1, #A855F7)" }} />
            {t("面试推进", "Interviewing")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-3.5 rounded-full" style={{ background: "linear-gradient(90deg, #10B981, #34D399)" }} />
            Offer
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-brand-600 bg-white" />
            {t("状态变更节点", "Milestone")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            {t("下次跟进日", "Follow-up Date")}
          </span>
          <span className="ml-auto text-[11px] text-ink-400">
            {t("点击任意进度条快速更新状态", "Click any bar to update status")}
          </span>
        </div>
      </div>
    </section>
  );
}
