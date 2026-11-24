export const GUIDE_STORAGE_KEY = "opalcv-usage-guide";
export type GuideDecision = "started" | "skipped" | "completed" | "existing";
type GuideStorage = Pick<Storage, "getItem" | "setItem">;

/** This device preference is independent of resume backups and clear-all. */
export function createGuidePreferences(getStorage: () => GuideStorage) {
  let sessionDecision: GuideDecision | null = null;
  return {
    read(): GuideDecision | null {
      try {
        const raw = getStorage().getItem(GUIDE_STORAGE_KEY);
        if (!raw) return sessionDecision;
        const value: unknown = JSON.parse(raw);
        if (
          value &&
          typeof value === "object" &&
          "version" in value &&
          value.version === 1 &&
          "decision" in value &&
          typeof value.decision === "string" &&
          ["started", "skipped", "completed", "existing"].includes(
            value.decision
          )
        )
          return value.decision as GuideDecision;
      } catch {
        /* A blocked browser preference must not block resume work. */
      }
      return sessionDecision;
    },
    remember(decision: GuideDecision) {
      sessionDecision = decision;
      try {
        getStorage().setItem(
          GUIDE_STORAGE_KEY,
          JSON.stringify({ version: 1, decision })
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}

export function shouldOfferGuide(
  hasSavedWork: boolean,
  decision: GuideDecision | null
) {
  return !hasSavedWork && decision === null;
}

export const GUIDE_STEPS = [
  {
    emoji: "✨",
    title: "✨ 10 秒建好简历",
    text: "导入文件、选示例，或从零开写。",
    label: "创建",
    entry: "工作台 → 新建",
  },
  {
    emoji: "✍️",
    title: "✍️ 左写右看，实时预览",
    text: "改成果、换模板，所见即所印。",
    label: "编辑",
    entry: "编辑页 → 内容与预览",
  },
  {
    emoji: "🎯",
    title: "🎯 按岗位派生专属版",
    text: "贴 JD 精准改写，主简历不受影响。",
    label: "定制",
    entry: "编辑页 → 定制岗位",
  },
  {
    emoji: "📄",
    title: "📄 免费导出，定格快照",
    text: "高清 PDF / Word，记住每次投递版本。",
    label: "导出",
    entry: "编辑页 → 导出",
  },
  {
    emoji: "🎆",
    title: "🎆 跟进面试，烟花打气",
    text: "更新每轮进展，解锁专属鼓励。",
    label: "跟进",
    entry: "投递记录 → 更新进度",
  },
] as const;

export function openUsageGuide() {
  window.dispatchEvent(new Event("opalcv-open-guide"));
}
