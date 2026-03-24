import { getDB, runDbWrite } from "@db/database";

const TASK_PREFS_KEY = "task_preferences";

export interface TaskPreferences {
  showCompleted: boolean;
  highlightRecurring: boolean;
  startWeekOnMonday: boolean;
}

const DEFAULT_PREFS: TaskPreferences = {
  showCompleted: true,
  highlightRecurring: true,
  startWeekOnMonday: false
};

const parsePrefs = (value: unknown): TaskPreferences => {
  if (!value || typeof value !== "string") return DEFAULT_PREFS;
  try {
    const parsed = JSON.parse(value) as Partial<TaskPreferences>;
    return {
      showCompleted: parsed.showCompleted ?? DEFAULT_PREFS.showCompleted,
      highlightRecurring: parsed.highlightRecurring ?? DEFAULT_PREFS.highlightRecurring,
      startWeekOnMonday: parsed.startWeekOnMonday ?? DEFAULT_PREFS.startWeekOnMonday
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

export const getTaskPreferences = async (): Promise<TaskPreferences> => {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = ?",
    TASK_PREFS_KEY
  );
  return parsePrefs(row?.value);
};

export const saveTaskPreferences = async (prefs: TaskPreferences): Promise<void> => {
  await runDbWrite(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    TASK_PREFS_KEY,
    JSON.stringify(prefs)
  );
};
