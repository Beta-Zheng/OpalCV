import type { Resume } from "../types";
import { memo } from "react";
import { A4Sheet } from "./template";

function ResumeThumbnail({
  resume,
  className,
}: {
  resume: Resume;
  className?: string;
}) {
  return (
    <div
      className={`resume-thumbnail preview-canvas relative h-56 overflow-hidden rounded-t-xl border-b border-line ${className ?? ""}`}
      aria-hidden="true"
    >
      <div
        className="pointer-events-none absolute left-1/2 top-4 transition-transform duration-300 group-hover:-translate-y-0.5"
        style={{
          width: 794,
          transform: "translateX(-50%) scale(0.185)",
          transformOrigin: "top center",
        }}
      >
        <div className="shadow-lg shadow-ink-950/15 ring-1 ring-ink-900/8">
          <A4Sheet resume={resume} />
        </div>
      </div>
    </div>
  );
}
export default memo(ResumeThumbnail);
