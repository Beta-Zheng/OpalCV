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

/* ---------- 胶囊主导航 · 清透纯线条图标（随 currentColor 自适应浅/深色与选中态） ---------- */

/** 工作台：2×2 现代极简网格 */
export function IconNavWorkspace({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <rect x="4" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13" y="4" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="4" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13" y="13" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

/** 投递记录：纸飞机投递轨迹（清透纯线条） */
export function IconNavApplications({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M20.6 3.7 13.7 20.1a.6.6 0 0 1-1.12-.04l-2.38-6.26-6.26-2.38a.6.6 0 0 1-.04-1.12L20.3 3.4a.25.25 0 0 1 .3.3Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M20.3 3.7 10.2 13.8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** 模型与隐私：隐私盾牌 + OpalCV 四芒 AI 星光（清透纯线条） */
export function IconNavModels({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path
        d="M12 3.2 5.2 5.9c-.44.18-.7.6-.7 1.08v4.62c0 4.66 3.16 8.05 7.5 9.2 4.34-1.15 7.5-4.54 7.5-9.2V6.98c0-.48-.26-.9-.7-1.08L12 3.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.2c.32 2.05 1 2.73 3.05 3.05-2.05.32-2.73 1-3.05 3.05-.32-2.05-1-2.73-3.05-3.05 2.05-.32 2.73-1 3.05-3.05Z"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 数据管理：本地数据库 + 备份同步环（清透纯线条） */
export function IconNavSettings({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false" className={className}>
      <ellipse
        cx="10.5"
        cy="6.5"
        rx="6"
        ry="2.4"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M4.5 6.5v5c0 1.3 2.7 2.4 6 2.4M4.5 11.5v5c0 1.3 2.7 2.4 6 2.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M16.5 13.2v-2m0 2h2m-2 0a3.5 3.5 0 0 1 3.3 4.7M16.5 19.8v2m0-2h-2m2 0a3.5 3.5 0 0 1-3.3-4.7"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
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
