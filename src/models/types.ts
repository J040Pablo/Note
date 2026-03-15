export type ID = string;

export interface Folder {
  id: ID;
  name: string;
  parentId: ID | null;
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
  priority: boolean;
  noteId: ID | null;
}

export interface Attachment {
  id: ID;
  uri: string;
  noteId: ID;
}

