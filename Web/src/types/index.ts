export type ID = string;

export type TaskPriority = "low" | "medium" | "high";

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

export interface SidebarLink {
  label: string;
  icon: string;
  path: string;
}

export interface Theme {
  mode: 'light' | 'dark';
  colors: {
    background: string;
    text: string;
    primary: string;
    secondary: string;
  };
}