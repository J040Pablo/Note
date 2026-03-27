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
  imageUrl?: string;
  bannerUrl?: string;
};

export type DataNote = {
  id: string;
  parentId: string | null;
  title: string;
  content: string;
  createdAt: number;
};

export type DataQuickNote = {
  id: string;
  text: string;
  createdAt: number;
};

export type DataTask = {
  id: string;
  title: string;
  completed: boolean;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  repeatDays?: number[];
  createdAt: number;
  updatedAt: number;
  // Kept optional to preserve current behavior in task UI without changing layout.
  dueTime?: string | null;
  order?: number;
};

export type DataStore = {
  folders: DataFolder[];
  notes: DataNote[];
  quickNotes: DataQuickNote[];
  tasks: DataTask[];
};

const seededData: DataStore = {
  folders: [
    {
      id: "f-1",
      parentId: null,
      name: "Linux",
      description: "Kernel, shell and distro notes",
      color: "#3b82f6",
      createdAt: Date.now() - 1000 * 60 * 60 * 8,
    },
    {
      id: "f-2",
      parentId: null,
      name: "C Language",
      description: "Low-level references",
      color: "#3b82f6",
      createdAt: Date.now() - 1000 * 60 * 60 * 5,
    },
  ],
  notes: [
    {
      id: "n-1",
      parentId: "f-1",
      title: "Linux quick commands",
      content: "sudo apt update\nls -la\ncat /etc/os-release",
      createdAt: Date.now() - 1000 * 60 * 20,
    },
  ],
  quickNotes: [
    {
      id: "qn-1",
      text: "Refine quick note UX",
      createdAt: Date.now() - 1000 * 60 * 10,
    },
  ],
  tasks: [
    {
      id: "t-1",
      title: "Review folder structure",
      completed: false,
      priority: "medium",
      dueDate: null,
      repeatDays: [],
      order: 0,
      createdAt: Date.now() - 1000 * 60 * 30,
      updatedAt: Date.now() - 1000 * 60 * 30,
    },
  ],
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
    imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : undefined,
    bannerUrl: typeof item.bannerUrl === "string" ? item.bannerUrl : undefined,
  };
};

const normalizeNote = (input: unknown, index: number): DataNote => {
  const now = Date.now();
  const item = asRecord(input);
  return {
    id: asString(item.id, `note-${now}-${index}`),
    parentId: asNullableString(item.parentId),
    title: asString(item.title, asString(item.name, "Untitled note")),
    content: typeof item.content === "string" ? item.content : "",
    createdAt: asNumber(item.createdAt, now),
  };
};

const normalizeQuickNote = (input: unknown, index: number): DataQuickNote => {
  const now = Date.now();
  const item = asRecord(input);
  return {
    id: asString(item.id, `quick-note-${now}-${index}`),
    text: asString(item.text, ""),
    createdAt: asNumber(item.createdAt, now),
  };
};

const normalizeTask = (input: unknown, index: number): DataTask => {
  const now = Date.now();
  const item = asRecord(input);
  const createdAt = asNumber(item.createdAt, now);
  return {
    id: asString(item.id, `task-${now}-${index}`),
    title: asString(item.title, "Untitled task"),
    completed: Boolean(item.completed),
    priority: asPriority(item.priority),
    dueDate: typeof item.dueDate === "string" ? item.dueDate : null,
    repeatDays: asRepeatDays(item.repeatDays),
    createdAt,
    updatedAt: asNumber(item.updatedAt, createdAt),
    dueTime: typeof item.dueTime === "string" ? item.dueTime : null,
    order: asNumber(item.order, index),
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

// Safely reads from localStorage and seeds only the very first time.
export const loadData = (): DataStore => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const hasSynced = localStorage.getItem(SYNCED_FLAG_KEY) === "1";

    if (!raw) {
      // If already synced, NEVER reseed fake data
      if (hasSynced) {
        const empty = emptyData();
        saveData(empty);
        return empty;
      }

      // First app load only
      saveData(seededData);
      return seededData;
    }

    return normalizeData(JSON.parse(raw));
  } catch {
    const hasSynced = localStorage.getItem(SYNCED_FLAG_KEY) === "1";

    if (hasSynced) {
      const empty = emptyData();
      saveData(empty);
      return empty;
    }

    saveData(seededData);
    return seededData;
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

export const getFolders = (): DataFolder[] => loadData().folders;

export const getNotes = (): DataNote[] => loadData().notes;

export const getQuickNotes = (): DataQuickNote[] => loadData().quickNotes;

export const getTasks = (): DataTask[] => loadData().tasks;
