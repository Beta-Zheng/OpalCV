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
    "deleteApplication"
  );
  const [edit, setEdit] = useState<Application | "new" | null>(null);
  const [quick, setQuick] = useState<Application | null>(null);
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
      <details className="soft-panel mb-5 rounded-[22px] p-4">
        <summary className="cursor-pointer text-[14px] font-medium">
          {t("查看投递统计", "View Application Stats")}
        </summary>
        <p className="mt-3 text-[12px] text-ink-500">
          {t("统计依据手动记录，缺失历史不推断；无反馈不代表拒绝。", "Stats are based on your logged entries; no assumptions for missing history.")}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <section
            className="soft-panel rounded-2xl p-4"
            aria-label={t("投递状态分布", "Status distribution")}
          >
            <h2 className="mb-3 text-[13px] font-bold">{t("当前状态分布", "Status Breakdown")}</h2>
            {Object.entries(APPLICATION_LABELS).map(([key, label]) => (
              <div
                key={key}
                className="mb-2 grid grid-cols-[90px_1fr_24px] items-center gap-2 text-[12px]"
              >
                <span>{appStatusLabel(key, label, uiLang)}</span>
                <div className="h-2 rounded bg-paper-100">
                  <div
                    className="h-2 rounded bg-brand-400"
                    style={{
                      width: `${
                        app.applications.length
                          ? (stats.counts[key as ApplicationStatus] /
                              app.applications.length) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <span>{stats.counts[key as ApplicationStatus]}</span>
              </div>
            ))}
          </section>
          <section
            className="soft-panel rounded-2xl p-4"
            aria-label={t("最近八周投递趋势", "8-week trend")}
          >
            <h2 className="text-[13px] font-bold">{t("最近八周投递趋势", "8-Week Trend")}</h2>
            <p className="mt-1 text-[12px] text-ink-500">
              {t("按填写的投递日期统计；缺日期的记录不计入趋势。", "Grouped by logged application date.")}
            </p>
            <div className="mt-3 flex h-40 items-end gap-2">
              {stats.weeks.map((week) => (
                <div
                  key={week.from}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1 text-[12px]"
                  title={`${week.from} ~ ${week.to}: ${week.count}`}
                >
                  <span>{week.count}</span>
                  <div
                    className="w-full rounded-t bg-brand-400"
                    style={{
                      height: `${
                        week.count
                          ? Math.max(
                              6,
                              (week.count /
                                Math.max(
                                  1,
                                  ...stats.weeks.map((w) => w.count)
                                )) *
                                100
                            )
                          : 2
                      }px`,
                    }}
                  />
                  <span>{week.from.slice(5)}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-ink-500">
              {t("面试记录", "Interviews")} {stats.interviews}/{stats.submitted} · {t("Offer 记录", "Offers")} {stats.offers}/{stats.submitted}
            </p>
          </section>
        </div>
      </details>
      <div className="my-5 flex flex-wrap items-center gap-3">
        <Btn
          size="sm"
          aria-pressed={quickFilter === "followup"}
          onClick={() => toggleQuickFilter("followup")}
        >
          {t("只看待跟进", "Due Only")}
        </Btn>
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
      <div className="grid gap-3 lg:grid-cols-2">
        {list.map((a) => (
          <article
            key={a.id}
            className="soft-panel rounded-[22px] p-4"
          >
            <div className="flex justify-between gap-3">
              <h2 className="font-bold">
                {a.company} · {a.role}
              </h2>
              <StatusBadge status={a.status} />
            </div>
            <p className="mt-2 text-[12px] text-ink-500">
              {a.snapshot_id ? t("已固定投递版本", "Snapshot pinned") : t("尚未固定投递版本", "No snapshot pinned")}
            </p>
            <p className="mt-1 text-[12px] text-ink-400">
              {a.applied_at && `${t("投递", "Applied")} ${a.applied_at}`}{" "}
              {a.follow_up_at && `· ${t("跟进", "Follow up")} ${a.follow_up_at}`}
            </p>
            {a.follow_up_at &&
              a.follow_up_at <= today &&
              !TERMINAL_STATUSES.includes(a.status) && (
                <p className="mt-2 text-[12px] text-seal-700">{t("已到跟进日期", "Follow-up due")}</p>
              )}
            <p className="mt-2 whitespace-pre-wrap text-[12px]">{a.notes}</p>
            {a.events?.length ? <p className="mt-2 text-[13px] text-ink-600">{t("最近反馈：", "Latest: ")}{a.events[a.events.length - 1].note || appStatusLabel(a.events[a.events.length - 1].status, APPLICATION_LABELS[a.events[a.events.length - 1].status], uiLang)}</p> : null}
            <details className="mt-3 text-[12px]">
              <summary className="cursor-pointer text-ink-600">
                {t("反馈时间线", "Timeline")} · {a.events?.length ?? 1}
              </summary>
              <ol className="mt-2 space-y-2 border-l border-line pl-3">
                {(
                  a.events ?? [
                    {
                      id: a.id,
                      status: a.status,
                      at: a.updated_at,
                      note: t("旧记录当前状态，此前历史未知", "Current status"),
                      legacy: true,
                    },
                  ]
                )
                  .slice()
                  .reverse()
                  .map((event) => (
                    <li key={event.id}>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={event.status} />
                        <time className="text-ink-400">
                          {new Date(event.at).toLocaleString()}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap">{event.note}</p>
                    </li>
                  ))}
              </ol>
            </details>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn onClick={() => setQuick(a)}>{t("更新进度", "Update Status")}</Btn>
              <Btn variant="ghost" onClick={() => setEdit(a)}>{t("编辑详情", "Edit")}</Btn>
              <Btn
                onClick={() =>
                  app.go({ name: "editor", resumeId: a.resume_id })
                }
              >
                {t("编辑当前简历", "Open Resume")}
              </Btn>
              {a.snapshot_id && (
                <Btn
                  onClick={() => {
                    const snapshot = app.snapshots.find(
                      (s) => s.id === a.snapshot_id
                    );
                    if (snapshot) setViewSnapshot(snapshot);
                  }}
                >
                  {t("查看投递版本", "View Snapshot")}
                </Btn>
              )}
              <Btn variant="ghost" onClick={() => setRemove(a)}>
                {t("删除记录", "Delete")}
              </Btn>
            </div>
          </article>
        ))}
      </div>
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
