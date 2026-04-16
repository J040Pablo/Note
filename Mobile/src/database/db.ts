import * as SQLite from "expo-sqlite";
import { DB_NAME, createTablesSQL } from "./schema";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let dbInstance: SQLite.SQLiteDatabase | null = null;
let initializationPromise: Promise<void> | null = null;
let initialized = false;
let writeQueue: Promise<void> = Promise.resolve();

const normalizeBindValue = (value: SQLite.SQLiteBindValue | undefined): SQLite.SQLiteBindValue => {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
};

const normalizeBindParams = (params: SQLite.SQLiteBindValue[]): SQLite.SQLiteBindValue[] => {
  return params.map((p) => normalizeBindValue(p));
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const isRetryableLockError = (error: unknown): boolean => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("database is locked") ||
    message.includes("nativedatabase.execasync rejected") ||
    message.includes("nativedatabase.prepareasync rejected") ||
    message.includes("nullpointerexception")
  );
};

const logDbError = (scope: string, error: unknown): void => {
  console.error(`[db] ${scope} failed`, error);
};

const hasColumn = async (db: SQLite.SQLiteDatabase, table: string, column: string): Promise<boolean> => {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${table});`);
  return rows.some((r) => r.name === column);
};

const ensureColumn = async (
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> => {
  const exists = await hasColumn(db, table, column);
  if (!exists) {
    await db.execAsync?.(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
};

const initializeDb = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  await db.execAsync?.("PRAGMA foreign_keys = ON;");
  await db.execAsync?.("PRAGMA journal_mode = WAL;");
  await db.execAsync?.("PRAGMA busy_timeout = 5000;");
  await db.execAsync?.(createTablesSQL);

  await ensureColumn(db, "folders", "color", "TEXT");
  await ensureColumn(db, "folders", "orderIndex", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "folders", "description", "TEXT");
  await ensureColumn(db, "folders", "photoPath", "TEXT");
  await ensureColumn(db, "folders", "bannerPath", "TEXT");
  await ensureColumn(db, "folders", "updatedAt", "INTEGER NOT NULL DEFAULT 0");

  await ensureColumn(db, "quick_notes", "title", "TEXT NOT NULL DEFAULT ''");
  await ensureColumn(db, "quick_notes", "folderId", "TEXT");

  await ensureColumn(db, "tasks", "scheduledDate", "TEXT");
  await ensureColumn(db, "tasks", "scheduledTime", "TEXT");
  await ensureColumn(db, "tasks", "orderIndex", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "tasks", "updatedAt", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "tasks", "repeatDays", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(db, "tasks", "completedDates", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(db, "tasks", "reminders", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(db, "tasks", "notificationIds", "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn(db, "tasks", "parentId", "TEXT"); // subtasks support

  await ensureColumn(db, "files", "description", "TEXT");
  await ensureColumn(db, "files", "orderIndex", "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn(db, "files", "thumbnailPath", "TEXT");
  await ensureColumn(db, "files", "bannerPath", "TEXT");

  // Add globalOrder columns for unified grid ordering
  await ensureColumn(db, "folders", "globalOrder", "INTEGER");
  await ensureColumn(db, "notes", "globalOrder", "INTEGER");
  await ensureColumn(db, "quick_notes", "globalOrder", "INTEGER");
  await ensureColumn(db, "files", "globalOrder", "INTEGER");

  // Notifications
  await ensureColumn(db, "notifications", "title", "TEXT");
  await ensureColumn(db, "notifications", "body", "TEXT");
  await ensureColumn(db, "notifications", "taskId", "TEXT");
  await ensureColumn(db, "notifications", "read", "INTEGER DEFAULT 0");
  await ensureColumn(db, "notifications", "receivedAt", "INTEGER");

  // Fix existing NULL globalOrder values - set to 9999 (will sort to end, maintains legacy order)
  await db.execAsync?.(`
    UPDATE folders SET globalOrder = 9999 WHERE globalOrder IS NULL;
    UPDATE notes SET globalOrder = 9999 WHERE globalOrder IS NULL;
    UPDATE quick_notes SET globalOrder = 9999 WHERE globalOrder IS NULL;
    UPDATE files SET globalOrder = 9999 WHERE globalOrder IS NULL;
  `);

  await db.execAsync?.(`
    UPDATE folders
    SET orderIndex = createdAt
    WHERE orderIndex = 0;

    UPDATE folders
    SET updatedAt = createdAt
    WHERE updatedAt IS NULL OR updatedAt = 0;

    UPDATE files
    SET orderIndex = createdAt
    WHERE orderIndex = 0;

    UPDATE tasks
    SET orderIndex = CAST(id AS INTEGER)
    WHERE orderIndex = 0;

    UPDATE tasks
    SET notificationIds = '[]'
    WHERE notificationIds IS NULL OR notificationIds = '';

    UPDATE tasks
    SET reminders = '[]'
    WHERE reminders IS NULL OR reminders = '';

    UPDATE tasks
    SET updatedAt = CASE
      WHEN CAST(id AS INTEGER) > 0 THEN CAST(id AS INTEGER)
      ELSE strftime('%s','now') * 1000
    END
    WHERE updatedAt IS NULL OR updatedAt = 0;

    UPDATE quick_notes
    SET title = 'Quick Note'
    WHERE title IS NULL OR title = '';
  `);
};

const ensureInitialized = async (db: SQLite.SQLiteDatabase): Promise<void> => {
  if (initialized) return;

  if (!initializationPromise) {
    initializationPromise = (async () => {
      await initializeDb(db);
      initialized = true;
      console.log("[db] initialization completed");
    })();

    initializationPromise.catch((error) => {
      initialized = false;
      initializationPromise = null;
      logDbError("initialization", error);
    });
  }

  await initializationPromise;
};

const runWriteWithRetry = async <T>(scope: string, operation: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const db = await getDB();
      return await operation(db);
    } catch (error) {
      lastError = error;
      if (!isRetryableLockError(error) || attempt === 5) {
        logDbError(scope, error);
        throw error;
      }
      await sleep(120 * attempt);
    }
  }

  logDbError(scope, lastError);
  throw lastError;
};

const enqueueWrite = async <T>(scope: string, operation: (db: SQLite.SQLiteDatabase) => Promise<T>): Promise<T> => {
  const run = () => runWriteWithRetry(scope, operation);
  const task = writeQueue.then(run, run);
  writeQueue = task.then(() => undefined, () => undefined);
  return task;
};

export const runDbWrite = async (
  sql: string,
  ...params: SQLite.SQLiteBindValue[]
): Promise<SQLite.SQLiteRunResult> => {
  const normalized = normalizeBindParams(params);
  return enqueueWrite(`write: ${sql}`, (db) => db.runAsync(sql, ...normalized));
};

export const withDbWriteTransaction = async <T>(
  scope: string,
  operation: (db: SQLite.SQLiteDatabase) => Promise<T>
): Promise<T> => {
  return enqueueWrite(`tx: ${scope}`, async (db) => {
    let result!: T;
    await db.withTransactionAsync(async () => {
      result = await operation(db);
    });
    return result;
  });
};

export const getDB = (): Promise<SQLite.SQLiteDatabase> => {
  if (!dbPromise) {
    dbPromise = (async () => {
      let lastError: unknown;
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        try {
          if (!dbInstance) {
            dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
          }
          await ensureInitialized(dbInstance);
          return dbInstance;
        } catch (error) {
          lastError = error;
          const message = getErrorMessage(error).toLowerCase();
          const retryable =
            message.includes("database is locked") ||
            message.includes("nativedatabase.execasync rejected") ||
            message.includes("no such column: orderindex");
          if (!retryable || attempt === 5) {
            logDbError("open database", error);
            throw error;
          }
          await sleep(120 * attempt);
        }
      }
      throw lastError;
    })();
    dbPromise.catch(() => {
      dbPromise = null;
      dbInstance = null;
      initialized = false;
      initializationPromise = null;
    });
  }
  return dbPromise;
};

export const getDb = getDB;

export const initializeDB = async (): Promise<SQLite.SQLiteDatabase> => {
  return getDB();
};

