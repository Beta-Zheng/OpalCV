import {
  Upload, File, ClipboardList, Sparkles, Target, Download, Trash2,
  GripVertical, Eye, EyeOff, Plus, X, Check, ChevronUp, ChevronDown,
  ChevronLeft, ChevronRight, Settings2, Cpu, ShieldCheck, TriangleAlert,
  RefreshCw, Layers, Pencil, Printer, Database, WandSparkles, Info,
  ArrowRight, Zap, LockKeyhole, GraduationCap, BriefcaseBusiness, FolderGit2,
  Award, BookOpen, Palette, Type, PanelsTopLeft, Wrench, UserRound, Search, Sun, Moon,
  Menu, PanelRight, ListChecks, MoreHorizontal, Archive, type LucideIcon, type LucideProps,
} from "lucide-react";

// Shared line icons: explicit sizes remain available for document templates.
function icon(Component: LucideIcon) {
  return function AppIcon({ size = 18, strokeWidth = 1.75, ...props }: LucideProps) {
    return <Component size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" {...props} />;
  };
}

export const IconUpload = icon(Upload);
export const IconFile = icon(File);
export const IconClipboard = icon(ClipboardList);
export const IconSpark = icon(Sparkles);
export const IconTarget = icon(Target);
export const IconDownload = icon(Download);
export const IconTrash = icon(Trash2);
export const IconGrip = icon(GripVertical);
export const IconEye = icon(Eye);
export const IconEyeOff = icon(EyeOff);
export const IconPlus = icon(Plus);
export const IconX = icon(X);
export const IconCheck = icon(Check);
export const IconChevronUp = icon(ChevronUp);
export const IconChevronDown = icon(ChevronDown);
export const IconChevronLeft = icon(ChevronLeft);
export const IconChevronRight = icon(ChevronRight);
export const IconSettings = icon(Settings2);
export const IconCpu = icon(Cpu);
export const IconShield = icon(ShieldCheck);
export const IconAlert = icon(TriangleAlert);
export const IconRefresh = icon(RefreshCw);
export const IconLayers = icon(Layers);
export const IconEdit = icon(Pencil);
export const IconPrinter = icon(Printer);
export const IconDatabase = icon(Database);
export const IconWand = icon(WandSparkles);
export const IconInfo = icon(Info);
export const IconArrowRight = icon(ArrowRight);
export const IconZap = icon(Zap);
export const IconLock = icon(LockKeyhole);
export const IconGraduationCap = icon(GraduationCap);
export const IconBriefcase = icon(BriefcaseBusiness);
export const IconFolderGit = icon(FolderGit2);
export const IconAward = icon(Award);
export const IconBookOpen = icon(BookOpen);
export const IconPalette = icon(Palette);
export const IconType = icon(Type);
export const IconLayout = icon(PanelsTopLeft);
export const IconWrench = icon(Wrench);
export const IconUser = icon(UserRound);
export const IconSearch = icon(Search);
export const IconSun = icon(Sun);
export const IconMoon = icon(Moon);
export const IconMenu = icon(Menu);
export const IconPanelRight = icon(PanelRight);
export const IconDashboard = icon(PanelsTopLeft);
// Applications are a manually maintained record, not an automatic send action.
export const IconApplications = icon(ListChecks);
export const IconMoreHorizontal = icon(MoreHorizontal);
export const IconArchive = icon(Archive);

/* ---------- 胶囊主导航 · 专属语义双调图标（随 currentColor 自适应浅/深色与选中态） ---------- */

/** 工作台：叠层简历卡片（带姓名与正文横线） */
export function IconNavWorkspace({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M8.5 4.5h8A2.5 2.5 0 0 1 19 7v11"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        strokeOpacity="0.45"
      />
      <rect
        x="4.5"
        y="6.5"
        width="12"
        height="14.5"
        rx="2.6"
        fill="currentColor"
        fillOpacity="0.10"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="8.4" cy="10.6" r="1.25" fill="currentColor" />
      <path
        d="M11.4 10.6h2.6M7.5 14.3h6.2M7.5 17.2h4.2"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 投递记录：纸飞机投递轨迹（与卡片投递计数图标统一视觉语言） */
export function IconNavApplications({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M20.6 3.7 13.7 20.1a.6.6 0 0 1-1.12-.04l-2.38-6.26-6.26-2.38a.6.6 0 0 1-.04-1.12L20.3 3.4a.25.25 0 0 1 .3.3Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M20.3 3.7 10.2 13.8"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 模型与隐私：隐私盾牌 + OpalCV 四芒 AI 星光 */
export function IconNavModels({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M12 3.2 5.2 5.9c-.44.18-.7.6-.7 1.08v4.62c0 4.66 3.16 8.05 7.5 9.2 4.34-1.15 7.5-4.54 7.5-9.2V6.98c0-.48-.26-.9-.7-1.08L12 3.2Z"
        fill="currentColor"
        fillOpacity="0.10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.1c.34 2.15 1.05 2.86 3.2 3.2-2.15.34-2.86 1.05-3.2 3.2-.34-2.15-1.05-2.86-3.2-3.2 2.15-.34 2.86-1.05 3.2-3.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** 设置与数据：现代圆润双滑块控制图标 */
export function IconNavSettings({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M4.5 8h5M14.5 8h5M4.5 16h9M18.5 16h1"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle
        cx="12"
        cy="8"
        r="2.4"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle
        cx="16"
        cy="16"
        r="2.4"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

/* ---------- 工作台快捷入口 · 液态玻璃双层叠影图标（无白底框，直接悬浮于粉彩卡片） ---------- */

export function IconQuickImport({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id="opal-qi-back" x1="3" y1="3" x2="22" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDA4AF" />
          <stop offset="1" stopColor="#F43F5E" />
        </linearGradient>
        <linearGradient id="opal-qi-glass" x1="8" y1="5" x2="23" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="1" stopColor="#FFE4E6" stopOpacity="0.72" />
        </linearGradient>
      </defs>
      <rect x="4" y="3.5" width="15" height="19" rx="4.5" transform="rotate(-8 11.5 13)" fill="url(#opal-qi-back)" />
      <rect x="8.5" y="5.5" width="15" height="19" rx="4.5" fill="url(#opal-qi-glass)" stroke="#FFFFFF" strokeOpacity="0.95" strokeWidth="1.15" />
      <path d="M16 19v-6.5m0 0-2.8 2.8M16 12.5l2.8 2.8" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconQuickSample({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id="opal-qs-back" x1="3" y1="3" x2="23" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="0.52" stopColor="#6366F1" />
          <stop offset="1" stopColor="#C084FC" />
        </linearGradient>
        <linearGradient id="opal-qs-glass" x1="8" y1="5" x2="23" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="1" stopColor="#EEF2FF" stopOpacity="0.74" />
        </linearGradient>
      </defs>
      <rect x="4" y="3.5" width="15" height="19" rx="4.5" transform="rotate(-8 11.5 13)" fill="url(#opal-qs-back)" />
      <rect x="8.5" y="5.5" width="15" height="19" rx="4.5" fill="url(#opal-qs-glass)" stroke="#FFFFFF" strokeOpacity="0.95" strokeWidth="1.15" />
      <path d="M16 10.6C16.45 13.4 17.4 14.35 20.2 14.8 17.4 15.25 16.45 16.2 16 19 15.55 16.2 14.6 15.25 11.8 14.8 14.6 14.35 15.55 13.4 16 10.6Z" fill="url(#opal-qs-back)" />
    </svg>
  );
}

export function IconQuickBlank({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true" focusable="false" className={className}>
      <defs>
        <linearGradient id="opal-qb-back" x1="3" y1="3" x2="23" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FDE047" />
          <stop offset="0.55" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
        <linearGradient id="opal-qb-glass" x1="8" y1="5" x2="23" y2="25" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="1" stopColor="#FEF3C7" stopOpacity="0.74" />
        </linearGradient>
      </defs>
      <rect x="4" y="3.5" width="15" height="19" rx="4.5" transform="rotate(-8 11.5 13)" fill="url(#opal-qb-back)" />
      <rect x="8.5" y="5.5" width="15" height="19" rx="4.5" fill="url(#opal-qb-glass)" stroke="#FFFFFF" strokeOpacity="0.95" strokeWidth="1.15" />
      <path d="M16 11.3v7.4M12.3 15h7.4" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
