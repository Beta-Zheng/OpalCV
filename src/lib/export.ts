import type { Block, BulletStyleKey, Resume, Section } from "../types";
import { localizedResume, blockHasContent } from "./workflow";
import { resolveBulletStyle, stripHtml } from "./utils";

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
  return /academic|two[_-]?column|2col/i.test(templateId);
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

function buildAvatarDrawingXml(relId: string, scale: number): string {
  const clamped = Math.min(2, Math.max(0.5, scale));
  const cx = Math.round(90 * clamped * 9525);
  const cy = Math.round(126 * clamped * 9525);
  return `<w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="60"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="1" name="Avatar"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="avatar"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
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
  const avatar = parseImageDataUrl(resume.data.avatar_url);

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
    const avatarXml = buildAvatarDrawingXml(
      "rIdAvatar",
      resume.theme.avatar_scale ?? 1
    );
    headerXml = `<w:tbl><w:tblPr><w:tblW w:w="10466" w:type="dxa"/>${BORDERLESS_TBL_BORDERS}</w:tblPr><w:tblGrid><w:gridCol w:w="8200"/><w:gridCol w:w="2266"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="8200" w:type="dxa"/></w:tcPr>${
      headerXml || "<w:p/>"
    }</w:tc><w:tc><w:tcPr><w:tcW w:w="2266" w:type="dxa"/></w:tcPr>${avatarXml}</w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>`;
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
  const primaryHex = normalizeHexColor(prep.theme.primary_color, "4F46E5");
  const primaryCss = `#${primaryHex}`;
  const scale = 2;
  const margin = 46 * scale;
  let y = margin + 12 * scale;
  const fontStackCss =
    '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
  const baseFs = (prep.theme.font_size || 14) * scale;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

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
    lineH: number
  ) => {
    let cx = x;
    for (const r of runs) {
      if (r.lineBreak) {
        y += lineH;
        cx = x;
        continue;
      }
      setFont(sizePx, r.bold, r.italic);
      ctx.fillStyle = r.color ? `#${r.color}` : "#222A28";
      // Split by character for CJK-safe wrapping
      for (const ch of r.text) {
        const w = ctx.measureText(ch).width;
        if (cx + w > x + maxW && cx > x) {
          y += lineH;
          cx = x;
        }
        ctx.fillText(ch, cx, y);
        cx += w;
      }
    }
    y += lineH;
  };

  // Optional avatar in browser canvas
  let headerRightReserve = 0;
  if (prep.data.avatar_url) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = prep.data.avatar_url!;
      });
      const avScale = Math.min(2, Math.max(0.5, prep.theme.avatar_scale ?? 1));
      const avW = Math.round(78 * scale * avScale);
      const avH = Math.round(108 * scale * avScale);
      ctx.drawImage(img, W - margin - avW, margin, avW, avH);
      headerRightReserve = avW + 20 * scale;
    } catch {
      // Ignore unloadable avatar URL in canvas
    }
  }

  const basicVisible =
    prep.data.sections.find((s) => s.type === "basic_info")?.visible !== false;
  if (basicVisible) {
    const info = prep.data.basic_info;
    const headerMaxW = W - margin * 2 - headerRightReserve;
    if (info.name.trim()) {
      drawWrappedRuns(
        parseInlineRuns(info.name, { bold: true, color: primaryHex }),
        margin,
        headerMaxW,
        baseFs * 1.9,
        baseFs * 2.3
      );
    }
    if (info.title.trim()) {
      drawWrappedRuns(
        parseInlineRuns(info.title, { bold: true, color: primaryHex }),
        margin,
        headerMaxW,
        baseFs * 1.08,
        baseFs * 1.5
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
      drawWrappedRuns(
        parseInlineRuns(contacts, { color: "555F5C" }),
        margin,
        headerMaxW,
        baseFs * 0.86,
        baseFs * 1.35
      );
    }
    y += 12 * scale;
  }

  const bodySections = [...prep.data.sections]
    .filter(
      (s) =>
        s.visible &&
        s.type !== "basic_info" &&
        s.blocks.some((b) => b.visible && blockHasContent(b))
    )
    .sort((a, b) => a.order - b.order);

  const drawSection = (s: Section, x: number, colW: number) => {
    if (y > H - margin) return;
    setFont(baseFs * 1.15, true, false);
    ctx.fillStyle = primaryCss;
    ctx.fillText(s.title, x, y);
    y += 8 * scale;
    ctx.fillStyle = primaryCss;
    ctx.fillRect(x, y, colW, 1.5 * scale);
    y += 18 * scale;

    const defaultBullet =
      prep.theme.bullet_style ??
      (prep.template_id === "classic_ats" ? "disc" : "diamond");
    const bulletStyle = resolveBulletStyle(s.bullet_style, defaultBullet);
    const blocks = [...s.blocks]
      .filter((b) => b.visible && blockHasContent(b))
      .sort((a, b) => a.order - b.order);

    for (const b of blocks) {
      if (y > H - margin) break;
      const header = [b.title, b.subtitle, ...(b.subtitles ?? [])]
        .filter(Boolean)
        .join(" · ");
      if (header.trim()) {
        drawWrappedRuns(
          parseInlineRuns(header, { bold: true }),
          x,
          colW,
          baseFs,
          baseFs * 1.4
        );
      }
      const meta = [
        [b.start_date, b.end_date].filter(Boolean).join(" – "),
        b.location,
      ]
        .filter(Boolean)
        .join(" | ");
      if (meta.trim()) {
        drawWrappedRuns(
          parseInlineRuns(meta, { color: "64716C" }),
          x,
          colW,
          baseFs * 0.85,
          baseFs * 1.25
        );
      }
      if (b.description.trim()) {
        drawWrappedRuns(
          parseInlineRuns(b.description),
          x,
          colW,
          baseFs * 0.94,
          baseFs * 1.4
        );
      }
      let seq = 0;
      b.bullets.forEach((bullet, idx) => {
        if (!bullet.trim() || y > H - margin) return;
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
        drawWrappedRuns(runs, x, colW, baseFs * 0.92, baseFs * 1.38);
      });
      if (b.skills.length > 0) {
        drawWrappedRuns(
          parseInlineRuns(b.skills.join(" · ")),
          x,
          colW,
          baseFs * 0.9,
          baseFs * 1.35
        );
      }
      y += 6 * scale;
    }
    y += 8 * scale;
  };

  if (isTwoColumnTemplate(prep.template_id) && bodySections.length > 0) {
    const { left, right } = splitTwoColumnSections(bodySections);
    const startY = y;
    const gap = 24 * scale;
    const leftW = (W - margin * 2 - gap) * 0.35;
    const rightW = W - margin * 2 - gap - leftW;
    for (const s of left) drawSection(s, margin, leftW);
    y = startY;
    for (const s of right) drawSection(s, margin + leftW + gap, rightW);
  } else {
    for (const s of bodySections) {
      drawSection(s, margin, W - margin * 2);
    }
  }

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
