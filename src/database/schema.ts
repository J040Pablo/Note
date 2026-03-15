export const DB_NAME = "life_organizer.db";

export const createTablesSQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  parentId TEXT REFERENCES folders(id) ON DELETE CASCADE,
  color TEXT,
  createdAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  folderId TEXT REFERENCES folders(id) ON DELETE SET NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,
  scheduledDate TEXT,
  repeatDays TEXT NOT NULL DEFAULT '[]',
  completedDates TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY NOT NULL,
  uri TEXT NOT NULL,
  noteId TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE
);
`;

