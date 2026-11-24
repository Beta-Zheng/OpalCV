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
import { IconArrowRight, IconX } from "./icons";

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
      width={mode === "welcome" ? "max-w-[480px]" : "max-w-2xl"}
    >
      {mode === "welcome" ? (
        <div className="relative p-6">
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
            <Logo size={42} />
            <div className="min-w-0">
              <h2 className="text-[20px] font-bold tracking-tight text-ink-900">
                <span>Opal</span>
                <span className="bg-gradient-to-r from-[#38BDF8] via-[#6366F1] to-[#C084FC] bg-clip-text text-transparent">
                  CV
                </span>
                <span className="ml-1.5 text-[16px]" aria-hidden="true">👋</span>
              </h2>
              <p className="mt-0.5 text-[13px] text-ink-500">
                {t("把经历，打磨成光 ✨", "Craft your story into brilliance ✨")}
              </p>
            </div>
          </div>

          {/* 3 Ultra-Light Pastel Highlights */}
          <div className="mt-5 grid grid-cols-3 gap-2">
            <div className="pastel-mint flex flex-col items-center gap-1 rounded-[18px] px-2.5 py-3 text-center">
              <span className="text-[20px] leading-none" aria-hidden="true">🔒</span>
              <span className="mt-0.5 text-[12.5px] font-semibold text-ink-900">
                {t("纯本地", "Local-First")}
              </span>
              <span className="text-[11px] text-ink-500">
                {t("数据零上传", "Zero cloud")}
              </span>
            </div>

            <div className="pastel-violet flex flex-col items-center gap-1 rounded-[18px] px-2.5 py-3 text-center">
              <span className="text-[20px] leading-none" aria-hidden="true">🤖</span>
              <span className="mt-0.5 text-[12.5px] font-semibold text-ink-900">
                {t("可控 AI", "Opt-In AI")}
              </span>
              <span className="text-[11px] text-ink-500">
                {t("逐条 Diff 润色", "Inline diffs")}
              </span>
            </div>

            <div className="pastel-sky flex flex-col items-center gap-1 rounded-[18px] px-2.5 py-3 text-center">
              <span className="text-[20px] leading-none" aria-hidden="true">📄</span>
              <span className="mt-0.5 text-[12.5px] font-semibold text-ink-900">
                {t("免费导出", "Free Export")}
              </span>
              <span className="text-[11px] text-ink-500">
                {t("PDF / Word", "No watermark")}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                preferences.remember("started");
                setStep(0);
                setMode("tour");
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-medium text-ink-700 shadow-xs ring-1 ring-ink-900/8 transition-all hover:bg-subtle hover:text-ink-900"
            >
              <span>{t("30 秒演示", "Quick Tour")}</span>
              <IconArrowRight size={13} />
            </button>
            <Btn
              variant="primary"
              className="cta-ai h-9 rounded-full px-5 text-[13px]"
              onClick={close}
            >
              {t("直接开始 🚀", "Get Started 🚀")}
            </Btn>
          </div>
        </div>
      ) : (
        <div className="relative p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Logo size={26} />
              <h2 className="text-[15.5px] font-bold tracking-tight text-ink-900">
                {t("快速上手", "Quick Tour")}
              </h2>
              <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-400 tabular-nums">
                {step + 1} / {GUIDE_STEPS.length}
              </span>
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
            className="liquid-glass relative my-3.5 flex gap-1 rounded-full p-1"
            aria-label={`演示进度：${step + 1} / ${GUIDE_STEPS.length}`}
          >
            {GUIDE_STEPS.map((item, index) => (
              <button
                key={item.label}
                type="button"
                aria-label={`查看${item.label}演示`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
                className={`min-w-0 flex-1 whitespace-nowrap rounded-full px-1.5 py-1.5 text-[12px] transition-all ${
                  index === step
                    ? "glass-lens font-semibold text-brand-700"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                <span className="mr-1" aria-hidden="true">{item.emoji}</span>
                {item.label}
              </button>
            ))}
          </div>

          <div className="max-h-[58vh] overflow-y-auto pr-0.5">
            <div className="mb-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <h3 className="text-[15px] font-bold text-ink-900" aria-live="polite">
                {GUIDE_STEPS[step].title}
              </h3>
              <span className="text-[12.5px] text-ink-500">
                {GUIDE_STEPS[step].text}
              </span>
            </div>
            <GuideDemo key={run} step={step} />
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Btn variant="ghost" size="sm" className="rounded-full" onClick={close}>
              {t("跳过", "Skip")}
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
                  ? t("开始使用 🚀", "Start 🚀")
                  : t("下一步 →", "Next →")}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
