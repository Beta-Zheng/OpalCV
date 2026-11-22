import { useEffect, useRef } from "react";

const STAR_D =
  "M 0 -9.6 C 0.95 -3.1 3.1 -0.95 9.6 0 C 3.1 0.95 0.95 3.1 0 9.6 C -0.95 3.1 -3.1 0.95 -9.6 0 C -3.1 -0.95 -0.95 -3.1 0 -9.6 Z";
const SPHERE_R = 21.5;

/** 柔和对称慢进慢出缓动：起止零突兀，彻底杜绝闪现感 */
const GENTLE_EASINGS = [
  (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
];

/** 灵动眼眸 3D 扫视缓动：灵巧扫视 / 弹性轻瞥 / 柔弧巡视 / 加速掠过 */
const LIVELY_EASINGS = [
  (t: number) => 1 - Math.pow(1 - t, 4),
  (t: number) => 1 - Math.pow(1 - t, 3) * Math.cos(t * 1.1),
  (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
];

/** 灵动模式随机轮播的 3 种眼眸性格（灵巧好奇 / 沉静专注 / 活泼探索） */
const LIVELY_PROFILES = [
  {
    maxAngle: 0.96,
    minJump: 0.55,
    curveBend: 0.52,
    saccadeRatio: 0.55,
    saccadeMs: [340, 560] as const,
    pursuitMs: [850, 1450] as const,
    pauseMs: [500, 1300] as const,
  },
  {
    maxAngle: 0.82,
    minJump: 0.45,
    curveBend: 0.42,
    saccadeRatio: 0.25,
    saccadeMs: [480, 720] as const,
    pursuitMs: [1200, 2000] as const,
    pauseMs: [1100, 2400] as const,
  },
  {
    maxAngle: 1.08,
    minJump: 0.72,
    curveBend: 0.65,
    saccadeRatio: 0.7,
    saccadeMs: [260, 440] as const,
    pursuitMs: [650, 1050] as const,
    pauseMs: [280, 780] as const,
  },
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * OpalCV 品牌图形标识：
 * - 二维扁平流淌电光渐变正圆作为字母「O」的形意；
 * - 内部纯白星光眼在虚拟前半球做 3D 贝塞尔曲线运动：
 *   - motion="calm"（默认）：从容舒缓、极度克制，适合常驻导航栏；
 *   - motion="lively"：星光如眼眸三维灵动扫视，随机播放多种性格与扫视节奏。
 */
export default function Logo({
  size = 36,
  variant = "color",
  className = "",
  animated = true,
  flow,
  motion = "calm",
}: {
  size?: number;
  variant?: "color" | "light";
  className?: string;
  animated?: boolean;
  flow?: boolean;
  motion?: "calm" | "lively";
}) {
  const starRef = useRef<SVGPathElement>(null);
  const shouldFlow = flow ?? animated;

  useEffect(() => {
    const el = starRef.current;
    if (!el) return;

    const applyTransform = (
      yaw: number,
      pitch: number,
      eyeScale: number,
      now: number
    ) => {
      const x = Math.cos(pitch) * Math.sin(yaw);
      const y = Math.sin(pitch);
      const z = Math.max(0.2, Math.cos(pitch) * Math.cos(yaw));
      const sx = 32 + x * SPHERE_R;
      const sy = 32 + y * SPHERE_R;
      const radialDist = Math.min(0.98, Math.hypot(x, y));
      const foreshorten =
        0.58 + 0.42 * Math.sqrt(1 - radialDist * radialDist * 0.76);
      const perspScale = (0.85 + z * 0.23) * eyeScale;
      const radialAngle = Math.atan2(y, x) * (180 / Math.PI);
      const gentleRot = Math.sin(now * 0.0005) * 12;
      el.setAttribute(
        "transform",
        `translate(${sx.toFixed(2)}, ${sy.toFixed(2)}) rotate(${radialAngle.toFixed(
          1
        )}) scale(${(perspScale * foreshorten).toFixed(3)}, ${perspScale.toFixed(
          3
        )}) rotate(${(-radialAngle + gentleRot).toFixed(1)})`
      );
    };

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!animated || reduced) {
      applyTransform(0.24, -0.22, 1.04, 0);
      return;
    }

    let rafId = 0;
    let lastNow = performance.now();
    const isLively = motion === "lively";
    let activeProfile =
      LIVELY_PROFILES[Math.floor(Math.random() * LIVELY_PROFILES.length)];

    const state = {
      cur: { yaw: 0.14, pitch: -0.1 },
      anchor: { yaw: 0.14, pitch: -0.1 },
      from: { yaw: 0.14, pitch: -0.1 },
      ctrl1: { yaw: 0, pitch: 0 },
      ctrl2: { yaw: 0, pitch: 0 },
      to: { yaw: 0.14, pitch: -0.1 },
      scaleFrom: 1,
      scaleMid: 1.12,
      scaleTo: 1,
      curScale: 1,
      mode: "pause" as "move" | "pause",
      elapsed: 0,
      duration: isLively ? rand(220, 440) : rand(900, 1600),
      easing: isLively ? LIVELY_EASINGS[0] : GENTLE_EASINGS[0],
      driftPhase: Math.random() * Math.PI * 2,
    };

    const pickNextMove = () => {
      // 严格从当前真实渲染坐标出发，杜绝任何瞬移跳点
      state.from = { ...state.cur };

      if (isLively) {
        activeProfile =
          LIVELY_PROFILES[Math.floor(Math.random() * LIVELY_PROFILES.length)];
        let targetYaw = 0;
        let targetPitch = 0;
        let tries = 0;
        do {
          const ang = rand(0, Math.PI * 2);
          const rad = Math.sqrt(rand(0.18, 1)) * activeProfile.maxAngle;
          targetYaw = Math.cos(ang) * rad;
          targetPitch = Math.sin(ang) * rad;
          tries++;
        } while (
          Math.hypot(targetYaw - state.from.yaw, targetPitch - state.from.pitch) <
            activeProfile.minJump &&
          tries < 12
        );
        state.to = { yaw: targetYaw, pitch: targetPitch };

        const dx = state.to.yaw - state.from.yaw;
        const dy = state.to.pitch - state.from.pitch;
        const bend = rand(-activeProfile.curveBend, activeProfile.curveBend);
        const midYaw = (state.from.yaw + state.to.yaw) / 2 - dy * bend;
        const midPitch = (state.from.pitch + state.to.pitch) / 2 + dx * bend;
        // 将二次贝塞尔控制点等价转为三次贝塞尔控制点
        state.ctrl1 = {
          yaw: state.from.yaw + ((midYaw - state.from.yaw) * 2) / 3,
          pitch: state.from.pitch + ((midPitch - state.from.pitch) * 2) / 3,
        };
        state.ctrl2 = {
          yaw: state.to.yaw + ((midYaw - state.to.yaw) * 2) / 3,
          pitch: state.to.pitch + ((midPitch - state.to.pitch) * 2) / 3,
        };

        state.scaleFrom = state.curScale;
        state.scaleMid = Math.random() < 0.65 ? rand(1.08, 1.18) : rand(0.86, 0.94);
        state.scaleTo = rand(0.94, 1.06);

        const isSaccade = Math.random() < activeProfile.saccadeRatio;
        state.easing = isSaccade
          ? LIVELY_EASINGS[Math.random() < 0.7 ? 0 : 1]
          : LIVELY_EASINGS[Math.random() < 0.6 ? 2 : 3];
        state.duration = isSaccade
          ? rand(activeProfile.saccadeMs[0], activeProfile.saccadeMs[1])
          : rand(activeProfile.pursuitMs[0], activeProfile.pursuitMs[1]);
        state.elapsed = 0;
        state.mode = "move";
        return;
      }

      const ang = rand(0, Math.PI * 2);
      const rad = Math.sqrt(rand(0.12, 1)) * 0.82;
      state.to = {
        yaw: Math.cos(ang) * rad,
        pitch: Math.sin(ang) * rad,
      };

      const dx = state.to.yaw - state.from.yaw;
      const dy = state.to.pitch - state.from.pitch;
      const dist = Math.hypot(dx, dy);
      const bend1 = rand(-0.48, 0.48);
      const bend2 = rand(-0.48, 0.48);
      state.ctrl1 = {
        yaw: state.from.yaw + dx * 0.33 - dy * bend1,
        pitch: state.from.pitch + dy * 0.33 + dx * bend1,
      };
      state.ctrl2 = {
        yaw: state.from.yaw + dx * 0.67 - dy * bend2,
        pitch: state.from.pitch + dy * 0.67 + dx * bend2,
      };

      // 配合移动过程的柔和瞳孔变大变小（从当前缩放无缝衔接）
      state.scaleFrom = state.curScale;
      state.scaleMid = Math.random() < 0.6 ? rand(1.1, 1.2) : rand(0.82, 0.9);
      state.scaleTo = rand(0.9, 1.08);

      state.easing =
        GENTLE_EASINGS[Math.floor(Math.random() * GENTLE_EASINGS.length)];
      // 按移动距离自适应拉长耗时（约 1.8s ~ 3.2s），保证从容柔和绝不闪现
      state.duration = Math.max(1750, Math.min(3300, 1450 + dist * 1350 + rand(0, 450)));
      state.elapsed = 0;
      state.mode = "move";
    };

    const pickPause = () => {
      state.anchor = { ...state.cur };
      state.mode = "pause";
      state.elapsed = 0;
      state.duration = isLively
        ? rand(activeProfile.pauseMs[0], activeProfile.pauseMs[1])
        : rand(1200, 2400);
      state.driftPhase = Math.random() * Math.PI * 2;
    };

    const tick = (now: number) => {
      // 钳制单帧步长 ≤ 48ms：切标签页回来也不会突然跳一大段
      const dt = document.hidden ? 0 : Math.min(48, Math.max(0, now - lastNow));
      lastNow = now;

      if (dt > 0) {
        state.elapsed += dt;
        if (state.elapsed >= state.duration) {
          if (state.mode === "move") {
            state.cur = { ...state.to };
            state.curScale = state.scaleTo;
            pickPause();
          } else {
            pickNextMove();
          }
        }

        if (state.mode === "move") {
          const t = Math.min(1, state.elapsed / state.duration);
          const e = state.easing(t);
          const u = 1 - e;
          state.cur = {
            yaw:
              u * u * u * state.from.yaw +
              3 * u * u * e * state.ctrl1.yaw +
              3 * u * e * e * state.ctrl2.yaw +
              e * e * e * state.to.yaw,
            pitch:
              u * u * u * state.from.pitch +
              3 * u * u * e * state.ctrl1.pitch +
              3 * u * e * e * state.ctrl2.pitch +
              e * e * e * state.to.pitch,
          };
          const su = 1 - t;
          state.curScale =
            su * su * state.scaleFrom +
            2 * su * t * state.scaleMid +
            t * t * state.scaleTo;
        } else {
          // 凝视期保持极其柔和的微漂，且实时同步到 state.cur 保证衔接无缝
          const p = state.elapsed / state.duration;
          const envelope = Math.sin(p * Math.PI); // 首尾归零，进出绝对丝滑
          const s = state.elapsed * 0.0018 + state.driftPhase;
          state.cur = {
            yaw: state.anchor.yaw + Math.sin(s * 1.2) * 0.025 * envelope,
            pitch: state.anchor.pitch + Math.cos(s * 1.0) * 0.025 * envelope,
          };
          state.curScale =
            state.scaleTo + Math.sin(s * 0.85) * 0.03 * envelope;
        }

        applyTransform(state.cur.yaw, state.cur.pitch, state.curScale, now);
      }

      rafId = requestAnimationFrame(tick);
    };

    applyTransform(state.cur.yaw, state.cur.pitch, state.curScale, lastNow);
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [animated, motion]);

  if (variant === "light") {
    return (
      <svg
        className={`logo ${className}`.trim()}
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        aria-hidden="true"
      >
        <path ref={starRef} d={STAR_D} fill="#FFFFFF" />
      </svg>
    );
  }

  return (
    <span
      className={`logo opal-logo-orb ${shouldFlow ? "opal-logo-flow" : ""} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        className="block"
      >
        <path ref={starRef} d={STAR_D} fill="#FFFFFF" />
      </svg>
    </span>
  );
}
