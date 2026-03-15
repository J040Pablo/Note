export type ID = string;

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
  /** Optional display color for the folder (e.g. "blue", "green", "#FF9900") */
  color?: string | null;
  createdAt: number;
}

export interface Note {
  id: ID;
  title: string;
  content: string;
  folderId: ID | null;
  createdAt: number;
  updatedAt: number;
}

export interface Task {
  id: ID;
  text: string;
  completed: boolean;
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
  parentFolderId: ID | null;
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

