import type { ReactNode } from "react";
import { motion, useIsPresent, type Transition } from "framer-motion";

export const enterTransition: Transition = {
  duration: 0.2,
  ease: [0.22, 1, 0.36, 1],
};
export const exitTransition: Transition = { duration: 0.14, ease: [0.4, 0, 1, 1] };

/** Keep the exit visible without leaving an invisible input or click blocker. */
export function PresenceLayer({ children, className }: { children: ReactNode; className: string }) {
  const present = useIsPresent();
  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={exitTransition}
      aria-hidden={!present || undefined}
      {...(!present ? { inert: "" } : {})}
      style={{ pointerEvents: present ? undefined : "none" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
