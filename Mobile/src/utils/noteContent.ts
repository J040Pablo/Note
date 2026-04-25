import type {
  CanvasDrawingElement,
  CanvasElement,
  CanvasImageElement,
  CanvasNoteDocument,
  CanvasPage,
  CanvasShapeElement,
  CanvasShapeType,
  CanvasTextElement,
  ID,
  NoteBlock,
  NoteCodeBlock,
  NoteDrawingBlock,
  NoteTextBlock,
  RichNoteDocument
} from "@models/types";

const makeId = (): ID => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

const DEFAULT_PAGE_W = 900;
const DEFAULT_PAGE_H = 1200;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const stripHtml = (input: string): string =>
  input
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');

const createCanvasPage = (w = DEFAULT_PAGE_W, h = DEFAULT_PAGE_H): CanvasPage => ({
  id: makeId(),
  width: w,
  height: h
});

export const createTextBlock = (text = ""): NoteTextBlock => ({
  id: makeId(),
  type: "text",
  text,
  style: { fontSize: 16 }
});

export const createImageBlock = (uri: string): NoteBlock => ({
  id: makeId(),
  type: "image",
  uri,
  caption: ""
});

export const createCodeBlock = (code = "", language = "javascript"): NoteCodeBlock => ({
  id: makeId(),
  type: "code",
  code,
  language: language as NoteCodeBlock["language"],
  theme: "dark",
  showLineNumbers: true
});

export const createDrawingBlock = (backgroundUri: string | null = null): NoteDrawingBlock => ({
  id: makeId(),
  type: "drawing",
  backgroundUri,
  height: 220,
  strokes: []
});

export const createEmptyRichNote = (): RichNoteDocument => ({
  version: 1,
  blocks: [createTextBlock("")]
});

export const createEmptyCanvasNote = (): CanvasNoteDocument => ({
  version: 1,
  type: "canvas",
  pageWidth: DEFAULT_PAGE_W,
  pageHeight: DEFAULT_PAGE_H,
  pages: [createCanvasPage(DEFAULT_PAGE_W, DEFAULT_PAGE_H)],
  zoom: 1,
  elements: []
});

export const createCanvasTextElement = (text = "Text", x = 120, y = 120, pageId: ID): CanvasTextElement => ({
  id: makeId(),
  type: "text",
  pageId,
  x,
  y,
  width: 220,
  height: 56,
  rotation: 0,
  zIndex: 1,
  text,
  // textColor intentionally omitted – resolved from theme at render time
  style: { fontSize: 18 }
});

export const createCanvasImageElement = (uri: string, x = 140, y = 140, pageId: ID): CanvasImageElement => ({
  id: makeId(),
  type: "image",
  pageId,
  x,
  y,
  width: 260,
  height: 180,
  rotation: 0,
  zIndex: 1,
  uri
});

export const createCanvasShapeElement = (shape: CanvasShapeType, x = 180, y = 180, pageId: ID): CanvasShapeElement => ({
  id: makeId(),
  type: "shape",
  shape,
  pageId,
  x,
  y,
  width: shape === "arrow" ? 220 : 160,
  height: shape === "arrow" ? 36 : 120,
  rotation: 0,
  zIndex: 1,
  color: "#ef4444",
  strokeWidth: 3
});

export const createCanvasDrawingElement = (x = 160, y = 160, pageId: ID): CanvasDrawingElement => ({
  id: makeId(),
  type: "drawing",
  pageId,
  x,
  y,
  width: 260,
  height: 180,
  rotation: 0,
  zIndex: 1,
  color: "#ef4444",
  strokeWidth: 4,
  strokes: []
});

const isRichDoc = (value: unknown): value is RichNoteDocument => {
  if (!value || typeof value !== "object") return false;
  const v = value as RichNoteDocument;
  return v.version === 1 && Array.isArray(v.blocks);
};

const isCanvasDoc = (value: unknown): value is CanvasNoteDocument => {
  if (!value || typeof value !== "object") return false;
  const v = value as CanvasNoteDocument;
  return v.version === 1 && v.type === "canvas" && Array.isArray(v.elements);
};

export const parseRichNoteContent = (content: string): RichNoteDocument => {
  if (!content?.trim()) return createEmptyRichNote();

  try {
    const parsed = JSON.parse(content);
    if (isRichDoc(parsed)) {
      if (parsed.blocks.length === 0) return createEmptyRichNote();
      return parsed;
    }
  } catch {
    // Legacy plain-text note content.
  }

  return {
    version: 1,
    blocks: [createTextBlock(content)]
  };
};

export const parseCanvasNoteContent = (content: string): CanvasNoteDocument => {
  if (!content?.trim()) {
    return createEmptyCanvasNote();
  }

  try {
    const parsed = JSON.parse(content);
    if (isCanvasDoc(parsed)) {
      const base = createEmptyCanvasNote();
      const merged = { ...base, ...parsed } as CanvasNoteDocument;

      const rawElements = (parsed.elements ?? []) as CanvasElement[];
      const hasPages = Array.isArray((parsed as { pages?: unknown }).pages);

      if (hasPages) {
        const pages = (parsed as { pages?: CanvasPage[] }).pages ?? [];
        const pageWidth = (parsed as { pageWidth?: number }).pageWidth ?? base.pageWidth;
        const pageHeight = (parsed as { pageHeight?: number }).pageHeight ?? base.pageHeight;
        const ensuredPages = pages.length ? pages : [createCanvasPage(pageWidth, pageHeight)];
        const firstPageId = ensuredPages[0].id;
        const normalizedElements = [...rawElements]
          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
          .map((el, i) => ({
            ...el,
            zIndex: i + 1, // Safe incremental zIndex
            pageId: (el as any).pageId ?? firstPageId,
            rotation: Number(el.rotation) || 0,
            x: Number(el.x) || 0,
            y: Number(el.y) || 0,
            width: Number(el.width) || 120,
            height: Number(el.height) || 40
          }));

        return {
          ...merged,
          pageWidth,
          pageHeight,
          pages: ensuredPages,
          elements: normalizedElements
        };
      }

      // Legacy (infinite) -> pages: split by absolute y into multiple pages.
      const pageWidth = (parsed as { pageWidth?: number }).pageWidth ?? base.pageWidth;
      const pageHeight = (parsed as { pageHeight?: number }).pageHeight ?? base.pageHeight;
      const maxBottom = rawElements.reduce((acc, el) => Math.max(acc, (el.y ?? 0) + (el.height ?? 0)), 0);
      const pagesNeeded = Math.max(1, Math.ceil(maxBottom / pageHeight));
      const pages: CanvasPage[] = Array.from({ length: pagesNeeded }, () => createCanvasPage(pageWidth, pageHeight));

      const migratedElements = rawElements.map((el) => {
        const absY = el.y ?? 0;
        const pageIndex = clamp(Math.floor(absY / pageHeight), 0, pages.length - 1);
        const pageId = pages[pageIndex].id;
        const localY = absY - pageIndex * pageHeight;
        const w = Math.max(20, el.width ?? 0);
        const h = Math.max(20, el.height ?? 0);
        return {
          ...el,
          pageId,
          x: clamp(el.x ?? 0, 0, Math.max(0, pageWidth - w)),
          y: clamp(localY, 0, Math.max(0, pageHeight - h)),
          width: w,
          height: h
        };
      });

      return {
        ...merged,
        pageWidth,
        pageHeight,
        pages,
        elements: migratedElements
      };
    }

    if (isRichDoc(parsed)) {
      const base = createEmptyCanvasNote();
      const pageWidth = base.pageWidth;
      const pageHeight = base.pageHeight;
      const pages: CanvasPage[] = [createCanvasPage(pageWidth, pageHeight)];
      const elements: CanvasElement[] = [];
      let y = 120;
      parsed.blocks.forEach((block, idx) => {
        if (block.type === "text") {
          const pageIndex = Math.max(0, Math.floor(y / pageHeight));
          while (pages.length <= pageIndex) pages.push(createCanvasPage(pageWidth, pageHeight));
          const pageId = pages[pageIndex].id;
          const localY = y - pageIndex * pageHeight;
          elements.push({
            ...createCanvasTextElement(block.text, 120, localY, pageId),
            style: block.style,
            zIndex: idx + 1
          });
          y += 120;
        } else if (block.type === "image") {
          const pageIndex = Math.max(0, Math.floor(y / pageHeight));
          while (pages.length <= pageIndex) pages.push(createCanvasPage(pageWidth, pageHeight));
          const pageId = pages[pageIndex].id;
          const localY = y - pageIndex * pageHeight;
          elements.push({
            ...createCanvasImageElement(block.uri, 120, localY, pageId),
            zIndex: idx + 1
          });
          y += 220;
        } else if (block.type === "drawing") {
          const pageIndex = Math.max(0, Math.floor(y / pageHeight));
          while (pages.length <= pageIndex) pages.push(createCanvasPage(pageWidth, pageHeight));
          const pageId = pages[pageIndex].id;
          const localY = y - pageIndex * pageHeight;
          elements.push({
            ...createCanvasDrawingElement(120, localY, pageId),
            strokes: block.strokes,
            zIndex: idx + 1
          });
          y += 220;
        }
      });

      return {
        ...base,
        pages,
        elements: elements.length ? elements : []
      };
    }
  } catch {
    // Legacy plain-text note.
  }

  return createEmptyCanvasNote();
};

export const serializeRichNoteContent = (doc: RichNoteDocument): string => {
  const normalized: RichNoteDocument = {
    version: 1,
    blocks: doc.blocks.length ? doc.blocks : [createTextBlock("")]
  };
  return JSON.stringify(normalized);
};

export const serializeCanvasNoteContent = (doc: CanvasNoteDocument): string => {
  const normalized: CanvasNoteDocument = {
    ...createEmptyCanvasNote(),
    ...doc,
    elements: [...(doc.elements ?? [])].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
  };
  return JSON.stringify(normalized);
};

export const getPlainTextFromRichNoteContent = (content: string): string => {
  if (/<[^>]+>/.test(content)) {
    return stripHtml(content).trim();
  }

  const canvasDoc = parseCanvasNoteContent(content);
  if (canvasDoc.elements.length > 0) {
    return canvasDoc.elements
      .map((el) => {
        if (el.type === "text") return el.text ?? "";
        if (el.type === "image") return "[image]";
        if (el.type === "shape") return `[${el.shape}]`;
        return "[drawing]";
      })
      .join("\n")
      .trim();
  }

  const richDoc = parseRichNoteContent(content);
  return richDoc.blocks
    .map((block) => {
      if (block.type === "text") return block.text ?? "";
      if (block.type === "image") return block.caption?.trim() ? `Image: ${block.caption}` : "[image]";
      return "[drawing]";
    })
    .join("\n")
    .trim();
};

export const getRichNotePreviewLine = (content: string, maxLength = 110): string => {
  const plain = getPlainTextFromRichNoteContent(content);
  const line = plain.split(/\r?\n/).find((x) => x.trim().length > 0) ?? "";
  return line.length > maxLength ? `${line.slice(0, maxLength - 1).trimEnd()}…` : line;
};

export const transformNoteImages = async (
  content: string,
  mapper: (uri: string) => Promise<string>
): Promise<string> => {
  if (!content || !content.startsWith("{")) return content;

  try {
    const doc = JSON.parse(content);
    let changed = false;

    // Handle Rich Note
    if (isRichDoc(doc)) {
      for (const block of doc.blocks) {
        if (block.type === "image" && block.uri) {
          const next = await mapper(block.uri);
          if (next !== block.uri) {
            block.uri = next;
            changed = true;
          }
        }
      }
    }
    // Handle Canvas Note
    else if (isCanvasDoc(doc)) {
      for (const el of doc.elements) {
        if (el.type === "image" && el.uri) {
          const next = await mapper(el.uri);
          if (next !== el.uri) {
            el.uri = next;
            changed = true;
          }
        }
      }
    }

    return changed ? JSON.stringify(doc) : content;
  } catch (error) {
    console.error("[noteContent] transformNoteImages failed", error);
    return content;
  }
};
