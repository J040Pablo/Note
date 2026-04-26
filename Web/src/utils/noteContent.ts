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
  locked?: boolean;
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

export const createCanvasDrawingElement = (x = 0, y = 0, width = DEFAULT_PAGE_W, height = DEFAULT_PAGE_H, pageId: ID, zIndex = 0): CanvasDrawingElement => ({
  id: makeId(),
  type: "drawing",
  pageId,
  x,
  y,
  width,
  height,
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

export const buildSmoothSvgPath = (points: {x: number, y: number}[]): string => {
  if (!points.length) return "";
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y + 0.1}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    
    if (i === 0) {
      d += ` L ${midX} ${midY}`;
    } else {
      d += ` Q ${p1.x} ${p1.y}, ${midX} ${midY}`;
    }
    
    if (i === points.length - 2) {
      d += ` L ${p2.x} ${p2.y}`;
    }
  }
  return d;
};

// ─── Normalization ──────────────────────────────────────────────────────────

/**
 * Migrates binary/legacy formats to the current standard.
 * Specifically handles moving pages[].drawings into elements[].
 */
export const normalizeCanvasDrawings = (doc: CanvasNoteDocument): CanvasNoteDocument => {
  const elements = [...(doc.elements || [])];
  let hasChanges = false;

  doc.pages.forEach(page => {
    const legacyDrawings = Array.isArray(page.drawings) ? page.drawings : [];
    if (legacyDrawings.length > 0) {
      // Find if we already have a full-page drawing element for this page
      const existingIdx = elements.findIndex(el => 
        el.type === "drawing" && 
        el.pageId === page.id && 
        el.x === 0 && 
        el.y === 0
      );

      if (existingIdx >= 0) {
        const el = elements[existingIdx] as CanvasDrawingElement;
        const existingStrokeIds = new Set(el.strokes.map(s => s.id));
        const newStrokes = legacyDrawings.filter(s => !existingStrokeIds.has(s.id));
        
        if (newStrokes.length > 0) {
          // Replace with new object to avoid mutation and ensure React detects change
          elements[existingIdx] = {
            ...el,
            strokes: [...el.strokes, ...newStrokes]
          };
          hasChanges = true;
        }
      } else {
        // Create new drawing element covering the entire page
        const newEl = createCanvasDrawingElement(0, 0, page.width, page.height, page.id, 0);
        newEl.strokes = [...legacyDrawings];
        elements.push(newEl);
        hasChanges = true;
      }
    }
  });

  return hasChanges ? { ...doc, elements } : doc;
};

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
      let merged = { ...base, ...parsed, elements: parsed.elements ?? [] };
      if (!merged.pages || merged.pages.length === 0) {
        merged.pages = [createCanvasPage(merged.pageWidth, merged.pageHeight)];
      }
      // Apply normalization
      merged = normalizeCanvasDrawings(merged as CanvasNoteDocument);
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
          elements.push(createCanvasDrawingElement(50, y, 350, 350, pageId));
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
