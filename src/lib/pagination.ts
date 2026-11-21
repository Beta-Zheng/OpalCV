import type { Resume, Section } from "../types";
import { blockHasContent, localizedResume } from "./workflow";

export interface PageLayout {
  resume: Resume;
  oversized: boolean;
  height: number;
  usedHeight?: number;
  capacity?: number;
}
export function paginateResume(
  resume: Resume,
  heights: Record<string, number>,
  headerHeight: number,
  sectionHeights: Record<string, number>,
  capacity = 1035,
  bulletHeights?: Record<string, number[]>
): PageLayout[] {
  const r = localizedResume(resume);
  const pages: PageLayout[] = [];
  let sections: Section[] = [];
  let used = headerHeight;
  let oversized = headerHeight > capacity;
  const finish = () => {
    const basic = r.data.sections.find((s) => s.type === "basic_info");
    pages.push({
      resume: {
        ...r,
        data: {
          ...r.data,
          sections: [
            {
              ...(basic ?? {
                section_id: "page-contact",
                type: "basic_info",
                title: "基本信息",
                blocks: [],
                order: -1,
              }),
              visible: pages.length === 0 && (basic?.visible ?? true),
            } as Section,
            ...sections,
          ],
        },
      },
      oversized,
      height: 1123 + Math.max(0, used - capacity),
      usedHeight: used,
      capacity,
    });
    sections = [];
    used = 0;
    oversized = false;
  };
  for (const s of r.data.sections
    .filter((s) => s.visible && s.type !== "basic_info")
    .sort((a, b) => a.order - b.order)) {
    const blocks = s.blocks
      .filter((b) => b.visible && blockHasContent(b))
      .sort((a, b) => a.order - b.order);
    const heading = sectionHeights[s.section_id] ?? 50;
    let group: Section | null = null;
    for (const b of blocks) {
      const height = heights[b.block_id] ?? 120;
      const neededHeading = group ? 0 : heading;
      if (used + neededHeading + height <= capacity) {
        if (!group) {
          group = { ...s, blocks: [] };
          sections.push(group);
          used += heading;
        }
        group.blocks.push(b);
        used += height;
        continue;
      }

      const bulletEntries = b.bullets
        .map((text, idx) => ({ text, mark: b.bullet_marks?.[idx] }))
        .filter((item) => Boolean(item.text));
      const count = bulletEntries.length;
      const shouldSplit =
        count >= 2 && (height > capacity || height > capacity * 0.5);

      if (!shouldSplit) {
        if (sections.length > 0 || used > 0) {
          finish();
          group = null;
        }
        if (!group) {
          group = { ...s, blocks: [] };
          sections.push(group);
          used += heading;
        }
        group.blocks.push(b);
        used += height;
        if (used > capacity) oversized = true;
        continue;
      }

      const measured = bulletHeights?.[b.block_id];
      const bHeights =
        measured && measured.length >= count
          ? measured.slice(0, count)
          : (() => {
              const hasHeader = Boolean(
                b.title || b.subtitle || b.subtitles?.length || b.description
              );
              const chrome = hasHeader
                ? Math.min(80, Math.round(height * 0.2))
                : 0;
              const per = Math.max(1, (height - chrome) / count);
              return Array.from({ length: count }, () => per);
            })();
      const bulletsSum = bHeights.reduce((sum, h) => sum + h, 0);
      const headerChrome = Math.max(0, height - bulletsSum);
      const contChrome = Math.min(16, headerChrome);

      let cursor = 0;
      while (cursor < count) {
        const isFirst = cursor === 0;
        const pageHeading = group ? 0 : heading;
        const chrome = isFirst ? headerChrome : contChrome;
        if (
          used + pageHeading + chrome + bHeights[cursor] > capacity &&
          (sections.length > 0 || used > 0)
        ) {
          finish();
          group = null;
          continue;
        }
        if (!group) {
          group = { ...s, blocks: [] };
          sections.push(group);
          used += heading;
        }
        let end = cursor + 1;
        let fragHeight = chrome + bHeights[cursor];
        while (end < count && used + fragHeight + bHeights[end] <= capacity) {
          fragHeight += bHeights[end];
          end++;
        }
        const isLast = end === count;
        const slice = bulletEntries.slice(cursor, end);
        group.blocks.push({
          ...b,
          ...(isFirst
            ? {}
            : {
                title: "",
                subtitle: "",
                subtitles: undefined,
                start_date: "",
                end_date: "",
                location: "",
                description: "",
              }),
          bullets: slice.map((item) => item.text),
          ...(b.bullet_marks
            ? { bullet_marks: slice.map((item) => item.mark ?? true) }
            : {}),
          skills: isLast ? b.skills : [],
        });
        used += fragHeight;
        if (used > capacity) oversized = true;
        cursor = end;
      }
    }
  }
  if (sections.length || !pages.length) finish();
  return pages;
}
