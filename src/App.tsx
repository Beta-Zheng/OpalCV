import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { enterTransition } from "./components/motion-layer";
import { cx } from "./lib/utils";
import { useApp, type View } from "./lib/store";
import { ToastHost } from "./components/ui";
import CommandPalette from "./components/command-palette";
import Logo from "./components/logo";
import MobileOrbNav, { type OrbNavAction } from "./components/mobile-orb-nav";
import Home from "./pages/Home";
import UsageGuide from "./components/usage-guide";
import { hashView } from "./lib/navigation";
import { toggleUiLang, UI_COPY, useUiLang } from "./lib/i18n";
import {
  IconAlert,
  IconNavWorkspace,
  IconNavApplications,
  IconNavModels,
  IconNavSettings,
  IconSun,
  IconMoon,
} from "./components/icons";

const Editor = lazy(() => import("./pages/Editor"));
const Models = lazy(() => import("./pages/Models"));
const Settings = lazy(() => import("./pages/Settings"));
const Applications = lazy(() => import("./pages/Applications"));

/** 全局错误边界：任何渲染异常都显示可读的错误卡片，而不是白屏 */
class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div
          className="flex h-screen items-center justify-center bg-page p-6"
          style={{ fontFamily: '"Noto Sans SC", "PingFang SC", sans-serif' }}
        >
          <div className="soft-panel w-full max-w-md rounded-3xl p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-100 text-danger-700">
                <IconAlert size={18} />
              </span>
              <div>
                <h1 className="text-[16px] font-bold text-ink-900">
                  页面渲染出错了
                </h1>
                <p className="text-[12px] text-ink-500">
                  你的本地数据安全无虞，重新加载即可恢复
                </p>
              </div>
            </div>
            <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-subtle p-3 font-mono text-[12px] leading-relaxed text-danger-700">
              {this.state.error.message || String(this.state.error)}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="cta-ai mt-4 w-full rounded-full px-4 py-2.5 text-[13px] font-semibold text-white"
            >
              重新加载应用
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** 桌面端悬浮液态玻璃胶囊内的纯图标按钮（无常驻文字，悬停弹出液态玻璃气泡） */
function DockButton({
  active,
  onClick,
  icon,
  label,
}: {
  active?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={label}
      className="dock-icon"
    >
      {icon}
      <span className="dock-tip glass-tip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user" transition={enterTransition}>
        <AppShell />
      </MotionConfig>
    </ErrorBoundary>
  );
}

function AppShell() {
  const reducedMotion = useReducedMotion();
  const [darkMode, setDarkMode] = useState(() => {
    try {
      return localStorage.getItem("touchstone-theme") === "dark";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    try {
      localStorage.setItem("touchstone-theme", darkMode ? "dark" : "light");
    } catch {
      /* Theme works for this session. */
    }
  }, [darkMode]);

  const [hydrated, setHydrated] = useState(useApp.persist.hasHydrated());
  useEffect(() => {
    const unsubscribe = useApp.persist.onFinishHydration(() =>
      setHydrated(true)
    );
    setHydrated(useApp.persist.hasHydrated());
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const sync = () => {
      const view = hashView(window.location.hash);
      if (!view) return;
      const state = useApp.getState();
      useApp.setState({
        view:
          view.name === "editor" &&
          !state.resumes.some((r) => r.id === view.resumeId)
            ? { name: "home" }
            : view,
      });
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [hydrated]);

  const view = useApp((s) => s.view);
  const go = useApp((s) => s.go);
  const uiLang = useUiLang();
  const copy = UI_COPY[uiLang];

  const nav: Array<{
    key: View["name"];
    label: string;
    icon: ReactNode;
    view: View;
  }> = [
    {
      key: "home",
      label: copy.navHome,
      icon: <IconNavWorkspace size={23} />,
      view: { name: "home" },
    },
    {
      key: "applications",
      label: copy.navApplications,
      icon: <IconNavApplications size={22} />,
      view: { name: "applications" },
    },
    {
      key: "models",
      label: copy.navModels,
      icon: <IconNavModels size={23} />,
      view: { name: "models" },
    },
    {
      key: "settings",
      label: copy.navSettings,
      icon: <IconNavSettings size={23} />,
      view: { name: "settings" },
    },
  ];
  const activeKey = view.name === "editor" ? "home" : view.name;

  const handleToggleDarkMode = (e?: MouseEvent<HTMLButtonElement>) => {
    const next = !darkMode;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
      };
    };

    if (!doc.startViewTransition || reduced) {
      setDarkMode(next);
      return;
    }

    const rect = e?.currentTarget?.getBoundingClientRect();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 32;
    const y = rect ? rect.top + rect.height / 2 : 28;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const isShrinking = !next; // 深色 → 浅色：暗色圆弧向按钮收缩；浅色 → 深色：暗色圆弧从按钮扩散
    if (isShrinking) {
      document.documentElement.dataset.themeTransition = "shrink";
    } else {
      delete document.documentElement.dataset.themeTransition;
    }

    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        document.documentElement.dataset.theme = next ? "dark" : "light";
        setDarkMode(next);
      });
    });

    transition.ready
      .then(() => {
        const clipPath = isShrinking
          ? [
              `circle(${endRadius}px at ${x}px ${y}px)`,
              `circle(0px at ${x}px ${y}px)`,
            ]
          : [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ];
        document.documentElement.animate(
          { clipPath },
          {
            duration: 820,
            easing: "cubic-bezier(0.22, 1, 0.36, 1)",
            fill: "forwards",
            pseudoElement: isShrinking
              ? "::view-transition-old(root)"
              : "::view-transition-new(root)",
          }
        );
      })
      .catch(() => {
        // Ignore cancelled transitions on rapid toggles.
      });

    transition.finished
      ?.finally(() => {
        delete document.documentElement.dataset.themeTransition;
      })
      .catch(() => {
        delete document.documentElement.dataset.themeTransition;
      });
  };

  const mobileOrbActions: OrbNavAction[] = nav.map((n) => ({
    key: n.key,
    label: n.label,
    icon: n.icon,
    active: activeKey === n.key,
    onClick: () => go(n.view),
  }));

  if (!hydrated)
    return (
      <p role="status" className="p-6 text-ink-500">
        正在读取本机简历与版本…
      </p>
    );

  const globalControls = (
    <div
      role="toolbar"
      aria-label={uiLang === "en" ? "Global controls" : "全局切换"}
      className="flex items-center gap-2"
    >
      <button
        type="button"
        onClick={() => toggleUiLang()}
        aria-label={copy.langTip}
        className="liquid-glass-rail top-util-btn h-9 w-9 text-[12px] font-semibold tracking-tight hover:scale-105"
      >
        <span>{uiLang === "zh" ? "中" : "EN"}</span>
        <span className="top-util-tip glass-tip" aria-hidden="true">
          {copy.langTip}
        </span>
      </button>
      <button
        type="button"
        onClick={handleToggleDarkMode}
        aria-label={darkMode ? copy.themeToLight : copy.themeToDark}
        className="liquid-glass-rail top-util-btn h-9 w-9 hover:scale-105"
      >
        <span className="inline-flex transition-transform duration-300 ease-out">
          {darkMode ? <IconSun size={16} /> : <IconMoon size={16} />}
        </span>
        <span className="top-util-tip glass-tip" aria-hidden="true">
          {darkMode ? copy.themeToLight : copy.themeToDark}
        </span>
      </button>
    </div>
  );

  return (
    <div id="app-root" className="relative flex h-screen overflow-hidden bg-page">
      {/* 全局吸顶顶栏（非编辑页显示，桌面端右上角保持留白，中/英与深浅切换已移入左侧胶囊菜单栏） */}
      {view.name !== "editor" && (
        <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-page/78 px-4 backdrop-blur-md md:px-6">
          <button
            type="button"
            onClick={() => go({ name: "home" })}
            aria-label="OpalCV 返回工作台"
            className="inline-flex items-center gap-2.5 text-left transition-opacity hover:opacity-85"
            style={{
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", sans-serif',
            }}
          >
            <Logo size={36} className="shrink-0" />
            <span className="-translate-y-[1px] text-[24px] font-bold leading-none tracking-[-0.035em] text-ink-900 sm:text-[26px]">
              Opal
              <span
                className="bg-clip-text text-transparent"
                style={{
                  backgroundImage:
                    "linear-gradient(120deg, #38BDF8 0%, #6366F1 55%, #C084FC 100%)",
                }}
              >
                CV
              </span>
            </span>
          </button>
          <div className="md:hidden">{globalControls}</div>
        </header>
      )}

      {/* 桌面端（≥md）：左侧悬浮高透液态玻璃胶囊（主导航 + 全局语言/深浅切换） */}
      <nav
        aria-label="主导航"
        className="liquid-glass-rail fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-full px-1.5 py-2 md:flex"
      >
        {nav.map((n) => (
          <DockButton
            key={n.key}
            active={activeKey === n.key}
            onClick={() => go(n.view)}
            icon={n.icon}
            label={n.label}
          />
        ))}

        <div className="my-1 h-px w-5 bg-ink-300/55" />

        <DockButton
          onClick={() => toggleUiLang()}
          icon={
            <span className="text-[11.5px] font-semibold tracking-tight">
              {uiLang === "zh" ? "中" : "EN"}
            </span>
          }
          label={copy.langTip}
        />
        <button
          type="button"
          onClick={handleToggleDarkMode}
          aria-label={darkMode ? copy.themeToLight : copy.themeToDark}
          className="dock-icon"
        >
          <span className="inline-flex transition-transform duration-300 ease-out">
            {darkMode ? <IconSun size={17} /> : <IconMoon size={17} />}
          </span>
          <span className="dock-tip glass-tip" aria-hidden="true">
            {darkMode ? copy.themeToLight : copy.themeToDark}
          </span>
        </button>
      </nav>

      {/* 移动端（<md）：无边框呼吸灵动圆球 + 径向环绕纯图标菜单 */}
      <MobileOrbNav actions={mobileOrbActions} />

      {/* 主内容区：桌面端左侧为悬浮胶囊留出舒适呼吸空间，移动端全屏零遮挡 */}
      <main className="min-w-0 flex-1 overflow-hidden md:pl-[76px]">
        <motion.div
          key={view.name}
          initial={{ opacity: 0, y: reducedMotion ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={enterTransition}
          className={cx(
            "app-view h-full",
            view.name === "editor"
              ? "overflow-hidden"
              : "overflow-y-auto pt-14 pb-24 md:pb-0"
          )}
        >
          {view.name === "home" && <Home />}
          <Suspense
            fallback={
              <p role="status" className="p-6 text-ink-400">
                正在加载…
              </p>
            }
          >
            {view.name === "editor" && (
              <Editor
                key={`${view.resumeId}:${view.panel ?? ""}`}
                resumeId={view.resumeId}
                initialPanel={view.panel}
              />
            )}
            {view.name === "models" && <Models />}
            {view.name === "settings" && <Settings />}
            {view.name === "applications" && (
              <Applications initialDueOnly={view.dueOnly} />
            )}
          </Suspense>
        </motion.div>
      </main>

      <ToastHost />
      <CommandPalette />
      <UsageGuide />
    </div>
  );
}
