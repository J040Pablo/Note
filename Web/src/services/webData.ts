// Single source of truth for persisted Web app data.
// Data is normalized on read/write so screens can safely consume a stable shape.

const STORAGE_KEY = "note.web.data.v1";
const SYNCED_FLAG_KEY = "note.web.synced.v1";

export type DataFolder = {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string;
  bannerUrl?: string;
};

export type DataNote = {
  id: string;
  parentId: string | null;
  title: string;
  content: string;
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type DataQuickNote = {
  id: string;
  title: string;
  text: string;
  content: string;
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type DataTask = {
  id: string;
  title: string;
  completed: boolean;
  completedDates?: string[];
  priority?: "low" | "medium" | "high";
  scheduledDate?: string | null;
  dueDate?: string | null;
  repeatDays?: number[];
  createdAt: number;
  updatedAt: number;
  dueTime?: string | null;
  order?: number;
  parentId?: string | null;
  noteId?: string | null;
};

export type DataStore = {
  folders: DataFolder[];
  notes: DataNote[];
  quickNotes: DataQuickNote[];
  tasks: DataTask[];
};

const emptyData = (): DataStore => ({
  folders: [],
  notes: [],
  quickNotes: [],
  tasks: [],
});

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asString = (value: unknown, fallback: string): string =>
  typeof value === "string" && value.trim().length > 0 ? value : fallback;

const asNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asNullableString = (value: unknown): string | null =>
  typeof value === "string" ? value : null;

const asPriority = (value: unknown): DataTask["priority"] =>
  value === "low" || value === "medium" || value === "high" ? value : "medium";

const asRepeatDays = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((day): day is number => typeof day === "number") : [];

const asDateKeys = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry))
    : [];

const normalizeFolder = (input: unknown, index: number): DataFolder => {
  const now = Date.now();
  const item = asRecord(input);
  return {
    id: asString(item.id, `folder-${now}-${index}`),
    parentId: asNullableString(item.parentId),
    name: asString(item.name, "Untitled folder"),
    description: typeof item.description === "string" ? item.description : undefined,
    color: typeof item.color === "string" ? item.color : undefined,
    createdAt: asNumber(item.createdAt, now),
    updatedAt: asNumber(item.updatedAt, asNumber(item.createdAt, now)),
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
    bannerUrl: typeof item.bannerUrl === "string" ? item.bannerUrl : undefined,
  };
};

const normalizeNote = (input: unknown, index: number): DataNote => {
  const now = Date.now();
  const item = asRecord(input);
  const folderId = asNullableString(item.folderId);
  return {
    id: asString(item.id, `note-${now}-${index}`),
    parentId: asNullableString(item.parentId) ?? folderId,
    title: asString(item.title, asString(item.name, "Untitled note")),
    content: typeof item.content === "string" ? item.content : "",
    folderId,
    createdAt: asNumber(item.createdAt, now),
    updatedAt: asNumber(item.updatedAt, asNumber(item.createdAt, now)),
  };
};

const normalizeQuickNote = (input: unknown, index: number): DataQuickNote => {
  const now = Date.now();
  const item = asRecord(input);
  const text = typeof item.text === "string" ? item.text : "";
  const content = typeof item.content === "string" ? item.content : text;
  return {
    id: asString(item.id, `quick-note-${now}-${index}`),
    title: asString(item.title, "Quick Note"),
    text: text || content,
    content: content || text,
    folderId: asNullableString(item.folderId),
    createdAt: asNumber(item.createdAt, now),
    updatedAt: asNumber(item.updatedAt, asNumber(item.createdAt, now)),
  };
};

const normalizeTask = (input: unknown, index: number): DataTask => {
  const now = Date.now();
  const item = asRecord(input);
  const createdAt = asNumber(item.createdAt, now);
  const completedDates = asDateKeys(item.completedDates);
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: asString(item.id, `task-${now}-${index}`),
    title: asString(item.title, "Untitled task"),
    completed: completedDates.length > 0 ? completedDates.includes(today) : Boolean(item.completed),
    completedDates,
    priority: asPriority(item.priority),
    scheduledDate: typeof item.scheduledDate === "string" ? item.scheduledDate : typeof item.dueDate === "string" ? item.dueDate : null,
    dueDate: typeof item.dueDate === "string" ? item.dueDate : null,
    repeatDays: asRepeatDays(item.repeatDays),
    createdAt,
    updatedAt: asNumber(item.updatedAt, createdAt),
    dueTime: typeof item.dueTime === "string" ? item.dueTime : null,
    order: asNumber(item.order, index),
    parentId: asNullableString(item.parentId),
    noteId: asNullableString(item.noteId),
  };
};

const normalizeData = (input: unknown): DataStore => {
  const candidate = asRecord(input);
  const folders = Array.isArray(candidate.folders) ? candidate.folders : [];
  const notes = Array.isArray(candidate.notes) ? candidate.notes : [];
  const quickNotes = Array.isArray(candidate.quickNotes) ? candidate.quickNotes : [];
  const tasks = Array.isArray(candidate.tasks) ? candidate.tasks : [];
  return {
    folders: folders.map(normalizeFolder),
    notes: notes.map(normalizeNote),
    quickNotes: quickNotes.map(normalizeQuickNote),
    tasks: tasks.map(normalizeTask),
  };
};

// Safely reads from localStorage. Returns empty data if synced before, else empty.
export const loadData = (): DataStore => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const hasSynced = localStorage.getItem(SYNCED_FLAG_KEY) === "1";

    if (!raw) {
      if (hasSynced) {
        const empty = emptyData();
        saveData(empty);
        return empty;
      }

      const empty = emptyData();
      saveData(empty);
      return empty;
    }

    return normalizeData(JSON.parse(raw));
  } catch {
    const hasSynced = localStorage.getItem(SYNCED_FLAG_KEY) === "1";

    if (hasSynced) {
      const empty = emptyData();
      saveData(empty);
      return empty;
    }

    const empty = emptyData();
    saveData(empty);
    return empty;
  }
};

// Safely persists a normalized shape so future reads remain stable.
export const saveData = (data: DataStore): void => {
  try {
    const normalized = normalizeData(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore storage errors to keep UI/runtime stable.
  }
};

export const markSynced = (): void => {
  localStorage.setItem(SYNCED_FLAG_KEY, "1");
};

export const getFolders = (): DataFolder[] => loadData().folders;

export const getNotes = (): DataNote[] => loadData().notes;

export const getQuickNotes = (): DataQuickNote[] => loadData().quickNotes;

export const getTasks = (): DataTask[] => loadData().tasks;

export const importCompleteStore = (data: DataStore): void => {
  saveData(data);
};
