import React, { createContext, useContext, useEffect, useState } from "react";
import * as SQLite from "expo-sqlite";
import { createTablesSQL, DB_NAME } from "./schema";

type SQLiteDatabase = SQLite.SQLiteDatabase;

interface DatabaseContextValue {
  db: SQLiteDatabase | null;
  ready: boolean;
}

const DatabaseContext = createContext<DatabaseContextValue>({
  db: null,
  ready: false
});

export const DatabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const database = SQLite.openDatabaseSync?.(DB_NAME) ?? SQLite.openDatabase(DB_NAME);
    setDb(database);

    database.withTransactionAsync
      ? database.withTransactionAsync(async () => {
          await database.execAsync?.(createTablesSQL);
          try {
            await database.execAsync?.("ALTER TABLE folders ADD COLUMN color TEXT;");
          } catch {
            // Column already exists.
          }
          try {
            await database.execAsync?.("ALTER TABLE tasks ADD COLUMN scheduledDate TEXT;");
          } catch {
            // Column already exists.
          }
          try {
            await database.execAsync?.("ALTER TABLE tasks ADD COLUMN repeatDays TEXT NOT NULL DEFAULT '[]';");
          } catch {
            // Column already exists.
          }
          try {
            await database.execAsync?.("ALTER TABLE tasks ADD COLUMN completedDates TEXT NOT NULL DEFAULT '[]';");
          } catch {
            // Column already exists.
          }
        })
          .then(() => setReady(true))
          .catch((e) => {
            console.warn("DB init error", e);
            setReady(true);
          })
      : database.transaction((tx) => {
          createTablesSQL
            .split(";")
            .map((s) => s.trim())
            .filter(Boolean)
            .forEach((sql) => {
              tx.executeSql(sql + ";");
            });
          setReady(true);
        });
  }, []);

  return <DatabaseContext.Provider value={{ db, ready }}>{children}</DatabaseContext.Provider>;
};

export const useDatabase = () => useContext(DatabaseContext);

