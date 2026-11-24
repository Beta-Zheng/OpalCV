import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AUDIENCE_LABELS,
  type ApplicationStatus,
  type ResumeAudience,
} from "../types";
import { useT } from "../lib/i18n";
import { IconCheck, IconLock, IconSpark } from "./icons";

const ORIGINAL = "负责课程项目的前端页面开发。";
const IMPROVED = "重构首屏渲染链路，加载耗时 3.0s → 1.0s，留存提升 18%。";

const STAGE_PILLS: Array<{
  id: ApplicationStatus;
  zh: string;
  en: string;
  emoji: string;
  bar: string;
  badge: string;
}> = [
  { id: "applied", zh: "已投递", en: "Applied", emoji: "📮", bar: "w-1/3 bg-sky-400", badge: "bg-sky-500/12 text-sky-600" },
  { id: "interview", zh: "面试中", en: "Interview", emoji: "💬", bar: "w-2/3 bg-indigo-500", badge: "bg-indigo-500/12 text-indigo-600" },
  { id: "offer", zh: "收到 Offer", en: "Offer!", emoji: "🎉", bar: "w-full bg-emerald-500", badge: "bg-emerald-500/12 text-emerald-600" },
];

export default function GuideDemo({ step }: { step: number }) {
  const t = useT();
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [manual, setManual] = useState(false);

  const [audience, setAudience] = useState<ResumeAudience>("experienced");
  const [created, setCreated] = useState(false);
  const [achievement, setAchievement] = useState(ORIGINAL);
  const [jobCreated, setJobCreated] = useState(false);
  const [jobTitle, setJobTitle] = useState("AI 应用工程师");
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [status, setStatus] = useState<ApplicationStatus>("applied");

  const pause = () => {
    setPlaying(false);
    setManual(true);
  };

  const reset = () => {
    setPhase(0);
    setManual(false);
    if (step === 0) {
      setAudience("experienced");
      setCreated(false);
    }
    if (step === 1) setAchievement(ORIGINAL);
    if (step === 2) {
      setJobCreated(false);
      setJobTitle("AI 应用工程师");
    }
    if (step === 3) {
      setSnapshot(null);
      setAchievement(IMPROVED);
    }
    if (step === 4) {
      setStatus("applied");
    }
  };

  useEffect(() => {
    reset();
    setPlaying(!reducedMotion);
  }, [step, reducedMotion]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (phase === 3) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      const next = phase + 1;
      if (step === 0 && next === 1) setAudience("student");
      if (step === 0 && next === 2) setCreated(true);
      if (step === 1 && next === 2) setAchievement(IMPROVED);
      if (step === 2 && next === 2) setJobCreated(true);
      if (step === 2 && next === 3) setJobTitle("字节跳动 · AI 工程师");
      if (step === 3 && next === 2) setSnapshot(achievement);
      if (step === 3 && next === 3) setAchievement("补充 RAG 检索精度提升 22% 与线上压测结果。");
      if (step === 4 && next === 1) setStatus("interview");
      if (step === 4 && next === 2) setStatus("offer");
      setPhase(next);
    }, 1350);
    return () => clearTimeout(timer);
  }, [playing, phase, step, reducedMotion, achievement]);

  const spring = {
    initial: reducedMotion ? (false as const) : { opacity: 0, y: 10, scale: 0.97 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: reducedMotion ? undefined : { opacity: 0, y: -6, scale: 0.98 },
    transition: { duration: reducedMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] as const },
  };

  const captions: string[][] = [
    [
      t("选择你的求职场景", "Pick your career stage"),
      t("点选导入、示例或从零开始", "Import, sample, or start fresh"),
      t("✨ 示例简历已生成，随时开写", "✨ Sample resume ready in 1s"),
      t("👆 试试点击不同场景切换", "👆 Click any stage to try"),
    ],
    [
      t("左侧专注写清每一条成果", "Write achievements on the left"),
      t("量化结果更有说服力", "Quantified impact stands out"),
      t("⚡ 右侧 A4 纸张实时同步", "⚡ Live A4 preview updates instantly"),
      t("👆 试着直接改写左框文字", "👆 Try editing the text directly"),
    ],
    [
      t("主简历保留完整通用经历", "Master resume stays untouched"),
      t("点击「派生岗位版」", "Branch a role-specific copy"),
      t("🎯 生成独立副本，针对 JD 改写", "🎯 Tailored copy ready for the JD"),
      t("🔒 副本怎么改，主简历都不变", "🔒 Master remains safely locked"),
    ],
    [
      t("免费导出高清 PDF / Word / MD", "Export clean PDF / DOCX / MD"),
      t("点击「定格快照」", "Pin an immutable snapshot"),
      t("📌 投递那一刻的内容已锁定", "📌 Submitted version is frozen"),
      t("继续迭代简历，旧快照不受影响", "Keep iterating without losing history"),
    ],
    [
      t("投递后记录每家公司进展", "Track every application stage"),
      t("💬 推进到「面试中」", "💬 Advanced to Interview"),
      t("🎆 收到 Offer！为你绽放烟花", "🎆 Offer received! Time to celebrate"),
      t("👆 点选上方阶段胶囊试试看", "👆 Tap any stage pill to try"),
    ],
  ];

  const activeStage = STAGE_PILLS.find((s) => s.id === status) ?? STAGE_PILLS[0];

  return (
    <section
      className="soft-panel relative overflow-hidden rounded-[22px] p-3.5 sm:p-4"
      aria-label={t("交互式动画演示", "Interactive demo")}
    >
      {/* Top minimal control bar */}
      <div className="mb-3 flex items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface/80 px-2.5 py-0.5 font-medium text-ink-500">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              playing ? "animate-pulse bg-brand-500" : "bg-emerald-500"
            }`}
          />
          {manual ? t("自由体验中", "Interactive") : captions[step][phase]}
        </span>
        <div className="flex items-center gap-1">
          {!reducedMotion && (
            <button
              type="button"
              aria-label={playing ? t("暂停演示", "Pause") : t("播放演示", "Play")}
              onClick={() => {
                if (!playing && (phase === 3 || manual)) reset();
                setPlaying(!playing);
              }}
              className="rounded-full bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-surface hover:text-ink-900"
            >
              {playing ? "⏸" : "▶"}
            </button>
          )}
          <button
            type="button"
            aria-label={t("重播", "Replay")}
            onClick={() => {
              reset();
              setPlaying(!reducedMotion);
            }}
            className="rounded-full bg-surface/80 px-2.5 py-1 text-[11px] font-medium text-ink-600 transition hover:bg-surface hover:text-ink-900"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Main animated stage */}
      <motion.div
        key={step}
        {...spring}
        className="min-h-[210px] rounded-[18px] bg-surface/85 p-3.5 sm:min-h-[220px] sm:p-4"
      >
        {/* Step 0: Create */}
        {step === 0 && (
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="liquid-glass relative inline-flex gap-0.5 rounded-full p-0.5">
                {(Object.entries(AUDIENCE_LABELS) as Array<[ResumeAudience, string]>).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={audience === key}
                      onClick={() => {
                        pause();
                        setAudience(key);
                        setCreated(true);
                      }}
                      className={`rounded-full px-3 py-1 text-[12px] transition-all ${
                        audience === key
                          ? "glass-lens font-semibold text-brand-700"
                          : "text-ink-500 hover:text-ink-900"
                      }`}
                    >
                      {label}
                    </button>
                  )
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  pause();
                  setCreated(true);
                }}
                className={`cta-ai rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white transition-transform active:scale-95 ${
                  phase === 1 && playing ? "scale-105 ring-2 ring-brand-400/50" : ""
                }`}
              >
                ✨ {t("加载示例", "Use Sample")}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { cls: "pastel-rose", icon: "📥", label: t("导入简历", "Import") },
                { cls: "pastel-violet", icon: "✨", label: t("精品示例", "Samples") },
                { cls: "pastel-amber", icon: "📝", label: t("从零开始", "Blank") },
              ].map((card, idx) => (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => {
                    pause();
                    setCreated(true);
                  }}
                  className={`${card.cls} flex items-center justify-center gap-1.5 rounded-2xl px-2 py-2.5 text-[12px] font-semibold text-ink-800 transition-all hover:-translate-y-0.5 ${
                    idx === 1 && phase >= 1 ? "ring-2 ring-brand-400/40" : ""
                  }`}
                >
                  <span aria-hidden="true">{card.icon}</span>
                  <span>{card.label}</span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {created ? (
                <motion.div
                  key="ready"
                  {...spring}
                  className="pastel-aurora flex items-center justify-between gap-3 rounded-2xl p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                        <IconCheck size={11} />
                        {t("已就绪", "Ready")}
                      </span>
                      <span className="truncate text-[13px] font-bold text-ink-900">
                        {AUDIENCE_LABELS[audience]} · {t("AI 工程师示例", "AI Engineer Sample")}
                      </span>
                    </div>
                    <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface/80">
                      <motion.div
                        initial={{ width: "20%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full bg-gradient-to-r from-[#38BDF8] via-[#6366F1] to-[#C084FC]"
                      />
                    </div>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="wait"
                  {...spring}
                  className="rounded-2xl bg-subtle/70 py-4 text-center text-[12px] text-ink-400"
                >
                  {t("点击任意入口，1 秒开启创作 ✨", "Pick any card to start in 1s ✨")}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Step 1: Edit + Live A4 Preview */}
        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-ink-600">
                  ✍️ {t("主要成果", "Achievement")}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 text-[10.5px] font-medium text-brand-600">
                  <IconSpark size={10} />
                  {t("可编辑", "Live")}
                </span>
              </div>
              <textarea
                aria-label={t("演示成果", "Demo achievement")}
                className="liquid-input min-h-[118px] w-full resize-none rounded-2xl p-3 text-[12.5px] leading-relaxed text-ink-900 outline-none"
                value={achievement}
                maxLength={240}
                onFocus={pause}
                onChange={(e) => {
                  pause();
                  setAchievement(e.target.value);
                }}
              />
            </div>

            {/* Pure-white isolated mini A4 sheet */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11.5px] font-semibold text-ink-600">
                📄 {t("实时 A4 预览", "Live A4 Preview")}
              </span>
              <div className="min-h-[118px] rounded-2xl bg-white p-3.5 text-[#18181B] shadow-sm ring-1 ring-slate-900/6">
                <div className="flex items-baseline justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-[13px] font-bold tracking-tight">Alex Lin</span>
                  <span className="text-[10px] font-semibold text-indigo-600">Frontend Lead</span>
                </div>
                <motion.div
                  key={achievement}
                  initial={reducedMotion ? false : { backgroundColor: "rgba(99, 102, 241, 0.14)" }}
                  animate={{ backgroundColor: "rgba(99, 102, 241, 0)" }}
                  transition={{ duration: 0.7 }}
                  className="mt-2.5 flex items-start gap-1.5 rounded-lg p-1 text-[11.5px] leading-relaxed text-slate-700"
                >
                  <span className="mt-0.5 text-indigo-500">◆</span>
                  <span className="break-words">{achievement || t("成果将实时呈现在这里", "Updates live here")}</span>
                </motion.div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Tailor for JD */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-medium text-ink-500">
                {t("一份主简历 → N 个岗位专属版", "1 Master → N Tailored Copies")}
              </span>
              <button
                type="button"
                onClick={() => {
                  pause();
                  setJobCreated(true);
                }}
                className={`cta-ai rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white transition-transform active:scale-95 ${
                  phase === 1 && playing ? "scale-105 ring-2 ring-brand-400/50" : ""
                }`}
              >
                🎯 {t("派生岗位版", "Tailor for JD")}
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="soft-panel rounded-2xl p-3.5">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                    {t("主简历", "Master")}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-400">
                    <IconLock size={11} />
                    {t("原稿安全", "Protected")}
                  </span>
                </div>
                <p className="mt-2.5 text-[13.5px] font-bold text-ink-900">
                  {t("通用全栈简历", "General Full-Stack CV")}
                </p>
                <p className="mt-1 text-[11.5px] text-ink-500">
                  {t("保持完整经历，绝不被覆盖", "Full history stays intact")}
                </p>
              </div>

              <AnimatePresence mode="wait">
                {jobCreated ? (
                  <motion.div
                    key="branched"
                    {...spring}
                    className="pastel-violet rounded-2xl p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="rounded-full bg-brand-500/15 px-2 py-0.5 text-[10.5px] font-semibold text-brand-700">
                        🎯 {t("岗位定制版", "Tailored")}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-600">
                        +18% {t("匹配度", "Match")}
                      </span>
                    </div>
                    <input
                      aria-label={t("演示岗位职位", "Demo tailored role")}
                      className="liquid-input mt-2 w-full rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-900 outline-none"
                      value={jobTitle}
                      maxLength={50}
                      onFocus={pause}
                      onChange={(e) => {
                        pause();
                        setJobTitle(e.target.value);
                      }}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="placeholder"
                    {...spring}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-subtle/60 p-4 text-center text-[12px] text-ink-400"
                  >
                    <span className="text-[18px]" aria-hidden="true">🎯</span>
                    <span>{t("点击上方按钮派生岗位副本", "Click above to branch a copy")}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Step 3: Export & Snapshot */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                {["PDF", "DOCX", "MD"].map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded-full bg-subtle px-2.5 py-1 font-mono text-[11px] font-semibold text-ink-600"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
              <button
                type="button"
                disabled={snapshot !== null}
                onClick={() => {
                  pause();
                  setSnapshot(achievement);
                }}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-all ${
                  snapshot
                    ? "bg-emerald-500/12 text-emerald-700"
                    : "cta-ai text-white active:scale-95"
                }`}
              >
                {snapshot ? `✓ ${t("已定格快照", "Snapshot Pinned")}` : `📌 ${t("定格投递快照", "Pin Snapshot")}`}
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <div className="soft-panel rounded-2xl p-3">
                <span className="text-[11px] font-semibold text-ink-500">
                  ✏️ {t("当前草稿（可继续改）", "Live Draft")}
                </span>
                <textarea
                  aria-label={t("演示当前内容", "Demo current draft")}
                  className="liquid-input mt-1.5 min-h-[72px] w-full resize-none rounded-xl p-2.5 text-[12px] leading-relaxed text-ink-900 outline-none"
                  value={achievement}
                  maxLength={240}
                  onFocus={pause}
                  onChange={(e) => {
                    pause();
                    setAchievement(e.target.value);
                  }}
                />
              </div>

              <AnimatePresence mode="wait">
                {snapshot ? (
                  <motion.div
                    key="snap"
                    {...spring}
                    className="pastel-sky rounded-2xl p-3"
                  >
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-700">
                      <IconLock size={11} />
                      {t("已投递快照 · 只读", "Submitted Snapshot · Read-Only")}
                    </span>
                    <p className="mt-2 break-words text-[12px] leading-relaxed text-ink-700">
                      {snapshot}
                    </p>
                  </motion.div>
                ) : (
                  <motion.div
                    key="nosnap"
                    {...spring}
                    className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-subtle/60 p-3 text-center text-[12px] text-ink-400"
                  >
                    <span className="text-[18px]" aria-hidden="true">📌</span>
                    <span>{t("导出时自动锁定历史版本", "Auto-pinned on export")}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Step 4: Interview Progress & Fireworks Cheer */}
        {step === 4 && (
          <div className="space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13.5px] font-bold text-ink-900">
                DeepSeek · {t("AI 应用工程师", "AI Product Engineer")}
              </span>
              <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${activeStage.badge}`}>
                {activeStage.emoji} {t(activeStage.zh, activeStage.en)}
              </span>
            </div>

            {/* Interactive Stage Pills */}
            <div className="liquid-glass relative flex gap-1 rounded-full p-1">
              {STAGE_PILLS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    pause();
                    setStatus(s.id);
                  }}
                  className={`flex-1 rounded-full py-1.5 text-[12px] transition-all ${
                    status === s.id
                      ? "glass-lens font-semibold text-ink-900"
                      : "text-ink-500 hover:text-ink-900"
                  }`}
                >
                  <span className="mr-1" aria-hidden="true">{s.emoji}</span>
                  {t(s.zh, s.en)}
                </button>
              ))}
            </div>

            {/* Animated Pipeline Bar */}
            <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
              <motion.div
                layout
                className={`h-full rounded-full transition-all duration-500 ${activeStage.bar}`}
              />
            </div>

            {/* Celebration Cheer Pill */}
            <AnimatePresence mode="wait">
              <motion.div
                key={status}
                {...spring}
                className={`flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 text-[12.5px] font-medium ${
                  status === "offer"
                    ? "pastel-mint text-emerald-700"
                    : status === "interview"
                    ? "pastel-violet text-brand-700"
                    : "bg-subtle/70 text-ink-600"
                }`}
              >
                <span>
                  {status === "offer"
                    ? t("🎆 恭喜拿下 Offer！所有努力都发光了！", "🎆 Offer unlocked! Every effort paid off!")
                    : status === "interview"
                    ? t("✨ 离 Offer 更近一步，稳住节奏！", "✨ One step closer to your Offer!")
                    : t("📮 已记录投递，点击上方推进面试试试 👆", "📮 Logged! Tap a stage above to advance 👆")}
                </span>
                {status === "offer" && (
                  <motion.span
                    initial={{ scale: 0.5, rotate: -15 }}
                    animate={{ scale: [1, 1.25, 1], rotate: [0, 10, 0] }}
                    transition={{ duration: 0.6 }}
                    className="text-[18px]"
                    aria-hidden="true"
                  >
                    🎉
                  </motion.span>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        )}
      </motion.div>
    </section>
  );
}
