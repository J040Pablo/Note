export const DB_NAME = "life_organizer.db";

export const createTablesSQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  parentId TEXT REFERENCES folders(id) ON DELETE CASCADE,
  orderIndex INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  description TEXT,
  photoPath TEXT,
  bannerPath TEXT,
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

CREATE TABLE IF NOT EXISTS quick_notes (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  folderId TEXT REFERENCES folders(id) ON DELETE SET NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  text TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL DEFAULT 0,
  orderIndex INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 0,
  noteId TEXT REFERENCES notes(id) ON DELETE CASCADE,
  scheduledDate TEXT,
  scheduledTime TEXT,
  repeatDays TEXT NOT NULL DEFAULT '[]',
  completedDates TEXT NOT NULL DEFAULT '[]',
  reminders TEXT NOT NULL DEFAULT '[]',
  notificationIds TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY NOT NULL,
  uri TEXT NOT NULL,
  noteId TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  orderIndex INTEGER NOT NULL DEFAULT 0,
  parentFolderId TEXT REFERENCES folders(id) ON DELETE CASCADE,
  description TEXT,
  thumbnailPath TEXT,
  bannerPath TEXT
);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

