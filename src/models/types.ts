export type ID = string;

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
  orderIndex: number;
  /** Optional display color for the folder (e.g. "blue", "green", "#FF9900") */
  color?: string | null;
  description?: string | null;
  photoPath?: string | null;
  bannerPath?: string | null;
  createdAt: number;
}

export interface Note {
  id: ID;
  title: string;
  /** Serialized rich note document (JSON). Legacy plain text is still supported. */
  content: string;
  folderId: ID | null;
  createdAt: number;
  updatedAt: number;
}

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

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingStroke {
  id: ID;
  color: string;
  size: number;
  opacity?: number;
  isEraser?: boolean;
  points: DrawingPoint[];
}

export interface NoteDrawingBlock {
  id: ID;
  type: "drawing";
  backgroundUri?: string | null;
  height: number;
  strokes: DrawingStroke[];
}

export type NoteBlock = NoteTextBlock | NoteImageBlock | NoteDrawingBlock;

export interface RichNoteDocument {
  version: 1;
  blocks: NoteBlock[];
}

export type CanvasElementType = "text" | "image" | "shape" | "drawing";
export type CanvasShapeType = "arrow" | "rectangle" | "circle";

export interface CanvasPage {
  id: ID;
  width: number;
  height: number;
  /** Optional page background color (defaults handled by UI) */
  backgroundColor?: string | null;
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
  strokes: DrawingStroke[];
  color: string;
  strokeWidth: number;
}

export type CanvasElement = CanvasTextElement | CanvasImageElement | CanvasShapeElement | CanvasDrawingElement;

export interface CanvasNoteDocument {
  version: 1;
  type: "canvas";
  /**
   * Page model:
   * - Pages are vertically stacked in the editor UI (scroll).
   * - Elements belong to exactly one page via pageId and use page-local x/y.
   */
  pageWidth: number;
  pageHeight: number;
  pages: CanvasPage[];

  /**
   * Legacy fields (infinite canvas) kept optional for backward compatibility.
   * New documents shouldn't rely on these.
   */
  width?: number;
  height?: number;
  zoom: number;
  offsetX?: number;
  offsetY?: number;
  elements: CanvasElement[];
}

export interface Task {
  id: ID;
  text: string;
  completed: boolean;
  orderIndex: number;
  /** 0 = low, 1 = medium, 2 = high */
  priority: number;
  noteId: ID | null;
  /** Optional scheduled day (YYYY-MM-DD) */
  scheduledDate?: string | null;
  /** Weekdays where task repeats. 0=Sun ... 6=Sat */
  repeatDays?: number[];
  /** Completed day keys (YYYY-MM-DD) used by recurring/scheduled tasks */
  completedDates?: string[];
}

export type AppFileType = "pdf" | "image" | "document";

export interface AppFile {
  id: ID;
  name: string;
  type: AppFileType;
  path: string;
  createdAt: number;
  orderIndex: number;
  parentFolderId: ID | null;
  description?: string | null;
  thumbnailPath?: string | null;
  bannerPath?: string | null;
}

export type PinnedItemType = "folder" | "note" | "task";

export interface PinnedItem {
  type: PinnedItemType;
  id: ID;
  pinnedAt: number;
}

export type RecentItemType = "folder" | "note";

export interface RecentItem {
  type: RecentItemType;
  id: ID;
  openedAt: number;
}

export interface Attachment {
  id: ID;
  uri: string;
  noteId: ID;
}

