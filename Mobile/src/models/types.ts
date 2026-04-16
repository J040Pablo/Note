export type ID = string;

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
  orderIndex: number;
  /** Global order for mixed item sorting in grid view (folders, notes, quick notes together) */
  globalOrder?: number;
  /** Optional display color for the folder (e.g. "blue", "green", "#FF9900") */
  color?: string | null;
  description?: string | null;
  photoPath?: string | null;
  bannerPath?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Note {
  id: ID;
  title: string;
  /** Serialized rich note document (JSON). Legacy plain text is still supported. */
  content: string;
  folderId: ID | null;
  /** Global order for mixed item sorting in grid view (folders, notes, quick notes together) */
  globalOrder?: number;
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

export interface NoteCodeBlock {
  id: ID;
  type: "code";
  code: string;
  language?: "javascript" | "typescript" | "python" | "java" | "sql" | "html" | "css" | "json" | "yaml" | "bash";
  theme?: "dark" | "light";
  showLineNumbers?: boolean;
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

export type NoteBlock = NoteTextBlock | NoteImageBlock | NoteCodeBlock | NoteDrawingBlock;

export interface RichNoteDocument {
  version: 1;
  blocks: NoteBlock[];
}

export interface QuickNote {
  id: ID;
  title: string;
  content: string;
  folderId: ID | null;
  /** Global order for mixed item sorting in grid view (folders, notes, quick notes together) */
  globalOrder?: number;
  createdAt: number;
  updatedAt: number;
}

export type NoteType = "rich" | "canvas" | "quick";

export type CanvasElementType = "text" | "image" | "shape" | "drawing";
export type CanvasShapeType = "arrow" | "rectangle" | "circle";

export interface CanvasPage {
  id: ID;
  width: number;
  height: number;
  /** Optional user-defined page title */
  title?: string;
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
  metadata?: {
    link?: {
      url: string;
      start: number;
      end: number;
    };
  };
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
  updatedAt: number;
  orderIndex: number;
  /** 0 = low, 1 = medium, 2 = high */
  priority: number;
  noteId: ID | null;
  /** Optional scheduled day (YYYY-MM-DD) */
  parentId?: string | null;
  scheduledDate?: string | null;
  /** Optional scheduled time (HH:mm) */
  scheduledTime?: string | null;
  /** Weekdays where task repeats. 0=Sun ... 6=Sat */
  repeatDays?: number[];
  /** Completed day keys (YYYY-MM-DD) used by recurring/scheduled tasks */
  completedDates?: string[];
  /** Reminder presets for notifications */
  reminders?: TaskReminderType[];
  /** Notification IDs for scheduled reminders */
  notificationIds?: string[];
}

export type TaskReminderType = "AT_TIME" | "10_MIN_BEFORE" | "1_HOUR_BEFORE" | "1_DAY_BEFORE";

export type AppFileType = "pdf" | "image" | "document";

export interface AppFile {
  id: ID;
  name: string;
  type: AppFileType;
  path: string;
  createdAt: number;
  orderIndex: number;
  parentFolderId: ID | null;
  globalOrder?: number;
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

export interface Notification {
  id: string;
  title: string;
  body: string;
  taskId?: string | null;
  read: number; // 0 or 1
  receivedAt: number;
}

