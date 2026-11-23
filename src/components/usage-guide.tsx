import { useEffect, useState } from "react";
import GuideDemo from "./guide-demo";
import {
  createGuidePreferences,
  GUIDE_STEPS,
  GUIDE_STORAGE_KEY,
  shouldOfferGuide,
} from "../lib/onboarding";
import { useApp } from "../lib/store";
import { useT } from "../lib/i18n";
import Logo from "./logo";
import { Btn, Modal } from "./ui";
import { IconArrowRight, IconFile, IconLock, IconSpark, IconX } from "./icons";

const preferences = createGuidePreferences(() => window.localStorage);

export default function UsageGuide() {
  const t = useT();
  const [mode, setMode] = useState<"welcome" | "tour" | null>(null);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const state = useApp.getState();
    const hasSavedWork = !!(
      state.resumes.length ||
      state.applications.length ||
      state.snapshots.length ||
      state.suggestions.length ||
      Object.keys(state.jds).length ||
      Object.keys(state.coverLetters).length ||
      state.externalCallCount ||
      state.models.some((model) => model.enabled)
    );
    if (shouldOfferGuide(hasSavedWork, preferences.read())) setMode("welcome");
    else if (hasSavedWork && !preferences.read())
      preferences.remember("existing");

    const reopen = () => {
      preferences.remember("started");
      setStep(0);
      setRun((previous) => previous + 1);
      setMode("tour");
    };
    const sync = (event: StorageEvent) => {
      if (event.key === GUIDE_STORAGE_KEY && preferences.read())
        setMode((previous) => (previous === "welcome" ? null : previous));
    };
    window.addEventListener("opalcv-open-guide", reopen);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("opalcv-open-guide", reopen);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const close = () => {
    preferences.remember("skipped");
    setMode(null);
  };

  if (!mode) return null;

  return (
    <Modal
      open
      onClose={close}
      width={mode === "welcome" ? "max-w-[520px]" : "max-w-2xl"}
    >
      {mode === "welcome" ? (
        <div className="relative p-6 sm:p-7">
          <button
            type="button"
            onClick={close}
            aria-label={t("关闭", "Close")}
            className="tool-btn modal-close absolute right-4 top-4 rounded-full"
          >
            <IconX size={16} />
          </button>

          {/* Brand Hero */}
          <div className="flex items-center gap-3.5 pr-8">
            <Logo size={44} />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-[20px] font-bold tracking-tight text-ink-900">
                  {t("欢迎使用 ", "Welcome to ")}
                  <span>Opal</span>
                  <span className="bg-gradient-to-r from-[#38BDF8] via-[#6366F1] to-[#C084FC] bg-clip-text text-transparent">
                    CV
                  </span>
                </h2>
              </div>
              <p className="mt-0.5 text-[13px] text-ink-500">
                {t("把经历，打磨成光 · 本地优先的 AI 简历工作台", "Craft your story into brilliance, locally.")}
              </p>
            </div>
          </div>

          {/* 3 Airy Pastel Highlights */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="pastel-mint flex flex-col gap-1.5 rounded-[18px] p-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-surface/90 text-emerald-600 shadow-xs">
                <IconLock size={14} />
              </span>
              <span className="text-[13px] font-semibold text-ink-900">
                {t("数据留本机", "Local-First")}
              </span>
              <span className="text-[11.5px] leading-relaxed text-ink-500">
                {t("IndexedDB 存储，零云端上传", "Stored in browser, zero uploads")}
              </span>
            </div>

            <div className="pastel-violet flex flex-col gap-1.5 rounded-[18px] p-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-surface/90 text-brand-600 shadow-xs">
                <IconSpark size={14} />
              </span>
              <span className="text-[13px] font-semibold text-ink-900">
                {t("可控 AI 辅助", "Opt-In AI")}
              </span>
              <span className="text-[11.5px] leading-relaxed text-ink-500">
                {t("支持本地 Ollama，逐条对比采纳", "Local Ollama & line-by-line diffs")}
              </span>
            </div>

            <div className="pastel-sky flex flex-col gap-1.5 rounded-[18px] p-3.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-surface/90 text-sky-600 shadow-xs">
                <IconFile size={14} />
              </span>
              <span className="text-[13px] font-semibold text-ink-900">
                {t("高清无水印", "Clean Export")}
              </span>
              <span className="text-[11.5px] leading-relaxed text-ink-500">
                {t("免费导出 PDF / DOCX，全流程跟进", "Free PDF / DOCX & pipeline tracker")}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[11.5px] text-ink-400">
              {t("演示数据不会保存，可随时再次查看", "Demo never saves data · replay anytime")}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  preferences.remember("started");
                  setStep(0);
                  setMode("tour");
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-medium text-ink-700 shadow-xs ring-1 ring-ink-900/8 transition-all hover:bg-subtle hover:text-ink-900"
              >
                <span>{t("快速演示", "Quick Tour")}</span>
                <IconArrowRight size={13} />
              </button>
              <Btn
                variant="primary"
                className="cta-ai h-9 rounded-full px-5 text-[13px]"
                onClick={close}
              >
                {t("直接开始", "Get Started")}
              </Btn>
            </div>
          </div>
        </div>
      ) : (
        <div className="relative p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 pr-2">
            <div className="flex items-center gap-2.5">
              <Logo size={28} />
              <div>
                <h2 className="text-[16px] font-bold tracking-tight text-ink-900">
                  {t("使用指南", "Quick Guide")}
                </h2>
                <p className="text-[11.5px] text-ink-400 tabular-nums">
                  {t(`第 ${step + 1} / ${GUIDE_STEPS.length} 步`, `Step ${step + 1} of ${GUIDE_STEPS.length}`)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label={t("关闭", "Close")}
              className="tool-btn modal-close rounded-full"
            >
              <IconX size={16} />
            </button>
          </div>

          {/* Liquid Glass Step Pill */}
          <div
            className="liquid-glass relative my-4 flex gap-1 rounded-full p-1"
            aria-label={`演示进度：${step + 1} / ${GUIDE_STEPS.length}`}
          >
            {GUIDE_STEPS.map((item, index) => (
              <button
                key={item.title}
                type="button"
                aria-label={`查看${item.label}演示`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
                className={`min-w-0 flex-1 rounded-full px-2 py-1.5 text-[12px] transition-all ${
                  index === step
                    ? "glass-lens font-semibold text-brand-700"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="max-h-[58vh] overflow-y-auto pr-0.5">
            <h3 className="text-[16px] font-bold text-ink-900" aria-live="polite">
              {GUIDE_STEPS[step].title}
            </h3>
            <p className="mb-3 mt-1 text-[13px] leading-relaxed text-ink-500">
              {GUIDE_STEPS[step].text}
            </p>
            <div className="soft-panel overflow-hidden rounded-[20px] p-3">
              <GuideDemo key={run} step={step} />
            </div>
            <p className="mt-3 text-[11.5px] text-ink-400">
              {t("实际入口：", "Where to find: ")}
              {step === 1 ? (
                <>
                  <span className="hidden xl:inline">{GUIDE_STEPS[step].entry}</span>
                  <span className="xl:hidden">{t("简历编辑页 → 仅预览", "Editor → Preview")}</span>
                </>
              ) : (
                GUIDE_STEPS[step].entry
              )}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
            <Btn variant="ghost" size="sm" className="rounded-full" onClick={close}>
              {t("跳过演示", "Skip")}
            </Btn>
            <div className="flex items-center gap-2">
              <Btn
                size="sm"
                className="rounded-full"
                disabled={step === 0}
                onClick={() => setStep((previous) => Math.max(0, previous - 1))}
              >
                {t("上一步", "Back")}
              </Btn>
              <Btn
                variant="primary"
                size="sm"
                className="cta-ai rounded-full px-4"
                onClick={() => {
                  if (step === GUIDE_STEPS.length - 1) {
                    preferences.remember("completed");
                    setMode(null);
                  } else {
                    setStep((previous) => Math.min(GUIDE_STEPS.length - 1, previous + 1));
                  }
                }}
              >
                {step === GUIDE_STEPS.length - 1
                  ? t("开始使用", "Start Now")
                  : t(`下一步：${GUIDE_STEPS[step + 1].label}`, `Next: ${GUIDE_STEPS[step + 1].label}`)}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
