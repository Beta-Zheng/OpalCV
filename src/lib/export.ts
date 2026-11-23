import type { Block, BulletStyleKey, Resume, Section } from "../types";
import { localizedResume, blockHasContent } from "./workflow";
import { fontStack, resolveBulletStyle, stripHtml } from "./utils";

export function plainText(value: string): string {
  return stripHtml(
    value.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(?:p|div|li)>/gi, "\n")
  )
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/\*\*/g, "");
}

export interface DocumentParagraph {
  text: string;
  style: "name" | "heading" | "entry" | "body";
}

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  lineBreak?: boolean;
}

const KNOWN_HTML_TAG_RE =
  /<(\/?)(strong|b|em|i|u|br|p|div|span|ul|ol|li|h[1-6]|blockquote|pre)\b[^>]*>/gi;

const BULLET_SYMBOLS: Record<Exclude<BulletStyleKey, "ordered">, string> = {
  disc: "●",
  diamond: "◆",
  arrow: "→",
  square: "▪",
  check: "✓",
  circle: "○",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");
}

function pushTextWithLineBreaks(
  runs: InlineRun[],
  rawText: string,
  bold: boolean,
  italic: boolean,
  color?: string
) {
  const decoded = decodeEntities(rawText);
  const lines = decoded.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (idx > 0) runs.push({ text: "", lineBreak: true, bold, italic, color });
    if (line.length > 0) {
      runs.push({ text: line, bold, italic, color });
    }
  });
}

/** Parse inline HTML (`<strong>`, `<b>`, `<em>`, `<i>`, `<br>`) and `**bold**` into styled runs. */
export function parseInlineRuns(
  value: string,
  base: { bold?: boolean; italic?: boolean; color?: string } = {}
): InlineRun[] {
  const trimmed = value.replace(/[\s\u00a0]+$/, "");
  if (!trimmed) return [];

  const runs: InlineRun[] = [];
  const baseBold = Boolean(base.bold);
  const baseItalic = Boolean(base.italic);

  KNOWN_HTML_TAG_RE.lastIndex = 0;
  if (KNOWN_HTML_TAG_RE.test(trimmed)) {
    KNOWN_HTML_TAG_RE.lastIndex = 0;
    let boldDepth = 0;
    let italicDepth = 0;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = KNOWN_HTML_TAG_RE.exec(trimmed)) !== null) {
      if (match.index > lastIndex) {
        pushTextWithLineBreaks(
          runs,
          trimmed.slice(lastIndex, match.index),
          baseBold || boldDepth > 0,
          baseItalic || italicDepth > 0,
          base.color
        );
      }
      const isClosing = match[1] === "/";
      const tag = match[2].toLowerCase();
      if (tag === "strong" || tag === "b") {
        boldDepth = isClosing ? Math.max(0, boldDepth - 1) : boldDepth + 1;
      } else if (tag === "em" || tag === "i") {
        italicDepth = isClosing
          ? Math.max(0, italicDepth - 1)
          : italicDepth + 1;
      } else if (tag === "br") {
        runs.push({
          text: "",
          lineBreak: true,
          bold: baseBold || boldDepth > 0,
          italic: baseItalic || italicDepth > 0,
          color: base.color,
        });
      } else if (
        (tag === "p" || tag === "div" || tag === "li") &&
        isClosing &&
        runs.length > 0
      ) {
        runs.push({
          text: "",
          lineBreak: true,
          bold: baseBold || boldDepth > 0,
          italic: baseItalic || italicDepth > 0,
          color: base.color,
        });
      }
      lastIndex = KNOWN_HTML_TAG_RE.lastIndex;
    }

    if (lastIndex < trimmed.length) {
      pushTextWithLineBreaks(
        runs,
        trimmed.slice(lastIndex),
        baseBold || boldDepth > 0,
        baseItalic || italicDepth > 0,
        base.color
      );
    }
    // Drop trailing line breaks
    while (runs.length > 0 && runs[runs.length - 1].lineBreak) {
      runs.pop();
    }
    return runs;
  }

  const segments = trimmed.split("**");
  segments.forEach((seg, idx) => {
    if (!seg) return;
    const isBold = baseBold || (idx % 2 === 1 && segments.length > 1);
    pushTextWithLineBreaks(runs, seg, isBold, baseItalic, base.color);
  });
  return runs;
}

export function normalizeHexColor(color?: string, fallback = "4F46E5"): string {
  const cleaned = (color ?? "").replace(/^#/, "").trim();
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    return cleaned
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return fallback;
}

export function isTwoColumnTemplate(templateId: string): boolean {
  return /executive_sidebar|two[_-]?column|2col/i.test(templateId);
}

export function formatBulletPrefix(
  bulletStyle: BulletStyleKey,
  seq: number
): string {
  if (bulletStyle === "ordered") return `${seq}. `;
  return `${BULLET_SYMBOLS[bulletStyle] ?? "●"} `;
}

export function resumeParagraphs(input: Resume): DocumentParagraph[] {
  const resume = localizedResume(input);
  const info = resume.data.basic_info;
  const result: DocumentParagraph[] = [];
  const push = (
    text: string,
    style: DocumentParagraph["style"] = "body",
    rich = false
  ) => {
    if (text.trim())
      result.push({
        text: rich ? plainText(text) : text.replace(/\*\*/g, ""),
        style,
      });
  };
  if (
    resume.data.sections.find((s) => s.type === "basic_info")?.visible !== false
  ) {
    push(info.name, "name");
    push(info.title);
    push(
      [
        info.email,
        info.phone,
        info.location,
        info.website,
        ...(info.custom_fields ?? [])
          .filter((f) => f.label.trim() && f.value.trim())
          .map((f) => `${f.label}: ${f.value}`),
      ]
        .filter(Boolean)
        .join(" | ")
    );
  }
  for (const s of [...resume.data.sections]
    .filter((s) => s.visible && s.type !== "basic_info")
    .sort((a, b) => a.order - b.order)) {
    const blocks = [...s.blocks]
      .filter((b) => b.visible && blockHasContent(b))
      .sort((a, b) => a.order - b.order);
    if (!blocks.length) continue;
    push(s.title, "heading");
    for (const b of blocks) {
      push(
        [b.title, b.subtitle, ...(b.subtitles ?? [])]
          .filter(Boolean)
          .join(" · "),
        "entry"
      );
      push(
        [[b.start_date, b.end_date].filter(Boolean).join(" – "), b.location]
          .filter(Boolean)
          .join(" | ")
      );
      push(b.description, "body", true);
      b.bullets.forEach((bullet, i) =>
        push(
          `${b.bullet_marks?.[i] === false ? "" : "• "}${bullet}`,
          "body",
          true
        )
      );
      push(b.skills.join(" · "));
      push(b.links.join(" | "));
    }
  }
  return result;
}

export const resumeText = (resume: Resume) =>
  resumeParagraphs(resume)
    .map((p) => p.text)
    .join("\n");

const xml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

interface ParsedImageData {
  ext: "png" | "jpeg" | "gif" | "webp";
  mime: string;
  bytes: Uint8Array;
}

function parseImageDataUrl(url?: string): ParsedImageData | null {
  if (!url) return null;
  const match = /^data:image\/(png|jpe?g|gif|webp);base64,([\s\S]+)$/i.exec(
    url.trim()
  );
  if (!match) return null;
  const rawSubtype = match[1].toLowerCase();
  const ext = rawSubtype === "jpg" ? "jpeg" : (rawSubtype as ParsedImageData["ext"]);
  const mime = `image/${ext}`;
  const b64 = match[2].replace(/\s+/g, "");
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ext, mime, bytes };
  } catch {
    return null;
  }
}

function buildDocxRuns(runs: InlineRun[], size: number, defaultColor?: string): string {
  return runs
    .map((r) => {
      if (r.lineBreak) {
        return `<w:r><w:br/></w:r>`;
      }
      const colorHex = r.color ?? defaultColor;
      const colorTag = colorHex ? `<w:color w:val="${colorHex}"/>` : "";
      const bTag = r.bold ? "<w:b/>" : "";
      const iTag = r.italic ? "<w:i/>" : "";
      return `<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/><w:sz w:val="${size}"/>${bTag}${iTag}${colorTag}</w:rPr><w:t xml:space="preserve">${xml(
        r.text
      )}</w:t></w:r>`;
    })
    .join("");
}

function buildDocxParagraph(
  runs: InlineRun[],
  opts: {
    size: number;
    spacingAfter?: number;
    spacingBefore?: number;
    keepNext?: boolean;
    bottomBorderColor?: string;
    defaultColor?: string;
  }
): string {
  if (runs.length === 0) return "";
  const keep = opts.keepNext ? "<w:keepNext/>" : "";
  const border = opts.bottomBorderColor
    ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="4" w:color="${opts.bottomBorderColor}"/></w:pBdr>`
    : "";
  const before = opts.spacingBefore ? ` w:before="${opts.spacingBefore}"` : "";
  const after = opts.spacingAfter ?? 80;
  return `<w:p><w:pPr>${keep}${border}<w:spacing${before} w:after="${after}" w:line="260" w:lineRule="auto"/></w:pPr>${buildDocxRuns(
    runs,
    opts.size,
    opts.defaultColor
  )}</w:p>`;
}

function buildAvatarDrawingXml(relId: string, scale: number, align: "left" | "right" = "left"): string {
  const clamped = Math.min(2, Math.max(0.5, scale));
  const cx = Math.round(90 * clamped * 9525);
  const cy = Math.round(126 * clamped * 9525);
  return `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:after="60"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Avatar"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="avatar"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/** 浏览器端将任意比例的头像裁剪为标准 1 寸比例（90:126 object-cover），保证 DOCX 与预览比例一致 */
async function cropAvatarForDocx(url?: string, scale = 1): Promise<string | undefined> {
  if (!url || typeof document === "undefined" || typeof Image === "undefined") return url;
  const img = await loadCanvasImage(url);
  if (!img || !img.naturalWidth || !img.naturalHeight) return url;
  const clamped = Math.min(2, Math.max(0.5, scale));
  const targetW = Math.round(180 * clamped);
  const targetH = Math.round(252 * clamped);
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return url;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const targetRatio = targetW / targetH;
  const srcRatio = iw / ih;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (srcRatio > targetRatio) {
    sw = ih * targetRatio;
    sx = (iw - sw) / 2;
  } else if (srcRatio < targetRatio) {
    sh = iw / targetRatio;
    sy = (ih - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", 0.92);
}

const BORDERLESS_TBL_BORDERS =
  '<w:tblBorders><w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:bottom w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideH w:val="none" w:sz="0" w:space="0" w:color="auto"/><w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/></w:tblBorders>';

function renderDocxSection(
  section: Section,
  resume: Resume,
  primaryHex: string,
  bodySize: number
): string {
  const blocks = [...section.blocks]
    .filter((b) => b.visible && blockHasContent(b))
    .sort((a, b) => a.order - b.order);
  if (!blocks.length) return "";

  const defaultBullet =
    resume.theme.bullet_style ??
    (resume.template_id === "classic_ats" ? "disc" : "diamond");
  const bulletStyle = resolveBulletStyle(section.bullet_style, defaultBullet);

  const parts: string[] = [];
  parts.push(
    buildDocxParagraph(parseInlineRuns(section.title, { bold: true, color: primaryHex }), {
      size: 25,
      spacingBefore: 120,
      spacingAfter: 100,
      keepNext: true,
      bottomBorderColor: primaryHex,
      defaultColor: primaryHex,
    })
  );

  for (const b of blocks) {
    const entryHeader = [b.title, b.subtitle, ...(b.subtitles ?? [])]
      .filter(Boolean)
      .join(" · ");
    if (entryHeader.trim()) {
      parts.push(
        buildDocxParagraph(parseInlineRuns(entryHeader, { bold: true }), {
          size: bodySize,
          spacingAfter: 40,
          keepNext: true,
        })
      );
    }
    const metaLine = [
      [b.start_date, b.end_date].filter(Boolean).join(" – "),
      b.location,
    ]
      .filter(Boolean)
      .join(" | ");
    if (metaLine.trim()) {
      parts.push(
        buildDocxParagraph(parseInlineRuns(metaLine, { color: "64716C" }), {
          size: Math.max(16, bodySize - 2),
          spacingAfter: 40,
        })
      );
    }
    if (b.description.trim()) {
      parts.push(
        buildDocxParagraph(parseInlineRuns(b.description), {
          size: bodySize,
          spacingAfter: 60,
        })
      );
    }
    let seq = 0;
    b.bullets.forEach((bullet, i) => {
      if (!bullet.trim()) return;
      const marked = b.bullet_marks?.[i] !== false;
      const runs: InlineRun[] = [];
      if (marked) {
        seq += 1;
        runs.push({
          text: formatBulletPrefix(bulletStyle, seq),
          bold: bulletStyle === "ordered",
          color: primaryHex,
        });
      }
      runs.push(...parseInlineRuns(bullet));
      parts.push(
        buildDocxParagraph(runs, {
          size: bodySize,
          spacingAfter: 50,
        })
      );
    });
    if (b.skills.length > 0) {
      parts.push(
        buildDocxParagraph(parseInlineRuns(b.skills.join(" · ")), {
          size: bodySize,
          spacingAfter: 60,
        })
      );
    }
    if (b.links.length > 0) {
      parts.push(
        buildDocxParagraph(parseInlineRuns(b.links.join(" | "), { color: primaryHex }), {
          size: bodySize,
          spacingAfter: 60,
        })
      );
    }
  }
  return parts.join("");
}

function splitTwoColumnSections(sections: Section[]): {
  left: Section[];
  right: Section[];
} {
  const sidebarTypes = new Set(["summary", "education", "skills", "certifications"]);
  const left: Section[] = [];
  const right: Section[] = [];
  for (const s of sections) {
    if (sidebarTypes.has(s.type)) left.push(s);
    else right.push(s);
  }
  if (sections.length >= 2) {
    if (left.length === 0) {
      left.push(right.shift()!);
    } else if (right.length === 0) {
      right.push(left.pop()!);
    }
  }
  return { left, right };
}

/** Produce a high-fidelity editable Word document (.docx) entirely in the browser. */
export async function generateDocx(input: Resume): Promise<ArrayBuffer> {
  const { default: JSZip } = await import("jszip");
  const resume = localizedResume(input);
  const zip = new JSZip();

  const primaryHex = normalizeHexColor(resume.theme.primary_color, "4F46E5");
  const bodySize = Math.round((resume.theme.font_size || 14) * 1.5);
  const croppedAvatarUrl = await cropAvatarForDocx(
    resume.data.avatar_url,
    resume.theme.avatar_scale ?? 1
  );
  const avatar = parseImageDataUrl(croppedAvatarUrl);

  const headerParagraphs: string[] = [];
  const basicVisible =
    resume.data.sections.find((s) => s.type === "basic_info")?.visible !== false;
  if (basicVisible) {
    const info = resume.data.basic_info;
    if (info.name.trim()) {
      headerParagraphs.push(
        buildDocxParagraph(parseInlineRuns(info.name, { bold: true, color: primaryHex }), {
          size: 36,
          spacingAfter: 60,
          defaultColor: primaryHex,
        })
      );
    }
    if (info.title.trim()) {
      headerParagraphs.push(
        buildDocxParagraph(parseInlineRuns(info.title, { bold: true, color: primaryHex }), {
          size: Math.max(20, bodySize + 2),
          spacingAfter: 60,
          defaultColor: primaryHex,
        })
      );
    }
    const contacts = [
      info.email,
      info.phone,
      info.location,
      info.website,
      ...(info.custom_fields ?? [])
        .filter((f) => f.label.trim() && f.value.trim())
        .map((f) => `${f.label}: ${f.value}`),
    ]
      .filter(Boolean)
      .join(" | ");
    if (contacts.trim()) {
      headerParagraphs.push(
        buildDocxParagraph(parseInlineRuns(contacts, { color: "555555" }), {
          size: Math.max(16, bodySize - 2),
          spacingAfter: 120,
        })
      );
    }
  }

  let headerXml = headerParagraphs.join("");
  if (avatar && basicVisible) {
    const avatarScale = resume.theme.avatar_scale ?? 1;
    const avatarXml = buildAvatarDrawingXml("rIdAvatar", avatarScale, "left");
    const avatarColW = Math.min(3400, Math.round(1800 * Math.min(2, Math.max(0.5, avatarScale))));
    const textColW = 10466 - avatarColW;
    headerXml = `<w:tbl><w:tblPr><w:tblW w:w="10466" w:type="dxa"/>${BORDERLESS_TBL_BORDERS}<w:tblCellMar><w:right w:w="180" type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="${avatarColW}"/><w:gridCol w:w="${textColW}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${avatarColW}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${avatarXml}</w:tc><w:tc><w:tcPr><w:tcW w:w="${textColW}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${
      headerXml || "<w:p/>"
    }</w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>`;
  }

  const visibleBodySections = [...resume.data.sections]
    .filter(
      (s) =>
        s.visible &&
        s.type !== "basic_info" &&
        s.blocks.some((b) => b.visible && blockHasContent(b))
    )
    .sort((a, b) => a.order - b.order);

  let bodyXml = "";
  if (isTwoColumnTemplate(resume.template_id) && visibleBodySections.length > 0) {
    const { left, right } = splitTwoColumnSections(visibleBodySections);
    const leftXml = left
      .map((s) => renderDocxSection(s, resume, primaryHex, bodySize))
      .join("");
    const rightXml = right
      .map((s) => renderDocxSection(s, resume, primaryHex, bodySize))
      .join("");
    bodyXml = `<w:tbl><w:tblPr><w:tblW w:w="10466" w:type="dxa"/>${BORDERLESS_TBL_BORDERS}<w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid><w:gridCol w:w="3663"/><w:gridCol w:w="6803"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="3663" w:type="dxa"/></w:tcPr>${
      leftXml || "<w:p/>"
    }</w:tc><w:tc><w:tcPr><w:tcW w:w="6803" w:type="dxa"/></w:tcPr>${
      rightXml || "<w:p/>"
    }</w:tc></w:tr></w:tbl>`;
  } else {
    bodyXml = visibleBodySections
      .map((s) => renderDocxSection(s, resume, primaryHex, bodySize))
      .join("");
  }

  const mediaTypeDefault = avatar
    ? `<Default Extension="${avatar.ext}" ContentType="${avatar.mime}"/>`
    : "";
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mediaTypeDefault}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
  );

  if (avatar) {
    zip.file(`word/media/avatar.${avatar.ext}`, avatar.bytes);
    zip.file(
      "word/_rels/document.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdAvatar" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/avatar.${avatar.ext}"/></Relationships>`
    );
  }

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${headerXml}${bodyXml}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`
  );
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

/* ------------------------------------------------------------------
 * Direct/Silent PDF Generator (no window.print() dependency)
 * ------------------------------------------------------------------ */

function hexToRgbUnit(hex: string): [number, number, number] {
  const n = parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function pdfEscape(text: string): string {
  // Strip characters outside WinAnsi printable range for Type1 Helvetica fallback
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x28 || code === 0x29 || code === 0x5c) {
      out += "\\" + text[i];
    } else if (code >= 0x20 && code <= 0x7e) {
      out += text[i];
    } else if (code === 0x2013 || code === 0x2014) {
      out += "-";
    } else if (code === 0x00b7 || code === 0x2022 || code === 0x25cf || code === 0x25c6) {
      out += "*";
    } else if (code === 0x2192) {
      out += "->";
    } else if (code === 0x2713) {
      out += "v";
    } else if (code >= 0xa0 && code <= 0xff) {
      out += text[i];
    } else {
      out += " ";
    }
  }
  return out;
}

function assemblePdf(objects: Array<string | Uint8Array>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;

  const pushBytes = (b: Uint8Array) => {
    chunks.push(b);
    length += b.length;
  };
  const pushStr = (s: string) => pushBytes(encoder.encode(s));

  pushStr("%PDF-1.4\n");
  pushBytes(new Uint8Array([0x25, 0xff, 0xff, 0xff, 0xff, 0x0a]));

  for (let i = 0; i < objects.length; i++) {
    offsets.push(length);
    pushStr(`${i + 1} 0 obj\n`);
    const obj = objects[i];
    if (typeof obj === "string") {
      pushStr(obj);
    } else {
      pushBytes(obj);
    }
    pushStr("\nendobj\n");
  }

  const xrefOffset = length;
  pushStr(`xref\n0 ${objects.length + 1}\n`);
  pushStr("0000000000 65535 f \n");
  for (const off of offsets) {
    pushStr(`${String(off).padStart(10, "0")} 00000 n \n`);
  }
  pushStr(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );

  const out = new Uint8Array(length);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

function buildVectorPdf(pages: Resume[]): Uint8Array {
  // Objects: 1=Catalog, 2=Pages, 3=F1(Helvetica), 4=F2(Bold), 5=F3(Oblique), 6=F4(BoldOblique)
  const objects: Array<string | Uint8Array> = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // placeholder for Pages
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique >>",
  ];

  const pageIds: number[] = [];
  for (const rawResume of pages) {
    const resume = localizedResume(rawResume);
    const primaryHex = normalizeHexColor(resume.theme.primary_color, "4F46E5");
    const [pr, pg, pb] = hexToRgbUnit(primaryHex);
    const cmds: string[] = [];
    const pageW = 595.28;
    const pageH = 841.89;
    const margin = 42;
    let y = pageH - margin;

    const drawText = (
      text: string,
      x: number,
      yy: number,
      font: "F1" | "F2" | "F3" | "F4",
      size: number,
      rgb: [number, number, number] = [0.12, 0.14, 0.16]
    ) => {
      const escaped = pdfEscape(text);
      if (!escaped.trim()) return;
      cmds.push(
        `BT /${font} ${size} Tf ${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(
          3
        )} rg ${x.toFixed(2)} ${yy.toFixed(2)} Td (${escaped}) Tj ET`
      );
    };

    const drawRuns = (
      runs: InlineRun[],
      x: number,
      maxW: number,
      size: number,
      lineH: number
    ) => {
      let cx = x;
      const charW = size * 0.5;
      for (const r of runs) {
        if (r.lineBreak) {
          y -= lineH;
          cx = x;
          continue;
        }
        const font: "F1" | "F2" | "F3" | "F4" =
          r.bold && r.italic ? "F4" : r.bold ? "F2" : r.italic ? "F3" : "F1";
        const rgb: [number, number, number] = r.color
          ? hexToRgbUnit(r.color)
          : [0.15, 0.18, 0.2];
        const words = r.text.split(/(\s+)/);
        let lineBuf = "";
        let lineStartX = cx;
        const flushBuf = () => {
          if (lineBuf) {
            drawText(lineBuf, lineStartX, y, font, size, rgb);
            lineBuf = "";
          }
        };
        for (const w of words) {
          if (!w) continue;
          const wPx = w.length * charW;
          if (cx + wPx > x + maxW && cx > x) {
            flushBuf();
            y -= lineH;
            cx = x;
            lineStartX = x;
            if (!w.trim()) continue;
          }
          lineBuf += w;
          cx += wPx;
        }
        flushBuf();
      }
      y -= lineH;
    };

    const basicVisible =
      resume.data.sections.find((s) => s.type === "basic_info")?.visible !== false;
    if (basicVisible) {
      const info = resume.data.basic_info;
      if (info.name.trim()) {
        drawText(plainText(info.name), margin, y, "F2", 20, [pr, pg, pb]);
        y -= 24;
      }
      if (info.title.trim()) {
        drawText(plainText(info.title), margin, y, "F2", 12, [pr, pg, pb]);
        y -= 16;
      }
      const contacts = [
        info.email,
        info.phone,
        info.location,
        info.website,
        ...(info.custom_fields ?? [])
          .filter((f) => f.label.trim() && f.value.trim())
          .map((f) => `${f.label}: ${f.value}`),
      ]
        .filter(Boolean)
        .join(" | ");
      if (contacts.trim()) {
        drawText(contacts, margin, y, "F1", 9.5, [0.35, 0.38, 0.4]);
        y -= 18;
      }
    }

    const bodySections = [...resume.data.sections]
      .filter(
        (s) =>
          s.visible &&
          s.type !== "basic_info" &&
          s.blocks.some((b) => b.visible && blockHasContent(b))
      )
      .sort((a, b) => a.order - b.order);

    const renderSectionAt = (s: Section, x: number, colW: number) => {
      if (y < margin + 30) return;
      drawText(s.title, x, y, "F2", 12, [pr, pg, pb]);
      y -= 5;
      cmds.push(
        `${pr.toFixed(3)} ${pg.toFixed(3)} ${pb.toFixed(3)} rg ${x.toFixed(2)} ${y.toFixed(
          2
        )} ${colW.toFixed(2)} 1 re f`
      );
      y -= 13;

      const defaultBullet =
        resume.theme.bullet_style ??
        (resume.template_id === "classic_ats" ? "disc" : "diamond");
      const bulletStyle = resolveBulletStyle(s.bullet_style, defaultBullet);
      const blocks = [...s.blocks]
        .filter((b) => b.visible && blockHasContent(b))
        .sort((a, b) => a.order - b.order);

      for (const b of blocks) {
        if (y < margin + 20) break;
        const header = [b.title, b.subtitle, ...(b.subtitles ?? [])]
          .filter(Boolean)
          .join(" · ");
        if (header.trim()) {
          drawRuns(parseInlineRuns(header, { bold: true }), x, colW, 10.5, 14);
        }
        const meta = [
          [b.start_date, b.end_date].filter(Boolean).join(" - "),
          b.location,
        ]
          .filter(Boolean)
          .join(" | ");
        if (meta.trim()) {
          drawText(meta, x, y, "F1", 8.8, [0.4, 0.44, 0.42]);
          y -= 12;
        }
        if (b.description.trim()) {
          drawRuns(parseInlineRuns(b.description), x, colW, 9.8, 13);
        }
        let seq = 0;
        b.bullets.forEach((bullet, idx) => {
          if (!bullet.trim() || y < margin + 15) return;
          const marked = b.bullet_marks?.[idx] !== false;
          const runs: InlineRun[] = [];
          if (marked) {
            seq += 1;
            runs.push({
              text: formatBulletPrefix(bulletStyle, seq),
              bold: bulletStyle === "ordered",
              color: primaryHex,
            });
          }
          runs.push(...parseInlineRuns(bullet));
          drawRuns(runs, x, colW, 9.5, 13);
        });
        if (b.skills.length > 0) {
          drawRuns(parseInlineRuns(b.skills.join(" · ")), x, colW, 9.2, 13);
        }
        y -= 4;
      }
      y -= 4;
    };

    if (isTwoColumnTemplate(resume.template_id) && bodySections.length > 0) {
      const { left, right } = splitTwoColumnSections(bodySections);
      const startY = y;
      const gap = 18;
      const leftW = (pageW - margin * 2 - gap) * 0.35;
      const rightW = pageW - margin * 2 - gap - leftW;
      for (const s of left) renderSectionAt(s, margin, leftW);
      y = startY;
      for (const s of right) renderSectionAt(s, margin + leftW + gap, rightW);
    } else {
      for (const s of bodySections) {
        renderSectionAt(s, margin, pageW - margin * 2);
      }
    }

    const streamStr = cmds.join("\n");
    const streamBytes = new TextEncoder().encode(streamStr);
    const contentId = objects.length + 1;
    objects.push(
      `<< /Length ${streamBytes.length} >>\nstream\n${streamStr}\nendstream`
    );
    const pageId = objects.length + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    pageIds.push(pageId);
  }

  objects[1] = `<< /Type /Pages /Kids [${pageIds
    .map((id) => `${id} 0 R`)
    .join(" ")}] /Count ${pageIds.length} >>`;

  return assemblePdf(objects);
}

function tokenizeForWrap(text: string): string[] {
  return text.match(/[A-Za-z0-9_+#./%&@'-]+|\s+|[\s\S]/g) ?? [];
}

function drawSectionIconOnCanvas(
  ctx: CanvasRenderingContext2D,
  type: Section["type"],
  x: number,
  y: number,
  size: number,
  color: string
) {
  ctx.save();
  ctx.translate(x, y);
  const s = size / 24;
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.1;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (type === "summary") {
    ctx.beginPath();
    ctx.arc(12, 8, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, 20);
    ctx.bezierCurveTo(5, 16, 8.2, 14, 12, 14);
    ctx.bezierCurveTo(15.8, 14, 19, 16, 19, 20);
    ctx.stroke();
  } else if (type === "work_experience") {
    drawRoundedRect(ctx, 3, 7, 18, 13, 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(8, 7);
    ctx.lineTo(8, 5);
    ctx.quadraticCurveTo(8, 3.5, 9.5, 3.5);
    ctx.lineTo(14.5, 3.5);
    ctx.quadraticCurveTo(16, 3.5, 16, 5);
    ctx.lineTo(16, 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 12);
    ctx.lineTo(21, 12);
    ctx.stroke();
  } else if (type === "project_experience") {
    ctx.beginPath();
    ctx.moveTo(4, 6);
    ctx.lineTo(10, 6);
    ctx.lineTo(12, 8.5);
    ctx.lineTo(20, 8.5);
    ctx.quadraticCurveTo(21, 8.5, 21, 9.5);
    ctx.lineTo(21, 18.5);
    ctx.quadraticCurveTo(21, 19.5, 20, 19.5);
    ctx.lineTo(4, 19.5);
    ctx.quadraticCurveTo(3, 19.5, 3, 18.5);
    ctx.lineTo(3, 7);
    ctx.quadraticCurveTo(3, 6, 4, 6);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, 14, 1.5, 0, Math.PI * 2);
    ctx.arc(15, 14, 1.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === "education") {
    ctx.beginPath();
    ctx.moveTo(12, 4);
    ctx.lineTo(22, 9.5);
    ctx.lineTo(12, 15);
    ctx.lineTo(2, 9.5);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, 12);
    ctx.lineTo(6, 17);
    ctx.quadraticCurveTo(12, 20.5, 18, 17);
    ctx.lineTo(18, 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(21, 10);
    ctx.lineTo(21, 16);
    ctx.stroke();
  } else if (type === "skills") {
    ctx.beginPath();
    ctx.moveTo(14.7, 6.3);
    ctx.arc(12, 9, 4.2, -0.4, Math.PI * 1.15);
    ctx.lineTo(5.2, 18.8);
    ctx.arc(6.5, 17.5, 1.8, Math.PI * 0.75, -Math.PI * 0.25, true);
    ctx.lineTo(12.2, 11.8);
    ctx.stroke();
  } else if (type === "certifications") {
    ctx.beginPath();
    ctx.arc(12, 9.5, 5.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(9, 14.5);
    ctx.lineTo(7.5, 21);
    ctx.lineTo(12, 18.5);
    ctx.lineTo(16.5, 21);
    ctx.lineTo(15, 14.5);
    ctx.stroke();
  } else if (type === "custom") {
    ctx.beginPath();
    ctx.moveTo(12, 3.5);
    ctx.lineTo(21, 8);
    ctx.lineTo(12, 12.5);
    ctx.lineTo(3, 8);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 12.5);
    ctx.lineTo(12, 17);
    ctx.lineTo(21, 12.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3, 17);
    ctx.lineTo(12, 21.5);
    ctx.lineTo(21, 17);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(12, 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

async function loadCanvasImage(url?: string): Promise<HTMLImageElement | null> {
  if (!url || typeof Image === "undefined") return null;
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
  } catch {
    return null;
  }
}

async function renderCanvasPageToJpeg(resume: Resume): Promise<Uint8Array | null> {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const W = 1588;
  const H = 2246;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const prep = localizedResume(resume);
  const tpl = prep.template_id;
  const isATS = tpl === "classic_ats";
  const isLatex = tpl === "latex_minimal";
  const isCampus = tpl === "campus_compact";
  const isSwiss = tpl === "swiss_grid";
  const isSidebar = tpl === "executive_sidebar";
  const isAcademic = tpl === "academic_photo";

  const rawPrimary = normalizeHexColor(prep.theme.primary_color, "4F46E5");
  const primaryHex = isATS || isLatex ? "111111" : rawPrimary;
  const primaryCss = `#${primaryHex}`;

  const effectiveDensity =
    prep.theme.density ?? (isCampus || isLatex ? "compact" : "medium");
  const effectiveFont =
    prep.theme.font_family ?? (isLatex ? "serif" : "sans");
  const fontStackCss = fontStack(effectiveFont);
  const headerLayout = prep.theme.header_layout ?? "row";

  const [avatarImg, badgeImg] = await Promise.all([
    isAcademic ? loadCanvasImage(prep.data.avatar_url) : Promise.resolve(null),
    isAcademic ? loadCanvasImage(prep.data.school_badge_url) : Promise.resolve(null),
  ]);

  const densitySpec = {
    compact: { secGap: 6.7, entryGap: 3.2, bulletGap: 1.3, lh: 1.32, headGap: 4.0, padX: 37.6, padY: 25.6 },
    medium: { secGap: 9.0, entryGap: 4.2, bulletGap: 1.9, lh: 1.38, headGap: 5.6, padX: 40.8, padY: 29.6 },
    loose: { secGap: 23.2, entryGap: 13.6, bulletGap: 6.7, lh: 1.75, headGap: 15.2, padX: 52.8, padY: 49.6 },
  }[effectiveDensity];

  const renderPass = (scale: number, dryRun: boolean): number => {
    const padX = densitySpec.padX * scale;
    const padY = densitySpec.padY * scale;
    const secGap = densitySpec.secGap * scale;
    const entryGap = densitySpec.entryGap * scale;
    const bulletGap = densitySpec.bulletGap * scale;
    const headGap = densitySpec.headGap * scale;
    const lh = densitySpec.lh;
    const baseFs = (prep.theme.font_size || 14) * scale;

    if (!dryRun) {
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = "alphabetic";
    }

    const setFont = (sizePx: number, bold?: boolean, italic?: boolean) => {
      ctx.font = `${italic ? "italic " : ""}${bold ? "700 " : "400 "}${Math.round(
        sizePx
      )}px ${fontStackCss}`;
    };

    const drawWrappedRuns = (
      runs: InlineRun[],
      x: number,
      maxW: number,
      sizePx: number,
      lineH: number,
      startY: number,
      firstLineOffset = 0
    ): number => {
      let curY = startY + sizePx * 0.88;
      let cx = x + firstLineOffset;
      let hasDrawn = false;
      for (const r of runs) {
        if (r.lineBreak) {
          curY += lineH;
          cx = x;
          continue;
        }
        setFont(sizePx, r.bold, r.italic);
        if (!dryRun) ctx.fillStyle = r.color ? `#${r.color}` : isATS || isLatex ? "#1A1A1A" : "#222A28";
        const tokens = tokenizeForWrap(r.text);
        for (const tok of tokens) {
          const isSpace = /^\s+$/.test(tok);
          if (isSpace && cx === x) continue;
          const w = ctx.measureText(tok).width;
          if (cx + w > x + maxW && cx > x) {
            curY += lineH;
            cx = x;
            if (isSpace) continue;
          }
          if (w > maxW) {
            for (const ch of tok) {
              const cw = ctx.measureText(ch).width;
              if (cx + cw > x + maxW && cx > x) {
                curY += lineH;
                cx = x;
              }
              if (!dryRun) ctx.fillText(ch, cx, curY);
              cx += cw;
              hasDrawn = true;
            }
          } else {
            if (!dryRun) ctx.fillText(tok, cx, curY);
            cx += w;
            hasDrawn = true;
          }
        }
      }
      return hasDrawn ? curY + (lineH - sizePx * 0.88) : startY;
    };

    const drawCenteredText = (
      text: string,
      centerX: number,
      maxW: number,
      sizePx: number,
      lineH: number,
      startY: number,
      opts: { bold?: boolean; italic?: boolean; color?: string } = {}
    ): number => {
      const clean = plainText(text).trim();
      if (!clean) return startY;
      setFont(sizePx, opts.bold, opts.italic);
      if (!dryRun) ctx.fillStyle = opts.color ?? "#111111";
      const tokens = tokenizeForWrap(clean);
      const lines: string[] = [];
      let cur = "";
      for (const tok of tokens) {
        const next = cur + tok;
        if (ctx.measureText(next).width > maxW && cur.trim()) {
          lines.push(cur.trim());
          cur = tok.trimStart();
        } else {
          cur = next;
        }
      }
      if (cur.trim()) lines.push(cur.trim());
      let curY = startY + sizePx * 0.88;
      for (const ln of lines) {
        const lw = ctx.measureText(ln).width;
        if (!dryRun) ctx.fillText(ln, centerX - lw / 2, curY);
        curY += lineH;
      }
      return curY - sizePx * 0.88;
    };

    const drawSkillChips = (
      skills: string[],
      x: number,
      maxW: number,
      startY: number,
      pillRound: boolean
    ): number => {
      const chipFs = baseFs * (pillRound ? 0.76 : 0.78);
      setFont(chipFs, true, false);
      const padH = (pillRound ? 8 : 6) * scale;
      const chipH = chipFs * 1.48;
      const gapX = 4.5 * scale;
      const gapY = 4.5 * scale;
      let cx = x;
      let curY = startY;
      for (const sk of skills) {
        const label = plainText(sk).trim();
        if (!label) continue;
        const tw = ctx.measureText(label).width;
        const cw = Math.min(maxW, tw + padH * 2);
        if (cx + cw > x + maxW && cx > x) {
          cx = x;
          curY += chipH + gapY;
        }
        if (!dryRun) {
          drawRoundedRect(ctx, cx, curY, cw, chipH, pillRound ? chipH / 2 : 3 * scale);
          ctx.fillStyle = `#${primaryHex}17`;
          ctx.fill();
          ctx.strokeStyle = `#${primaryHex}33`;
          ctx.lineWidth = Math.max(1, 0.8 * scale);
          ctx.stroke();
          ctx.fillStyle = primaryCss;
          ctx.fillText(label, cx + padH, curY + chipFs * 1.06);
        }
        cx += cw + gapX;
      }
      return curY + chipH;
    };

    let y = padY;
    const contentW = W - padX * 2;
    const basicSection = prep.data.sections.find((s) => s.type === "basic_info");
    const basicVisible = basicSection?.visible ?? true;
    const info = prep.data.basic_info;
    const sepChar = prep.locale === "en" ? ": " : "：";
    const contactList = [
      info.email,
      info.phone,
      info.location,
      info.website,
      ...(info.custom_fields ?? [])
        .filter((f) => f.label?.trim() && f.value?.trim())
        .map((f) => `${f.label.trim()}${sepChar}${f.value.trim()}`),
    ].filter(Boolean);

    // ==================== 1. HEADER RENDERING ====================
    if (basicVisible && (info.name || info.title || contactList.length > 0)) {
      if (isLatex || isATS) {
        const nameFs = baseFs * (isLatex ? 2.05 : 2.1);
        y = drawCenteredText(info.name || "Untitled", W / 2, contentW, nameFs, nameFs * 1.22, y, {
          bold: true,
          color: "#111111",
        });
        if (info.title.trim()) {
          y += 2 * scale;
          const titleFs = baseFs * (isLatex ? 0.96 : 1.05);
          y = drawCenteredText(info.title, W / 2, contentW, titleFs, titleFs * 1.32, y, {
            italic: isLatex,
            bold: !isLatex,
            color: "#333333",
          });
        }
        if (contactList.length > 0) {
          y += 4 * scale;
          const cFs = baseFs * 0.84;
          y = drawCenteredText(contactList.join("  |  "), W / 2, contentW, cFs, cFs * 1.35, y, {
            color: "#333333",
          });
        }
        y += secGap;
      } else if (isSwiss) {
        const leftColW = 116 * scale;
        const colGap = 20 * scale;
        const rightX = padX + leftColW + colGap;
        const rightW = contentW - leftColW - colGap;
        const nameFs = baseFs * 2.2;
        setFont(nameFs, true, false);
        const nameStr = plainText(info.name || "未命名");
        const nameBaseline = y + nameFs * 0.88;
        if (!dryRun) {
          ctx.fillStyle = "#1B1C1F";
          ctx.fillText(nameStr, rightX, nameBaseline);
          // 左侧顶部胶囊色块
          drawRoundedRect(ctx, padX, nameBaseline - 8 * scale, 40 * scale, 6 * scale, 3 * scale);
          ctx.fillStyle = primaryCss;
          ctx.fill();
        }
        if (info.title.trim()) {
          const tFs = baseFs * 1.02;
          setFont(tFs, true, false);
          const tStr = plainText(info.title);
          const tw = ctx.measureText(tStr).width;
          if (!dryRun) {
            ctx.fillStyle = primaryCss;
            ctx.fillText(tStr, Math.max(rightX, padX + contentW - tw), nameBaseline);
          }
        }
        y += nameFs * 1.18;
        if (contactList.length > 0) {
          y += 4 * scale;
          y = drawWrappedRuns(
            parseInlineRuns(contactList.join("  ·  "), { color: "64716C" }),
            rightX,
            rightW,
            baseFs * 0.82,
            baseFs * 1.28,
            y
          );
        }
        y += headGap;
        if (!dryRun) {
          ctx.fillStyle = "#1B1C1F";
          ctx.fillRect(padX, y, contentW, 2 * scale);
        }
        y += secGap;
      } else if (isSidebar) {
        const cardPadX = 20 * scale;
        const cardPadY = 15 * scale;
        const innerX = padX + cardPadX;
        const innerW = contentW - cardPadX * 2;
        const nameFs = baseFs * 2.05;
        let innerY = y + cardPadY;
        const nameBase = innerY + nameFs * 0.88;
        let contactsEndY = innerY + nameFs * 1.15;
        if (contactList.length > 0) {
          contactsEndY = drawWrappedRuns(
            parseInlineRuns(contactList.join("  ·  "), { color: "475569" }),
            innerX,
            innerW,
            baseFs * 0.82,
            baseFs * 1.28,
            contactsEndY + 4 * scale
          );
        }
        const boxH = contactsEndY - y + cardPadY;
        if (!dryRun) {
          drawRoundedRect(ctx, padX, y, contentW, boxH, 12 * scale);
          ctx.fillStyle = `#${primaryHex}0D`;
          ctx.fill();
          ctx.fillStyle = primaryCss;
          ctx.fillRect(padX, y + 4 * scale, 4 * scale, boxH - 8 * scale);
          setFont(nameFs, true, false);
          ctx.fillStyle = "#101817";
          ctx.fillText(plainText(info.name || "未命名"), innerX, nameBase);
          if (info.title.trim()) {
            const tFs = baseFs * 1.04;
            setFont(tFs, true, false);
            const tStr = plainText(info.title);
            const tw = ctx.measureText(tStr).width;
            ctx.fillStyle = primaryCss;
            ctx.fillText(tStr, Math.max(innerX, padX + contentW - cardPadX - tw), nameBase);
          }
          if (contactList.length > 0) {
            drawWrappedRuns(
              parseInlineRuns(contactList.join("  ·  "), { color: "475569" }),
              innerX,
              innerW,
              baseFs * 0.82,
              baseFs * 1.28,
              innerY + nameFs * 1.15 + 4 * scale
            );
          }
        }
        y += boxH + secGap;
      } else if (isCampus) {
        const nameFs = baseFs * 1.95;
        setFont(nameFs, true, false);
        const nameStr = plainText(info.name || "未命名");
        const nameBase = y + nameFs * 0.88;
        if (!dryRun) {
          ctx.fillStyle = "#101817";
          ctx.fillText(nameStr, padX, nameBase);
        }
        const nameW = ctx.measureText(nameStr).width;
        const roleStr = plainText(info.title || prep.target?.job_title || "").trim();
        if (roleStr) {
          const rFs = baseFs * 0.86;
          setFont(rFs, true, false);
          const rw = ctx.measureText(roleStr).width;
          const pillW = rw + 20 * scale;
          const pillH = rFs * 1.55;
          const pillX = padX + nameW + 10 * scale;
          const pillY = nameBase - rFs * 1.1;
          if (!dryRun) {
            drawRoundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
            ctx.fillStyle = `#${primaryHex}15`;
            ctx.fill();
            ctx.strokeStyle = `#${primaryHex}33`;
            ctx.lineWidth = Math.max(1, 0.8 * scale);
            ctx.stroke();
            ctx.fillStyle = primaryCss;
            ctx.fillText(roleStr, pillX + 10 * scale, pillY + rFs * 1.1);
          }
        }
        y += nameFs * 1.18;
        if (contactList.length > 0) {
          y += 3 * scale;
          y = drawWrappedRuns(
            parseInlineRuns(contactList.join("  |  "), { color: "64716C" }),
            padX,
            contentW,
            baseFs * 0.82,
            baseFs * 1.26,
            y
          );
        }
        y += headGap;
        if (!dryRun) {
          ctx.fillStyle = `#${primaryHex}30`;
          ctx.fillRect(padX, y, contentW, Math.max(1, 1 * scale));
        }
        y += secGap;
      } else if (isAcademic) {
        const avScale = Math.min(2, Math.max(0.5, prep.theme.avatar_scale ?? 1));
        const avW = avatarImg ? Math.round(90 * scale * avScale) : 0;
        const avH = avatarImg ? Math.round(126 * scale * avScale) : 0;
        const badgeS = badgeImg ? Math.round(76 * scale) : 0;
        const leftX = padX + (avW ? avW + 20 * scale : 0);
        const midW = contentW - (avW ? avW + 20 * scale : 0) - (badgeS ? badgeS + 20 * scale : 0);
        const startHeaderY = y;
        if (!dryRun && avatarImg) {
          // 1:1 对齐预览端 object-cover + rounded-sm 裁切，绝不拉伸变形
          const iw = avatarImg.naturalWidth || avW;
          const ih = avatarImg.naturalHeight || avH;
          const targetRatio = avW / avH;
          const srcRatio = iw / ih;
          let sx = 0, sySrc = 0, sw = iw, sh = ih;
          if (srcRatio > targetRatio) {
            sw = ih * targetRatio;
            sx = (iw - sw) / 2;
          } else if (srcRatio < targetRatio) {
            sh = iw / targetRatio;
            sySrc = (ih - sh) / 2;
          }
          ctx.save();
          drawRoundedRect(ctx, padX, startHeaderY, avW, avH, 3 * scale);
          ctx.clip();
          ctx.drawImage(avatarImg, sx, sySrc, sw, sh, padX, startHeaderY, avW, avH);
          ctx.restore();
        }
        if (!dryRun && badgeImg) {
          // 1:1 对齐预览端 rounded-full + object-contain 居中缩放
          const bx = padX + contentW - badgeS;
          const by = startHeaderY + (Math.max(avH, badgeS) - badgeS) / 2;
          const iw = badgeImg.naturalWidth || badgeS;
          const ih = badgeImg.naturalHeight || badgeS;
          const fit = Math.min(badgeS / iw, badgeS / ih);
          const dw = iw * fit;
          const dh = ih * fit;
          ctx.save();
          drawRoundedRect(ctx, bx, by, badgeS, badgeS, badgeS / 2);
          ctx.clip();
          ctx.drawImage(
            badgeImg,
            bx + (badgeS - dw) / 2,
            by + (badgeS - dh) / 2,
            dw,
            dh
          );
          ctx.restore();
        }
        const nameFs = baseFs * 2.15;
        y = drawWrappedRuns(
          parseInlineRuns(info.name || "未命名", { bold: true, color: "101817" }),
          leftX,
          midW,
          nameFs,
          nameFs * 1.18,
          y
        );
        if (info.title.trim()) {
          y += 2 * scale;
          y = drawWrappedRuns(
            parseInlineRuns(info.title, { bold: true, color: primaryHex }),
            leftX,
            midW,
            baseFs * 1.05,
            baseFs * 1.35,
            y
          );
        }
        if (contactList.length > 0) {
          y += 4 * scale;
          y = drawWrappedRuns(
            parseInlineRuns(contactList.join("   |   "), { color: "64716C" }),
            leftX,
            midW,
            baseFs * 0.85,
            baseFs * 1.3,
            y
          );
        }
        y = Math.max(y, startHeaderY + avH, startHeaderY + badgeS) + secGap;
      } else {
        // modern_single_column (现代单栏：无右上角姓氏首字方块徽标，干净排版)
        const nameFs = baseFs * 2.25;
        y = drawWrappedRuns(
          parseInlineRuns(info.name || "未命名", { bold: true, color: "101817" }),
          padX,
          contentW,
          nameFs,
          nameFs * 1.16,
          y
        );
        if (info.title.trim()) {
          y += 2 * scale;
          y = drawWrappedRuns(
            parseInlineRuns(info.title, { bold: true, color: primaryHex }),
            padX,
            contentW,
            baseFs * 1.08,
            baseFs * 1.35,
            y
          );
        }
        if (contactList.length > 0) {
          y += headGap * 0.8;
          y = drawWrappedRuns(
            parseInlineRuns(contactList.join("   |   "), { color: "64716C" }),
            padX,
            contentW,
            baseFs * 0.85,
            baseFs * 1.3,
            y
          );
        }
        y += secGap;
      }
    }

    // ==================== 2. ENTRY & SECTION RENDERING ====================
    const drawEntryBlock = (
      b: Block,
      x: number,
      colW: number,
      curY: number,
      secBulletStyle: BulletStyleKey,
      entryHeaderMode: "row" | "stack"
    ): number => {
      let ey = curY;
      const dateStr = [b.start_date, b.end_date].filter(Boolean).join(" – ");
      const subParts = [b.subtitle, ...(b.subtitles ?? [])].filter(Boolean);

      if (isLatex) {
        if (b.type === "skill_group" && (b.skills.length > 0 || b.description.trim())) {
          const runs: InlineRun[] = [];
          if (b.title.trim()) {
            runs.push(...parseInlineRuns(`${b.title.trim()}:`, { bold: true, color: "111111" }));
            runs.push({ text: " ", color: "111111" });
          }
          const bodyStr = b.description.trim() || b.skills.join(", ");
          runs.push(...parseInlineRuns(bodyStr, { color: "1A1A1A" }));
          ey = drawWrappedRuns(runs, x, colW, baseFs * 0.91, baseFs * 0.91 * lh, ey);
          return ey + bulletGap * 1.1;
        }
        if (b.title.trim() || dateStr) {
          const tFs = baseFs * 1.01;
          let dateW = 0;
          if (dateStr) {
            setFont(baseFs * 0.86, false, false);
            dateW = ctx.measureText(dateStr).width;
            if (!dryRun) {
              ctx.fillStyle = "#222222";
              ctx.fillText(dateStr, x + colW - dateW, ey + tFs * 0.88);
            }
          }
          ey = drawWrappedRuns(
            parseInlineRuns(b.title, { bold: true, color: "111111" }),
            x,
            colW - (dateW ? dateW + 12 * scale : 0),
            tFs,
            tFs * 1.26,
            ey
          );
        }
        const subText = subParts.join(" · ");
        if (subText || b.location.trim()) {
          const sFs = baseFs * 0.91;
          let locW = 0;
          if (b.location.trim()) {
            setFont(baseFs * 0.9, false, true);
            locW = ctx.measureText(b.location.trim()).width;
            if (!dryRun) {
              ctx.fillStyle = "#333333";
              ctx.fillText(b.location.trim(), x + colW - locW, ey + sFs * 0.88);
            }
          }
          if (subText) {
            ey = drawWrappedRuns(
              parseInlineRuns(subText, { italic: true, color: "333333" }),
              x,
              colW - (locW ? locW + 12 * scale : 0),
              sFs,
              sFs * 1.26,
              ey
            );
          } else {
            ey += sFs * 1.26;
          }
        }
      } else {
        // 标准 / ATS / 学术 / 校招 / 瑞士 / 双栏条目头
        const hasTitleLine = b.title.trim() || subParts.length > 0;
        const titleRuns: InlineRun[] = [
          ...parseInlineRuns(b.title, { bold: true, color: isATS ? "111111" : "101817" }),
        ];
        for (const sp of subParts) {
          titleRuns.push({ text: " · ", color: "94A3B8" });
          titleRuns.push(...parseInlineRuns(sp, { color: isATS ? "333333" : "64716C" }));
        }
        if (hasTitleLine) {
          const tFs = baseFs * 1.01;
          if (entryHeaderMode !== "stack" && (dateStr || (isAcademic && b.location.trim()))) {
            const rightMeta = isAcademic
              ? [dateStr, b.location.trim()].filter(Boolean).join("  ")
              : dateStr;
            setFont(baseFs * 0.82, false, false);
            const rw = ctx.measureText(rightMeta).width;
            if (!dryRun) {
              ctx.fillStyle = isATS ? "#222222" : "#64716C";
              ctx.fillText(rightMeta, x + colW - rw, ey + tFs * 0.88);
            }
            ey = drawWrappedRuns(
              titleRuns,
              x,
              Math.max(colW * 0.5, colW - rw - 12 * scale),
              tFs,
              tFs * 1.28,
              ey
            );
          } else {
            ey = drawWrappedRuns(titleRuns, x, colW, tFs, tFs * 1.28, ey);
          }
        }
        if (entryHeaderMode === "stack" && (dateStr || b.location.trim())) {
          const metaStr = [dateStr, b.location.trim()].filter(Boolean).join("  ");
          ey = drawWrappedRuns(
            parseInlineRuns(metaStr, { color: "828E8A" }),
            x,
            colW,
            baseFs * 0.8,
            baseFs * 1.2,
            ey
          );
        } else if (!isAcademic && b.location.trim()) {
          ey = drawWrappedRuns(
            parseInlineRuns(b.location.trim(), { color: isATS ? "333333" : "828E8A" }),
            x,
            colW,
            baseFs * 0.82,
            baseFs * 1.2,
            ey
          );
        }
      }

      if (b.description.trim()) {
        ey += bulletGap;
        ey = drawWrappedRuns(
          parseInlineRuns(b.description, { color: isATS || isLatex ? "222222" : "2B3A36" }),
          x,
          colW,
          baseFs * 0.92,
          baseFs * 0.92 * lh,
          ey
        );
      }

      const validBullets = b.bullets.filter((bl) => bl.trim());
      if (validBullets.length > 0) {
        ey += entryGap * 0.65;
        let seq = 0;
        const bFs = baseFs * 0.92;
        const bLh = bFs * lh;
        const indent = 13 * scale;
        b.bullets.forEach((bullet, idx) => {
          if (!bullet.trim()) return;
          const marked = b.bullet_marks?.[idx] !== false;
          if (marked) {
            seq += 1;
            if (!dryRun) {
              const markerY = ey + bFs * 0.85;
              const markerColor = isATS || isLatex ? "#111111" : primaryCss;
              ctx.fillStyle = markerColor;
              if (secBulletStyle === "ordered") {
                setFont(bFs * 0.86, true, false);
                ctx.fillText(`${seq}.`, x, markerY);
              } else if (secBulletStyle === "disc" || isLatex || isATS) {
                ctx.beginPath();
                ctx.arc(x + 3 * scale, markerY - bFs * 0.28, 2.3 * scale, 0, Math.PI * 2);
                ctx.fill();
              } else if (secBulletStyle === "circle") {
                ctx.strokeStyle = markerColor;
                ctx.lineWidth = 1.4 * scale;
                ctx.beginPath();
                ctx.arc(x + 3 * scale, markerY - bFs * 0.28, 2.5 * scale, 0, Math.PI * 2);
                ctx.stroke();
              } else if (secBulletStyle === "square") {
                ctx.fillRect(x + 0.5 * scale, markerY - bFs * 0.48, 4.6 * scale, 4.6 * scale);
              } else {
                // diamond / arrow / check
                const cxDia = x + 3 * scale;
                const cyDia = markerY - bFs * 0.28;
                const rDia = 3 * scale;
                ctx.beginPath();
                ctx.moveTo(cxDia, cyDia - rDia);
                ctx.lineTo(cxDia + rDia, cyDia);
                ctx.lineTo(cxDia, cyDia + rDia);
                ctx.lineTo(cxDia - rDia, cyDia);
                ctx.closePath();
                ctx.fill();
              }
            }
          }
          ey = drawWrappedRuns(
            parseInlineRuns(bullet, { color: isATS || isLatex ? "222222" : "2B3A36" }),
            marked ? x + indent : x,
            marked ? colW - indent : colW,
            bFs,
            bLh,
            ey
          );
          ey += bulletGap;
        });
      }

      if (b.skills.length > 0 && !(isLatex && b.type === "skill_group")) {
        ey += entryGap * 0.6;
        if (isLatex) {
          const techRuns: InlineRun[] = [
            { text: "Tech: ", bold: true, color: "111111" },
            { text: b.skills.join(", "), color: "333333" },
          ];
          ey = drawWrappedRuns(techRuns, x, colW, baseFs * 0.86, baseFs * 0.86 * lh, ey);
        } else if (isATS) {
          ey = drawWrappedRuns(
            parseInlineRuns(b.skills.join("  ·  "), { color: "333333" }),
            x,
            colW,
            baseFs * 0.88,
            baseFs * 0.88 * lh,
            ey
          );
        } else {
          ey = drawSkillChips(b.skills, x, colW, ey, isCampus);
        }
      }

      return ey + entryGap;
    };

    const drawSectionBlock = (
      s: Section,
      x: number,
      colW: number,
      startY: number,
      entryHeaderMode: "row" | "stack" = headerLayout
    ): number => {
      const blocks = [...s.blocks]
        .filter((b) => b.visible && blockHasContent(b))
        .sort((a, b) => a.order - b.order);
      if (blocks.length === 0) return startY;

      let sy = startY;
      const defaultBullet: BulletStyleKey =
        prep.theme.bullet_style ??
        (isATS || isLatex || isCampus || isSwiss ? "disc" : "diamond");
      const secBulletStyle = resolveBulletStyle(s.bullet_style, defaultBullet);

      const isCampusEduBox = isCampus && s.type === "education";
      const boxPadX = isCampusEduBox ? 10 * scale : 0;
      const boxPadY = isCampusEduBox ? 8 * scale : 0;
      const innerX = x + boxPadX;
      const innerW = colW - boxPadX * 2;
      if (isCampusEduBox) sy += boxPadY;

      // Section Heading
      const hFs = baseFs * (isLatex ? 1.04 : isCampus ? 1.05 : 1.12);
      setFont(hFs, true, false);
      const titleText = isLatex || isATS ? s.title.toUpperCase() : s.title;
      const titleBase = sy + hFs * 0.88;

      if (isLatex || isATS) {
        if (!dryRun) {
          ctx.fillStyle = "#111111";
          ctx.fillText(titleText, innerX, titleBase);
          const ruleY = sy + hFs * 1.12;
          ctx.fillRect(innerX, ruleY, innerW, (isATS ? 2.2 : 1) * scale);
        }
        sy += hFs * 1.18 + headGap;
      } else if (isCampus) {
        if (!dryRun) {
          ctx.fillStyle = primaryCss;
          ctx.fillRect(innerX, sy + 2 * scale, 3 * scale, hFs * 0.95);
          ctx.fillText(titleText, innerX + 9 * scale, titleBase);
          const tw = ctx.measureText(titleText).width;
          const ruleX = innerX + 9 * scale + tw + 8 * scale;
          if (ruleX < innerX + innerW) {
            ctx.fillStyle = `#${primaryHex}18`;
            ctx.fillRect(ruleX, sy + hFs * 0.52, innerX + innerW - ruleX, Math.max(1, 1 * scale));
          }
        }
        sy += hFs * 1.15 + headGap;
      } else {
        // modern_single_column / academic_photo / executive_sidebar (柔彩描边图标徽章 + 右侧淡分隔线)
        const badgeS = hFs * 1.18;
        if (!dryRun) {
          const badgeY = sy + (hFs - badgeS) * 0.35;
          drawRoundedRect(
            ctx,
            innerX,
            badgeY,
            badgeS,
            badgeS,
            isAcademic ? badgeS / 2 : badgeS * 0.28
          );
          ctx.fillStyle = `#${primaryHex}14`;
          ctx.fill();
          ctx.strokeStyle = `#${primaryHex}30`;
          ctx.lineWidth = Math.max(1, 0.9 * scale);
          ctx.stroke();
          // 徽章中心真实语义矢量图标（与网页端 SectionBadge 一一对应）
          const iconS = badgeS * 0.58;
          drawSectionIconOnCanvas(
            ctx,
            s.type,
            innerX + (badgeS - iconS) / 2,
            badgeY + (badgeS - iconS) / 2,
            iconS,
            primaryCss
          );

          ctx.fillStyle = primaryCss;
          ctx.fillText(titleText, innerX + badgeS + 7 * scale, titleBase);
          const tw = ctx.measureText(titleText).width;
          const ruleX = innerX + badgeS + 7 * scale + tw + 8 * scale;
          if (ruleX < innerX + innerW) {
            ctx.fillStyle = `#${primaryHex}18`;
            ctx.fillRect(ruleX, sy + hFs * 0.52, innerX + innerW - ruleX, Math.max(1, 1 * scale));
          }
        }
        sy += hFs * 1.15 + headGap;
      }

      for (const b of blocks) {
        sy = drawEntryBlock(b, innerX, innerW, sy, secBulletStyle, entryHeaderMode);
      }

      if (isCampusEduBox) {
        sy += boxPadY;
        if (!dryRun) {
          drawRoundedRect(ctx, x, startY, colW, sy - startY, 6 * scale);
          ctx.strokeStyle = `#${primaryHex}24`;
          ctx.lineWidth = Math.max(1, 1 * scale);
          ctx.stroke();
        }
      }

      return sy + secGap;
    };

    const rawBodySections = [...prep.data.sections]
      .filter(
        (s) =>
          s.visible &&
          s.type !== "basic_info" &&
          s.blocks.some((b) => b.visible && blockHasContent(b))
      )
      .sort((a, b) => a.order - b.order);

    const rankCampus = (s: Section) =>
      s.type === "summary" ? 0 : s.type === "education" ? 1 : 2;
    const bodySections = isCampus
      ? [...rawBodySections].sort((a, b) => rankCampus(a) - rankCampus(b) || a.order - b.order)
      : rawBodySections;

    if (isSwiss) {
      const leftColW = 116 * scale;
      const colGap = 20 * scale;
      const rightX = padX + leftColW + colGap;
      const rightW = contentW - leftColW - colGap;
      const defaultBullet: BulletStyleKey = prep.theme.bullet_style ?? "disc";

      bodySections.forEach((s, sIdx) => {
        const blocks = [...s.blocks]
          .filter((b) => b.visible && blockHasContent(b))
          .sort((a, b) => a.order - b.order);
        if (blocks.length === 0) return;
        const secStartY = y;
        if (!dryRun) {
          setFont(baseFs * 0.92, true, false);
          ctx.fillStyle = primaryCss;
          ctx.fillText(s.title.toUpperCase(), padX, secStartY + baseFs * 0.95);
        }
        const bs = resolveBulletStyle(s.bullet_style, defaultBullet);
        let rightY = secStartY;
        for (const b of blocks) {
          rightY = drawEntryBlock(b, rightX, rightW, rightY, bs, headerLayout);
        }
        y = Math.max(secStartY + baseFs * 1.4, rightY);
        if (sIdx < bodySections.length - 1) {
          y += headGap * 0.5;
          if (!dryRun) {
            ctx.fillStyle = "#E2E8F0";
            ctx.fillRect(padX, y, contentW, Math.max(1, 0.8 * scale));
          }
          y += secGap;
        }
      });
    } else if (isSidebar) {
      const sideTypes = ["skills", "education", "certifications"];
      const sideSections = bodySections.filter((s) => sideTypes.includes(s.type));
      const mainSections = bodySections.filter((s) => !sideTypes.includes(s.type));
      const sideW = 216 * scale;
      const colGap = 24 * scale;
      const sidePad = 14 * scale;
      const mainX = padX + sideW + colGap;
      const mainW = contentW - sideW - colGap;
      const startColsY = y;

      // 先测算侧栏高度以便绘制淡底色卡片
      let sideEndY = startColsY + sidePad;
      for (const s of sideSections) {
        sideEndY = drawSectionBlock(s, padX + sidePad, sideW - sidePad * 2, sideEndY, "stack");
      }
      const sideBoxH = Math.max(40 * scale, sideEndY - startColsY + sidePad * 0.5);
      if (!dryRun && sideSections.length > 0) {
        drawRoundedRect(ctx, padX, startColsY, sideW, sideBoxH, 12 * scale);
        ctx.fillStyle = "#F8FAFC";
        ctx.fill();
        ctx.strokeStyle = "#E2E8F0";
        ctx.lineWidth = Math.max(1, 0.9 * scale);
        ctx.stroke();
        let drawSideY = startColsY + sidePad;
        for (const s of sideSections) {
          drawSideY = drawSectionBlock(s, padX + sidePad, sideW - sidePad * 2, drawSideY, "stack");
        }
      }

      let mainEndY = startColsY;
      for (const s of mainSections) {
        mainEndY = drawSectionBlock(s, mainX, mainW, mainEndY, headerLayout);
      }
      y = Math.max(startColsY + sideBoxH, mainEndY);
    } else {
      for (const s of bodySections) {
        y = drawSectionBlock(s, padX, contentW, y, headerLayout);
      }
    }

    return y;
  };

  // Pass 1: 干跑测算真实高度；若单页内容微超画布底边距，自动按比例微缩以确保 100% 完整落入单页不截断
  const baseScale = 2;
  const measuredEndY = renderPass(baseScale, true);
  const maxAllowedY = H - densitySpec.padY * baseScale * 0.85;
  const fitScale =
    measuredEndY > maxAllowedY
      ? Math.max(1.38, baseScale * (maxAllowedY / measuredEndY))
      : baseScale;
  renderPass(fitScale, false);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const b64 = dataUrl.split(",")[1];
  if (!b64) return null;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Generate a valid downloadable PDF binary (%PDF-1.4) without relying on window.print(). */
export async function generatePdf(
  input: Resume,
  pages?: Resume[]
): Promise<Uint8Array> {
  const pageResumes = pages && pages.length > 0 ? pages : [input];
  const jpegs: Uint8Array[] = [];
  for (const r of pageResumes) {
    const jpg = await renderCanvasPageToJpeg(r);
    if (!jpg) break;
    jpegs.push(jpg);
  }
  if (jpegs.length === pageResumes.length && jpegs.length > 0) {
    const objects: Array<string | Uint8Array> = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "",
    ];
    const pageIds: number[] = [];
    const encoder = new TextEncoder();
    for (const jpg of jpegs) {
      const imgId = objects.length + 1;
      const imgHeader = encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width 1588 /Height 2246 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`
      );
      const imgFooter = encoder.encode("\nendstream");
      const imgObj = new Uint8Array(imgHeader.length + jpg.length + imgFooter.length);
      imgObj.set(imgHeader, 0);
      imgObj.set(jpg, imgHeader.length);
      imgObj.set(imgFooter, imgHeader.length + jpg.length);
      objects.push(imgObj);

      const contentStr = "q 595.28 0 0 841.89 0 0 cm /Im0 Do Q";
      const contentId = objects.length + 1;
      objects.push(
        `<< /Length ${contentStr.length} >>\nstream\n${contentStr}\nendstream`
      );
      const pageId = objects.length + 1;
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`
      );
      pageIds.push(pageId);
    }
    objects[1] = `<< /Type /Pages /Kids [${pageIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] /Count ${pageIds.length} >>`;
    return assemblePdf(objects);
  }

  return buildVectorPdf(pageResumes);
}

export function resumeMarkdown(resume: Resume): string {
  const localized = localizedResume(resume);
  const info = localized.data.basic_info;
  const sep = localized.locale === "en" ? ": " : "：";
  const lines: string[] = [];
  if (info.name) lines.push(`# ${plainText(info.name)}`);
  if (info.title) lines.push(`**${plainText(info.title)}**`);
  const contacts = [
    info.email,
    info.phone,
    info.location,
    info.website,
    ...(info.custom_fields ?? [])
      .map((f) => [f.label?.trim(), f.value?.trim()].filter(Boolean).join(sep))
      .filter(Boolean),
  ].filter(Boolean);
  if (contacts.length) lines.push(contacts.join(" | "));
  lines.push("");

  const sections = [...localized.data.sections]
    .filter((s) => s.visible && s.type !== "basic_info")
    .sort((a, b) => a.order - b.order);

  for (const s of sections) {
    const blocks = [...s.blocks]
      .filter((b) => b.visible && blockHasContent(b))
      .sort((a, b) => a.order - b.order);
    if (!blocks.length) continue;
    lines.push(`## ${plainText(s.title)}`);
    lines.push("");
    for (const b of blocks) {
      const heading = [
        plainText(b.title),
        ...[b.subtitle, ...(b.subtitles ?? [])].map(plainText).filter(Boolean),
      ]
        .filter(Boolean)
        .join(" · ");
      const dates = [b.start_date, b.end_date].filter(Boolean).join(" – ");
      const meta = [dates, plainText(b.location)].filter(Boolean).join(" · ");
      if (heading || meta) {
        lines.push(
          heading && meta ? `### ${heading} (${meta})` : `### ${heading || meta}`
        );
      }
      if (b.description) lines.push(plainText(b.description));
      if (b.skills.length) {
        lines.push(`- ${b.skills.map(plainText).join(" · ")}`);
      }
      for (const bullet of b.bullets) {
        const clean = plainText(bullet).trim();
        if (clean) lines.push(`- ${clean}`);
      }
      if (b.links.length) {
        lines.push(b.links.filter(Boolean).join(" · "));
      }
      lines.push("");
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
