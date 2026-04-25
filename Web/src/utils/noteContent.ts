// Note Content Types

export type ID = string;

export const makeId = (): ID => `${Date.now()}-${Math.floor(Math.random() * 100000)}`;

// ─── Shared Styles ──────────────────────────────────────────────────────────

export interface NoteTextStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textColor?: string;
  highlightColor?: string;
  fontSize?: number;
  fontFamily?: string;
  textAlign?: "left" | "center" | "right";
}

// ─── Block Types (Legacy / QuickNotes) ──────────────────────────────────────

export interface NoteTextBlock {
  id: ID;
  type: "text";
  text: string;
  style?: NoteTextStyle;
}
export interface NoteImageBlock {
  id: ID;
  type: "image";
  uri: string;
  caption?: string;
}
export interface NoteCodeBlock {
  id: ID;
  type: "code";
  code: string;
  language?: string;
  theme?: "dark" | "light";
  showLineNumbers?: boolean;
}
export interface DrawingPoint { x: number; y: number; }
export interface DrawingStroke {
  id: ID; color: string; size: number; opacity?: number; isEraser?: boolean; points: DrawingPoint[];
}
export interface NoteDrawingBlock {
  id: ID; type: "drawing"; backgroundUri?: string | null; height: number; strokes: DrawingStroke[];
}
export type NoteBlock = NoteTextBlock | NoteImageBlock | NoteCodeBlock | NoteDrawingBlock;

export interface RichNoteDocument {
  version: 1;
  blocks: NoteBlock[];
}

// ─── Canvas Types ───────────────────────────────────────────────────────────

export type CanvasShapeType = "rectangle" | "circle" | "arrow" | "line";
export type CanvasElementType = "text" | "image" | "shape" | "drawing" | "code";

export interface CanvasPage {
  id: ID;
  width: number;
  height: number;
  drawings: DrawingStroke[];
}

export interface CanvasElementBase {
  id: ID;
  type: CanvasElementType;
  pageId: ID;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

export interface CanvasTextElement extends CanvasElementBase {
  type: "text";
  text: string;
  style?: NoteTextStyle;
}

export interface CanvasImageElement extends CanvasElementBase {
  type: "image";
  uri: string;
}

export interface CanvasShapeElement extends CanvasElementBase {
  type: "shape";
  shape: CanvasShapeType;
  color: string;
  strokeWidth: number;
}

export interface CanvasDrawingElement extends CanvasElementBase {
  type: "drawing";
  color: string;
  strokeWidth: number;
  strokes: DrawingStroke[];
}

export interface CanvasCodeElement extends CanvasElementBase {
  type: "code";
  code: string;
  language?: string;
}

export type CanvasElement = CanvasTextElement | CanvasImageElement | CanvasShapeElement | CanvasDrawingElement | CanvasCodeElement;

export interface CanvasNoteDocument {
  version: 1;
  type: "canvas";
  pageWidth: number;
  pageHeight: number;
  pages: CanvasPage[];
  currentPageIndex: number;
  elements: CanvasElement[];
}

// ─── Factories ─────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_W = 800;
export const DEFAULT_PAGE_H = 1100;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export const createCanvasPage = (w = DEFAULT_PAGE_W, h = DEFAULT_PAGE_H): CanvasPage => ({
  id: makeId(),
  width: w,
  height: h,
  drawings: []
});

export const createEmptyCanvasNote = (): CanvasNoteDocument => ({
  version: 1,
  type: "canvas",
  pageWidth: DEFAULT_PAGE_W,
  pageHeight: DEFAULT_PAGE_H,
  pages: [createCanvasPage(DEFAULT_PAGE_W, DEFAULT_PAGE_H)],
  currentPageIndex: 0,
  elements: []
});

export const createCanvasTextElement = (text = "New text", x = 100, y = 100, pageId: ID, zIndex = 1): CanvasTextElement => ({
  id: makeId(),
  type: "text",
  pageId,
  x,
  y,
  width: 250,
  height: 60,
  rotation: 0,
  zIndex,
  text,
  style: { fontSize: 16 }
});

export const createCanvasImageElement = (uri: string, x = 100, y = 100, pageId: ID, zIndex = 1): CanvasImageElement => ({
  id: makeId(),
  type: "image",
  pageId,
  x,
  y,
  width: 300,
  height: 200,
  rotation: 0,
  zIndex,
  uri
});

export const createCanvasDrawingElement = (x = 100, y = 100, pageId: ID, zIndex = 1): CanvasDrawingElement => ({
  id: makeId(),
  type: "drawing",
  pageId,
  x,
  y,
  width: 300,
  height: 300,
  rotation: 0,
  zIndex,
  color: "#e2e8f0",
  strokeWidth: 4,
  strokes: []
});

export const createCanvasShapeElement = (shape: CanvasShapeType, color = "#e2e8f0", x = 100, y = 100, pageId: ID, zIndex = 1): CanvasShapeElement => ({
  id: makeId(),
  type: "shape",
  pageId,
  x,
  y,
  width: 150,
  height: 150,
  rotation: 0,
  zIndex,
  shape,
  color,
  strokeWidth: 4
});

export const createCanvasCodeElement = (code = "", x = 100, y = 100, pageId: ID, zIndex = 1): CanvasCodeElement => ({
  id: makeId(),
  type: "code",
  pageId,
  x,
  y,
  width: 400,
  height: 200,
  rotation: 0,
  zIndex,
  code,
  language: "javascript"
});

// ─── Parsing & Serialization ────────────────────────────────────────────────

export const isCanvasDoc = (value: unknown): value is CanvasNoteDocument => {
  if (!value || typeof value !== "object") return false;
  const v = value as CanvasNoteDocument;
  return v.version === 1 && v.type === "canvas" && Array.isArray(v.elements);
};

export const parseCanvasNoteContent = (content: string): CanvasNoteDocument => {
  if (!content?.trim()) return createEmptyCanvasNote();

  try {
    const parsed = JSON.parse(content);
    if (isCanvasDoc(parsed)) {
      const base = createEmptyCanvasNote();
      const merged = { ...base, ...parsed, elements: parsed.elements ?? [] };
      if (!merged.pages || merged.pages.length === 0) {
        merged.pages = [createCanvasPage(merged.pageWidth, merged.pageHeight)];
      }
      return merged as CanvasNoteDocument;
    }

    // fallback for legacy block doc to canvas doc
    if (parsed && Array.isArray(parsed.blocks)) {
      const base = createEmptyCanvasNote();
      const pageId = base.pages[0].id;
      let y = 50;
      const elements: CanvasElement[] = [];
      for (const block of parsed.blocks) {
        if (block.type === "text") {
          elements.push(createCanvasTextElement(block.text, 50, y, pageId));
          y += 100;
        } else if (block.type === "image") {
          elements.push(createCanvasImageElement(block.uri, 50, y, pageId));
          y += 250;
        } else if (block.type === "drawing") {
          elements.push(createCanvasDrawingElement(50, y, pageId));
          y += 350;
        } else if (block.type === "code") {
          elements.push(createCanvasCodeElement(block.code, 50, y, pageId));
          y += 250;
        }
      }
      return { ...base, elements };
    }
  } catch {
    // text
  }

  const baseText = createEmptyCanvasNote();
  baseText.elements = [createCanvasTextElement(content, 50, 50, baseText.pages[0].id)];
  return baseText;
};

export const serializeCanvasNoteContent = (doc: CanvasNoteDocument): string => {
  return JSON.stringify({
    ...doc,
    elements: [...(doc.elements || [])].sort((a, b) => a.zIndex - b.zIndex)
  });
};
