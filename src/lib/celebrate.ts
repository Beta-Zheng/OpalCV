/* ------------------------------------------------------------------
 * 庆祝时刻：canvas-confetti 的品牌化封装
 * 每次面试/投递进度更新时释放烟花并送上鼓励文案，陪伴求职每一步。
 * ------------------------------------------------------------------ */
import confetti from "canvas-confetti";

/** 品牌色系：深海靛 + 天蓝 + 紫罗兰 + 琥珀 + 浅紫 */
const PALETTE = ["#4F46E5", "#38BDF8", "#C084FC", "#D97706", "#C3C8FB"];

export const INTERVIEW_ENCOURAGEMENTS: ReadonlyArray<{ zh: string; en: string }> = [
  {
    zh: "每一次推进，都在离理想的 Offer 更近一步！",
    en: "Every step forward brings you closer to your ideal offer!",
  },
  {
    zh: "稳扎稳打的节奏最打动面试官，继续保持！",
    en: "Steady momentum wins interviews — keep that rhythm going!",
  },
  {
    zh: "你的经历和准备足够扎实，下一面一定发挥出色！",
    en: "Your experience and preparation are solid — you've got the next round!",
  },
  {
    zh: "复盘一次就是一次升级，越战越从容。",
    en: "Each reflection levels you up — sharper and calmer every round.",
  },
  {
    zh: "好机会总留给持续行动的人，为你点赞！",
    en: "Great opportunities reward consistent action — proud of your progress!",
  },
  {
    zh: "把每次沟通都当成双向交流，展现真实的专业光芒。",
    en: "Treat every interview as a two-way conversation and let your craft shine.",
  },
  {
    zh: "不急不躁，一步一个脚印，属于你的位子正在等你！",
    en: "Stay calm and step by step — the right role is waiting for you!",
  },
  {
    zh: "今天又完成一次关键推进，记得给自己一点肯定！",
    en: "Another meaningful milestone logged today — give yourself credit!",
  },
  {
    zh: "简历里每一行积累，都会在面试桌上替你发光。",
    en: "Every achievement on your resume speaks for you at the table.",
  },
  {
    zh: "保持自信与好奇心，期待你的下一条好消息！",
    en: "Keep your confidence and curiosity — cheering for your next good news!",
  },
];

export function pickInterviewEncouragement(lang: "zh" | "en", index?: number): string {
  const idx =
    typeof index === "number"
      ? Math.abs(index) % INTERVIEW_ENCOURAGEMENTS.length
      : Math.floor(Math.random() * INTERVIEW_ENCOURAGEMENTS.length);
  return INTERVIEW_ENCOURAGEMENTS[idx][lang];
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 单发：从中偏右喷出，短促收场 */
export function celebrate() {
  if (reducedMotion()) return;
  confetti({
    particleCount: 90,
    spread: 70,
    startVelocity: 38,
    ticks: 160,
    origin: { x: 0.62, y: 0.32 },
    colors: PALETTE,
    disableForReducedMotion: true,
    zIndex: 200,
  });
}

/** 双发：左右连喷，用于 Offer 等更隆重的时刻 */
export function celebrateBig() {
  if (reducedMotion()) return;
  const opts = { colors: PALETTE, disableForReducedMotion: true, zIndex: 200, ticks: 190 };
  confetti({ ...opts, particleCount: 70, spread: 60, origin: { x: 0.3, y: 0.35 } });
  setTimeout(() => confetti({ ...opts, particleCount: 70, spread: 60, origin: { x: 0.75, y: 0.3 } }), 140);
}

/** 面试进度更新时释放烟花并弹出中英文鼓励文案 */
export function celebrateInterviewProgress(
  status: string,
  lang: "zh" | "en",
  toast?: (kind: "ok" | "warn" | "err" | "info", msg: string) => void
) {
  if (status === "offer") celebrateBig();
  else celebrate();
  toast?.("ok", pickInterviewEncouragement(lang));
}
