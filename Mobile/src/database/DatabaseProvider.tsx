import React, { createContext, useContext, useEffect, useState } from "react";
import * as SQLite from "expo-sqlite";
import { initializeDB } from "@db/database";

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
    initializeDB()
      .then((database) => {
        setDb(database);
      })
      .catch((e) => {
        console.error("[db] init failed in DatabaseProvider", e);
      })
      .finally(() => {
        setReady(true);
      });
  }, []);

  return <DatabaseContext.Provider value={{ db, ready }}>{children}</DatabaseContext.Provider>;
};

export const useDatabase = () => useContext(DatabaseContext);

