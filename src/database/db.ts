import * as SQLite from "expo-sqlite";
import { DB_NAME, createTablesSQL } from "./schema";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const getDb = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync?.(createTablesSQL);
      try {
        await db.execAsync?.("ALTER TABLE folders ADD COLUMN color TEXT;");
      } catch {
        // Column already exists on updated databases.
      }
      try {
        await db.execAsync?.("ALTER TABLE tasks ADD COLUMN scheduledDate TEXT;");
      } catch {
        // Column already exists.
      }
      try {
        await db.execAsync?.("ALTER TABLE tasks ADD COLUMN repeatDays TEXT NOT NULL DEFAULT '[]';");
      } catch {
        // Column already exists.
      }
      try {
        await db.execAsync?.("ALTER TABLE tasks ADD COLUMN completedDates TEXT NOT NULL DEFAULT '[]';");
      } catch {
        // Column already exists.
      }
      return db;
    })();
  }
  return dbPromise;
};

