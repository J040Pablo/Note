export type FolderViewMode = "list" | "grid";

export type FolderSortMode = "custom" | "date" | "name" | "color";

export type FolderItemType = "folder" | "file" | "note";

export type FolderEntry = {
  id: string;
  parentId: string | null;
  type: FolderItemType;
  name: string;
  description?: string;
  color: string;
  createdAt: number;
  imageUrl?: string;
  bannerUrl?: string;
  content?: string;
};

export type FolderDraft = Pick<
  FolderEntry,
  "name" | "description" | "color" | "imageUrl" | "bannerUrl"
>;

export type FolderFilters = {
  nameQuery: string;
  color: "all" | string;
  sortBy: FolderSortMode;
};
