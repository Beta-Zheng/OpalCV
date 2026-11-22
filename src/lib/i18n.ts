import { useSyncExternalStore } from "react";

export type UiLang = "zh" | "en";

const STORAGE_KEY = "opalcv-ui-lang";

function readInitialLang(): UiLang {
  if (typeof window === "undefined") return "zh";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    // Fallback to default Chinese when storage is unavailable.
  }
  return "zh";
}

let currentLang: UiLang = readInitialLang();
const listeners = new Set<() => void>();

function syncDocumentLang(lang: UiLang) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  }
}

syncDocumentLang(currentLang);

export function getUiLang(): UiLang {
  return currentLang;
}

/** 非 React 模块（如 store / utils / sync）同步获取当前界面语言的双语文案 */
export function tr(zh: string, en: string): string {
  return currentLang === "en" ? en : zh;
}

export function setUiLang(next: UiLang) {
  if (next === currentLang) return;
  currentLang = next;
  syncDocumentLang(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
  listeners.forEach((fn) => fn());
}

export function toggleUiLang(): UiLang {
  const next: UiLang = currentLang === "zh" ? "en" : "zh";
  setUiLang(next);
  return next;
}

export function useUiLang(): UiLang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getUiLang,
    () => "zh"
  );
}

/** 轻量双语切换助手：t("中文", "English") */
export function useT() {
  const lang = useUiLang();
  return (zh: string, en: string) => (lang === "en" ? en : zh);
}

const AUDIENCE_EN: Record<string, string> = {
  experienced: "Experienced",
  student: "New Grad",
  internship: "Internship",
};

const APP_STATUS_EN: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

const SAMPLE_KIND_EN: Record<string, string> = {
  ai: "AI Application Engineer",
  frontend: "Frontend Engineer",
  data: "Data Analyst",
  en_google_ml: "Staff ML Engineer · LLM & Post-Training",
  en_apple_ai: "Senior On-Device AI & Multimodal Engineer",
  en_msft_agent: "Principal Applied AI Engineer · Copilot & Agents",
};

const TEMPLATE_NAME_EN: Record<string, string> = {
  modern_single_column: "Modern Single Column",
  swiss_grid: "Swiss Grid Timeline",
  executive_sidebar: "Modern Sidebar",
  classic_ats: "Classic ATS",
  academic_photo: "Academic Photo",
  latex_minimal: "LaTeX Minimal",
  campus_compact: "Compact One-Page",
};

const ACTION_EN: Record<string, { label: string; hint: string }> = {
  translate: {
    label: "Translate EN",
    hint: "Model required: translate into natural English while keeping facts",
  },
  polish: {
    label: "Polish",
    hint: "Preserve facts while making phrasing sharper and result-oriented",
  },
  rewrite: {
    label: "Rewrite",
    hint: "Restructure into Action Verb + Scope + Impact bullets",
  },
  quantify: {
    label: "Quantify",
    hint: "Highlight where measurable metrics or scope can be added",
  },
  shorten: {
    label: "Shorten",
    hint: "Trim filler words to keep each bullet concise and punchy",
  },
  expand: {
    label: "Expand",
    hint: "Add context, methodology, and execution depth",
  },
  jd_match: {
    label: "Align to JD",
    hint: "Emphasize target JD keywords without fabricating facts",
  },
  ats_optimize: {
    label: "ATS Optimize",
    hint: "Standard action verbs, clean formatting, front-loaded keywords",
  },
};

const DEFAULT_PROVIDER_NAME_EN: Record<string, string> = {
  "本地 Ollama（默认）": "Local Ollama (Default)",
  "外部 OpenAI Compatible（默认关闭）": "External OpenAI Compatible (Off by Default)",
};

export function audienceLabel(id: string, zhFallback: string, lang: UiLang) {
  return lang === "en" ? (AUDIENCE_EN[id] ?? zhFallback) : zhFallback;
}

export function appStatusLabel(id: string, zhFallback: string, lang: UiLang) {
  return lang === "en" ? (APP_STATUS_EN[id] ?? zhFallback) : zhFallback;
}

export function sampleKindLabel(id: string, zhFallback: string, lang: UiLang) {
  return lang === "en" ? (SAMPLE_KIND_EN[id] ?? zhFallback) : zhFallback;
}

export function templateNameLabel(id: string, zhFallback: string, lang: UiLang) {
  return lang === "en" ? (TEMPLATE_NAME_EN[id] ?? zhFallback) : zhFallback;
}

export function actionLabel(id: string, zhFallback: string, lang: UiLang) {
  return lang === "en" ? (ACTION_EN[id]?.label ?? zhFallback) : zhFallback;
}

export function actionHint(id: string, zhFallback: string, lang: UiLang) {
  return lang === "en" ? (ACTION_EN[id]?.hint ?? zhFallback) : zhFallback;
}

export function providerDisplayName(name: string, lang: UiLang) {
  return lang === "en" ? (DEFAULT_PROVIDER_NAME_EN[name] ?? name) : name;
}

export const UI_COPY = {
  zh: {
    brandTip: "OpalCV · 欧泊简历",
    navHome: "工作台",
    navApplications: "投递记录",
    navModels: "模型与隐私",
    navSettings: "设置",
    searchTip: "快捷检索 (⌘K)",
    guideTip: "使用指南",
    langTip: "切换为 English",
    themeToLight: "切换浅色模式",
    themeToDark: "切换暗色模式",
    homeTitle: "工作台",
    importResume: "导入简历",
    samples: "精品示例",
    startBlank: "从零开始",
    myResumes: "我的简历",
    emptyLines: [
      "把经历，打磨成光",
      "拖入 PDF / DOCX，或点击上方卡片开始",
    ] as readonly string[],
  },
  en: {
    brandTip: "OpalCV · Resume Studio",
    navHome: "Workspace",
    navApplications: "Applications",
    navModels: "Models & Privacy",
    navSettings: "Settings",
    searchTip: "Quick Search (⌘K)",
    guideTip: "Guide",
    langTip: "Switch to 中文",
    themeToLight: "Light mode",
    themeToDark: "Dark mode",
    homeTitle: "Workspace",
    importResume: "Import Resume",
    samples: "Curated Samples",
    startBlank: "Start from Scratch",
    myResumes: "My Resumes",
    emptyLines: [
      "Polish experience into brilliance",
      "Drop a PDF / DOCX, or pick a card above",
    ] as readonly string[],
  },
} as const;
