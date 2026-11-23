import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconEdit } from "./icons";
import { TEMPLATES, type Resume } from "../types";
import { type PageLayout } from "../lib/pagination";
import { A4Sheet } from "./template";
import { readResumeLayout } from "./resume-measure";
import { Btn } from "./ui";
import { flashLocation, scrollInPane, type ResumeLocation } from "../lib/preview-navigation";
import { templateNameLabel, useT, useUiLang } from "../lib/i18n";
import { stripHtml } from "../lib/utils";

export default function ResumePreview({
  resume,
  onLayout,
  onOpenOnePage,
  location,
  onLocate,
  tools,
}: {
  resume: Resume;
  tools?: ReactNode;
  onLayout?: (pages: PageLayout[], measurement: ReturnType<typeof readResumeLayout>) => void;
  onOpenOnePage?: () => void;
  location?: ResumeLocation | null;
  onLocate?: (sectionId: string, blockId?: string) => void;
}) {
  const t = useT();
  const uiLang = useUiLang();
  const tplLabel = templateNameLabel(
    resume.template_id,
    TEMPLATES.find((tpl) => tpl.template_id === resume.template_id)?.name ??
      resume.template_id,
    uiLang
  );
  const container = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const displayed = useRef<HTMLDivElement>(null);
  const measuredSource = useRef<Resume | null>(null);
  const handled = useRef<number | null>(null);
  const clearHighlight = useRef<(() => void) | null>(null);
  const [notice, setNotice] = useState("");
  const [controls, setControls] = useState<Array<{ element: HTMLElement; sectionId: string; blockId?: string; label: string }>>([]);
  const [controlIndex, setControlIndex] = useState(0);
  const [width, setWidth] = useState(794);
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const [pages, setPages] = useState<PageLayout[]>([
    { resume, oversized: false, height: 1123 },
  ]);
  const callback = useRef(onLayout);
  callback.current = onLayout;
  useEffect(() => {
    let frame = 0;
    let stopped = false;
    const compute = () => {
      if (stopped || !measure.current) return;
      const root = measure.current;
      const measurement = readResumeLayout(root, resume);
      const layout = measurement.pages;
      measuredSource.current = resume;
      setPages(layout);
      callback.current?.(layout, measurement);
    };
    const schedule = () => {
      if (stopped) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(compute);
    };
    const observer = new ResizeObserver(schedule);
    if (measure.current) observer.observe(measure.current);
    schedule();
    void document.fonts.ready.then(schedule);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [resume]);
  useEffect(() => {
    const update = () =>
      setWidth(Math.max(200, (container.current?.clientWidth ?? 826) - 32));
    const observer = new ResizeObserver(update);
    if (container.current) observer.observe(container.current);
    update();
    return () => observer.disconnect();
  }, []);
  useEffect(() => () => clearHighlight.current?.(), []);
  useEffect(() => {
    if (!onLocate || !displayed.current) return;
    const root = displayed.current;
    const nodes = root.querySelectorAll<HTMLElement>("[data-resume-entry], section[data-resume-section] > h2, header[data-resume-section]");
    const next: typeof controls = [];
    nodes.forEach(element => {
      const sectionId = element.closest<HTMLElement>("[data-resume-section]")?.dataset.resumeSection;
      if (!sectionId) return;
      const section = resume.data.sections.find(s => s.section_id === sectionId);
      const block = section?.blocks.find(b => b.block_id === element.dataset.resumeEntry);
      if (element.tagName === "H2") element.setAttribute("aria-label", element.textContent?.trim() || section?.title || "栏目");
      next.push({ element, sectionId, blockId: element.dataset.resumeEntry,
        label: `定位编辑：${section?.title ?? "基本信息"}${block ? ` · ${stripHtml(block.title || block.subtitle || block.description || block.bullets[0] || block.skills.join("、") || "条目").slice(0, 48)}` : ""}` });
    });
    setControls(previous => previous.length === next.length && previous.every((item, i) => item.element === next[i].element && item.label === next[i].label) ? previous : next);
    setControlIndex(index => Math.min(index, Math.max(0, next.length - 1)));
  }, [pages, resume, onLocate]);
  useEffect(() => {
    if (!location || !displayed.current || measuredSource.current !== resume) return;
    const root = displayed.current;
    root.querySelectorAll("[data-preview-current]").forEach(el => el.removeAttribute("data-preview-current"));
    const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-resume-section]"))
      .filter(el => el.dataset.resumeSection === location.sectionId);
    const target = location.blockId
      ? sections.flatMap(el => Array.from(el.querySelectorAll<HTMLElement>("[data-resume-entry]"))).find(el => el.dataset.resumeEntry === location.blockId)
      : sections[0]?.querySelector<HTMLElement>("h2") ?? sections[0];
    target?.setAttribute("data-preview-current", "true");
    if (!target) {
      clearHighlight.current?.();
      handled.current = location.requestId;
      setNotice("该内容已隐藏或为空，未出现在预览中");
      return;
    }
    const name = resume.data.sections.find(s => s.section_id === location.sectionId)?.title ?? "内容";
    setNotice(`已定位：${name} · 第 ${target.closest<HTMLElement>("[data-preview-page]")?.dataset.previewPage ?? "1"} 页`);
    // Reconcile the stable marker after repagination, without scrolling while typing.
    if (handled.current === location.requestId) return;
    handled.current = location.requestId;
    clearHighlight.current?.();
    const boundary = container.current?.closest<HTMLElement>(".editor-preview");
    const toolbar = container.current?.querySelector<HTMLElement>("[data-preview-toolbar]");
    if (boundary && location.scroll !== false) scrollInPane(target, boundary, (toolbar?.offsetHeight ?? 44) + 12, true);
    clearHighlight.current = flashLocation(target, "preview");
  }, [location, pages, resume]);
  const locateFromPreview = (target: Element) => {
    if (!onLocate || target.closest("a,input,textarea,select")) return;
    const selection = window.getSelection();
    if (selection?.toString() && displayed.current?.contains(selection.anchorNode)) return;
    const entry = target.closest<HTMLElement>("[data-resume-entry]");
    const section = target.closest<HTMLElement>("[data-resume-section]");
    if (section?.dataset.resumeSection) onLocate(section.dataset.resumeSection, entry?.dataset.resumeEntry);
  };
  const scale = zoom === "fit" ? Math.min(1, width / 794) : zoom;
  return (
    <div
      ref={container}
      className="relative min-w-0"
      data-testid="resume-preview"
    >
      {onLocate && <p role="status" className={notice.startsWith("该内容") ? "border-b border-line px-3 py-2 text-[12px] text-seal-700" : "sr-only"}>{notice}</p>}
      {onLocate && controls.map((control, index) => createPortal(
        <button key={index} type="button" data-preview-edit
          className="preview-edit-link" aria-label={control.label} title={control.label}
          tabIndex={index === controlIndex ? 0 : -1}
          style={{ transform: `scale(${1 / scale})`, transformOrigin: "top right" }}
          onClick={event => { event.stopPropagation(); onLocate(control.sectionId, control.blockId); }}
          onFocus={() => setControlIndex(index)}
          onKeyDown={event => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            const next = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 :
              (index + (event.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
            setControlIndex(next);
            controls[next].element.querySelector<HTMLButtonElement>("[data-preview-edit]")?.focus({ preventScroll: true });
            const boundary = container.current?.closest<HTMLElement>(".editor-preview");
            const toolbar = container.current?.querySelector<HTMLElement>("[data-preview-toolbar]");
            if (boundary) scrollInPane(controls[next].element, boundary, (toolbar?.offsetHeight ?? 44) + 12, true);
          }}><IconEdit size={16}/></button>, control.element, `${control.sectionId}:${control.blockId ?? 'heading'}:${index}`
      ))}
      <div
        ref={measure}
        aria-hidden="true"
        className="pointer-events-none"
        style={{
          width: 794,
          visibility: "hidden",
          position: "fixed",
          left: -10000,
          top: 0,
        }}
      >
        <A4Sheet resume={resume} />
      </div>
      <div ref={displayed} className={`preview-canvas rounded-2xl overflow-x-auto px-5 pb-6 pt-3 ${onLocate ? "interactive-preview" : ""}`}
        onClick={event => locateFromPreview(event.target as Element)}
        >
        <div className="sticky top-2.5 z-10 mb-3 flex justify-center">
          <div
            data-preview-toolbar
            onClick={(e) => e.stopPropagation()}
            className="liquid-glass relative flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto whitespace-nowrap rounded-full px-2.5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <span className="shrink-0 rounded-full bg-surface/85 px-2 py-0.5 text-[11px] font-semibold text-ink-600 ring-1 ring-ink-900/6">
              {t(`${pages.length} 页`, `${pages.length}p`)}
            </span>
            <div className="flex shrink-0 flex-nowrap items-center gap-0.5" data-preview-controls>
              {tools}
              {(["fit", 0.75, 1] as const).map((value) => (
                <Btn
                  key={value}
                  variant="ghost"
                  size="sm"
                  aria-pressed={zoom === value}
                  className={`h-7 min-h-7 shrink-0 rounded-full px-2 text-[11px] ${value !== "fit" ? "preview-zoom-fixed" : ""} ${
                    zoom === value ? "glass-lens font-semibold" : ""
                  }`}
                  onClick={() => setZoom(value)}
                >
                  {value === "fit" ? t("适应", "Fit") : `${value * 100}%`}
                </Btn>
              ))}
            </div>
          </div>
        </div>
        {pages.map((page, i) => (
          <div
            key={i}
            data-preview-page={i + 1}
            className="mx-auto mb-7 last:mb-2"
            style={{ width: 794 * scale, minHeight: page.height * scale }}
          >
            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
              <div className="flex items-center gap-1.5">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-surface/85 px-2.5 py-0.5 text-[10.5px] font-medium text-ink-500 ring-1 ring-ink-900/6">
                  {t(`A4 · 第 ${i + 1} / ${pages.length} 页`, `A4 · Page ${i + 1} of ${pages.length}`)}
                  {page.oversized &&
                    t(" · 单个条目过长，请拆分后导出", " · Entry exceeds page height, split before export")}
                </p>
                {onOpenOnePage && pages.length === 2 && i === 1 && !page.oversized && typeof page.capacity === "number" && typeof page.usedHeight === "number" && page.capacity > 0 && page.usedHeight / page.capacity <= 0.25 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenOnePage();
                    }}
                    className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-medium text-brand-700 ring-1 ring-brand-200 transition-colors hover:bg-brand-100"
                  >
                    {t(
                      `仅占 ${Math.max(1, Math.round((page.usedHeight / page.capacity) * 100))}% · 调为 1 页`,
                      `${Math.max(1, Math.round((page.usedHeight / page.capacity) * 100))}% full · Fit 1p`
                    )}
                  </button>
                )}
              </div>
              <span className="truncate text-[10.5px] font-medium text-ink-400">
                {tplLabel} · <span className="font-mono text-[10px]">210 × 297 mm</span>
              </span>
            </div>
            <div className="a4-paper-frame overflow-hidden" style={{ height: page.height * scale, position: "relative" }}>
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                  width: 794,
                }}
              >
                <A4Sheet resume={page.resume} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
