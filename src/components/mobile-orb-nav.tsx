import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "../lib/utils";
import Logo from "./logo";
import { IconX } from "./icons";

export interface OrbNavAction {
  key: string;
  label: string;
  icon: ReactNode;
  active?: boolean;
  primary?: boolean;
  onClick: () => void;
}

const ORB_SIZE = 48;
const ORBIT_RADIUS = 78;
const EDGE_MARGIN = 16;

/**
 * 移动端无边框呼吸灵动圆球 + 径向环绕纯图标菜单（<md）：
 * - 本体零边框，保留柔和呼吸光晕动画；
 * - 支持自由拖动，松手自动吸附左右边缘；
 * - 点击原地沿内侧 180° 半圆弧（R=78px）弹性绽放 6 颗纯图标液态玻璃卫星；
 * - 靠顶/底角时展开自动垂直微移入安全区，收起后滑回原停靠位。
 */
export default function MobileOrbNav({
  actions,
}: {
  actions: OrbNavAction[];
}) {
  const [pos, setPos] = useState<{ left: number; top: number }>(() => {
    if (typeof window === "undefined") return { left: 320, top: 620 };
    return {
      left: Math.max(EDGE_MARGIN, window.innerWidth - ORB_SIZE - EDGE_MARGIN),
      top: Math.max(120, window.innerHeight - ORB_SIZE - 96),
    };
  });
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const savedTopRef = useRef<number | null>(null);
  const dragStateRef = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    origLeft: 0,
    origTop: 0,
  });

  useEffect(() => {
    const handleResize = () => {
      setPos((cur) => {
        const onRight = cur.left + ORB_SIZE / 2 > window.innerWidth / 2;
        const left = onRight
          ? Math.max(EDGE_MARGIN, window.innerWidth - ORB_SIZE - EDGE_MARGIN)
          : EDGE_MARGIN;
        const maxTop = Math.max(20, window.innerHeight - ORB_SIZE - 20);
        return { left, top: Math.max(20, Math.min(maxTop, cur.top)) };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const setMenuOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      const minSafeTop = ORBIT_RADIUS + 64;
      const maxSafeTop = Math.max(
        minSafeTop,
        window.innerHeight - ORBIT_RADIUS - ORB_SIZE - 28
      );
      const clampedTop = Math.max(minSafeTop, Math.min(maxSafeTop, pos.top));
      if (Math.abs(clampedTop - pos.top) > 2) {
        savedTopRef.current = pos.top;
        setPos((cur) => ({ ...cur, top: clampedTop }));
      } else {
        savedTopRef.current = null;
      }
    } else if (savedTopRef.current !== null) {
      const restore = savedTopRef.current;
      savedTopRef.current = null;
      setPos((cur) => ({ ...cur, top: restore }));
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStateRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origLeft: pos.left,
      origTop: pos.top,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current;
    if (!st.active) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (Math.hypot(dx, dy) > 5) {
      st.moved = true;
      if (open) setMenuOpen(false);
    }
    const maxX = Math.max(EDGE_MARGIN, window.innerWidth - ORB_SIZE - EDGE_MARGIN);
    const maxY = Math.max(20, window.innerHeight - ORB_SIZE - 20);
    setPos({
      left: Math.max(EDGE_MARGIN, Math.min(maxX, st.origLeft + dx)),
      top: Math.max(20, Math.min(maxY, st.origTop + dy)),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const st = dragStateRef.current;
    if (!st.active) return;
    st.active = false;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!st.moved) {
      setMenuOpen(!open);
      return;
    }
    // 松手自动吸附左右边缘
    setPos((cur) => {
      const snapLeft =
        cur.left + ORB_SIZE / 2 < window.innerWidth / 2
          ? EDGE_MARGIN
          : Math.max(EDGE_MARGIN, window.innerWidth - ORB_SIZE - EDGE_MARGIN);
      return { ...cur, left: snapLeft };
    });
  };

  const onRight =
    typeof window === "undefined"
      ? true
      : pos.left + ORB_SIZE / 2 > window.innerWidth / 2;
  const centerX = pos.left + ORB_SIZE / 2;
  const centerY = pos.top + ORB_SIZE / 2;
  const count = actions.length;

  return (
    <div className="md:hidden">
      {/* 展开时的轻遮罩 */}
      {open && (
        <div
          aria-hidden="true"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[2px] transition-opacity"
        />
      )}

      {/* 环绕圆球的 6 颗纯图标液态玻璃卫星菜单 */}
      <nav
        aria-label="移动端导航"
        className="pointer-events-none fixed z-50"
        style={{
          left: centerX,
          top: centerY,
          transition: dragging
            ? "none"
            : "left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.24s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {actions.map((item, i) => {
          const t = count > 1 ? i / (count - 1) : 0.5;
          const deg = onRight ? -90 - t * 180 : -90 + t * 180;
          const rad = (deg * Math.PI) / 180;
          const ox = Math.round(Math.cos(rad) * ORBIT_RADIUS);
          const oy = Math.round(Math.sin(rad) * ORBIT_RADIUS);
          return (
            <button
              key={item.key}
              type="button"
              aria-label={item.label}
              title={item.label}
              aria-current={item.active ? "page" : undefined}
              onClick={() => {
                setMenuOpen(false);
                item.onClick();
              }}
              className={cx(
                "orbital-item",
                open && "is-open",
                item.primary
                  ? "cta-ai text-white"
                  : item.active
                  ? "liquid-glass glass-lens"
                  : "liquid-glass text-ink-700"
              )}
              style={
                {
                  "--ox": `${ox}px`,
                  "--oy": `${oy}px`,
                  transitionDelay: open ? `${i * 28}ms` : "0ms",
                } as React.CSSProperties
              }
            >
              {item.icon}
            </button>
          );
        })}
      </nav>

      {/* 无边框呼吸灵动圆球 */}
      <button
        type="button"
        aria-label={open ? "收起导航菜单" : "展开导航菜单"}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="floating-orb-btn fixed z-50 flex h-12 w-12 touch-none select-none items-center justify-center rounded-full text-white cursor-grab active:cursor-grabbing"
        style={{
          left: pos.left,
          top: pos.top,
          transition: dragging
            ? "none"
            : "left 0.28s cubic-bezier(0.22, 1, 0.36, 1), top 0.24s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {open ? <IconX size={19} /> : <Logo size={42} variant="light" />}
      </button>
    </div>
  );
}
