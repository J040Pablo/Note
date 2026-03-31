// Central sync bridge — subscribes to WebSocket sync messages and applies them
// to the web services layer. Emits typed events so React components can re-render
// without page reload.

import {
  subscribeTaskSyncMessages,
  type SyncFolder,
  type SyncIncomingMessage,
  type SyncNote,
  type SyncQuickNote,
  type SyncTask,
} from "../features/tasks/sync";
import { loadData, markSynced, saveData, type DataNote, type DataQuickNote, type DataFolder } from "./webData";
import type { TaskItem } from "../features/tasks/types";

// ─── Event system ────────────────────────────────────────────────────────────

export type SyncBridgeEvent =
  | { type: "FULL_SYNC" }
  | { type: "TASK_UPSERT"; task: TaskItem }
  | { type: "TASK_DELETE"; id: string }
  | { type: "FOLDER_UPSERT"; folder: DataFolder }
  | { type: "FOLDER_DELETE"; id: string }
  | { type: "NOTE_UPSERT"; note: DataNote }
  | { type: "NOTE_DELETE"; id: string }
  | { type: "QUICKNOTE_UPSERT"; quickNote: DataQuickNote }
  | { type: "QUICKNOTE_DELETE"; id: string };

type SyncBridgeListener = (event: SyncBridgeEvent) => void;

const listeners = new Set<SyncBridgeListener>();

export const subscribeSyncBridge = (listener: SyncBridgeListener): (() => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const emit = (event: SyncBridgeEvent) => {
  listeners.forEach((fn) => {
    try {
      fn(event);
    } catch (err) {
      console.warn("[syncBridge] listener error", err);
    }
  });
};

// ─── Mappers ─────────────────────────────────────────────────────────────────

const syncTaskToTaskItem = (task: SyncTask, fallbackOrder = 0): TaskItem => ({
  id: task.id,
  title: task.title,
  completed: !!task.completed,
  priority: task.priority,
  dueDate: typeof task.dueDate === "string" ? task.dueDate : typeof task.date === "string" ? task.date : null,
  dueTime: typeof task.dueTime === "string" ? task.dueTime : null,
  repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
  order: typeof task.order === "number" ? task.order : fallbackOrder,
  createdAt: typeof task.createdAt === "number" ? task.createdAt : task.updatedAt,
  updatedAt: task.updatedAt,
  parentId: typeof task.parentId === "string" ? task.parentId : null,
  noteId: typeof task.noteId === "string" ? task.noteId : null,
});

const syncFolderToDataFolder = (folder: SyncFolder): DataFolder => ({
  id: folder.id,
  parentId: folder.parentId,
  name: folder.name,
  description: folder.description,
  color: folder.color,
  createdAt: folder.createdAt,
  updatedAt: folder.updatedAt,
  imageUrl: folder.imageUrl,
  bannerUrl: folder.bannerUrl,
});

const syncNoteToDataNote = (note: SyncNote): DataNote => {
  const folderId = (note as SyncNote & { folderId?: string | null }).folderId;
  return {
    id: note.id,
    parentId: note.parentId ?? folderId ?? null,
    title: note.title || "Untitled note",
    content: note.content ?? "",
    folderId: folderId ?? note.parentId ?? null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
};

const syncQuickNoteToData = (q: SyncQuickNote): DataQuickNote => {
  const content = (q as SyncQuickNote & { content?: string }).content;
  return {
    id: q.id,
    title: q.title ?? "Quick Note",
    text: q.text ?? content ?? "",
    content: content ?? q.text ?? "",
    folderId: q.folderId ?? null,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
};

// ─── Message handlers ────────────────────────────────────────────────────────

const handleFullSync = (message: SyncIncomingMessage) => {
  if (message.type !== "INIT") return;

  const payload = message.payload;
  const now = Date.now();

  const folders = (payload.folders ?? []).map(syncFolderToDataFolder);
  const notes = (payload.notes ?? []).map(syncNoteToDataNote);
  const quickNotes = (payload.quickNotes ?? []).map(syncQuickNoteToData);
  const tasks = payload.tasks.map((t, i) => {
    const item = syncTaskToTaskItem(t, i);
    return {
      id: item.id,
      title: item.title,
      completed: item.completed,
      priority: item.priority,
      dueDate: item.dueDate,
      dueTime: item.dueTime,
      repeatDays: item.repeatDays,
      order: item.order,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      parentId: item.parentId ?? null,
      noteId: item.noteId ?? null,
    };
  });

  // Replace all local data
  markSynced();
  saveData({ folders, notes, quickNotes, tasks });

  emit({ type: "FULL_SYNC" });
};

const handleEntityMessage = (message: SyncIncomingMessage) => {
  const store = loadData();

  switch (message.type) {
    case "UPSERT_FOLDER": {
      const folder = syncFolderToDataFolder(message.payload);
      const exists = store.folders.some((f) => f.id === folder.id);
      store.folders = exists
        ? store.folders.map((f) => (f.id === folder.id ? folder : f))
        : [folder, ...store.folders];
      saveData(store);
      emit({ type: "FOLDER_UPSERT", folder });
      break;
    }
    case "DELETE_FOLDER": {
      store.folders = store.folders.filter((f) => f.id !== message.payload.id);
      saveData(store);
      emit({ type: "FOLDER_DELETE", id: message.payload.id });
      break;
    }
    case "UPSERT_NOTE": {
      const note = syncNoteToDataNote(message.payload);
      const exists = store.notes.some((n) => n.id === note.id);
      store.notes = exists
        ? store.notes.map((n) => (n.id === note.id ? note : n))
        : [note, ...store.notes];
      saveData(store);
      emit({ type: "NOTE_UPSERT", note });
      break;
    }
    case "DELETE_NOTE": {
      store.notes = store.notes.filter((n) => n.id !== message.payload.id);
      saveData(store);
      emit({ type: "NOTE_DELETE", id: message.payload.id });
      break;
    }
    case "UPSERT_QUICK_NOTE": {
      const quickNote = syncQuickNoteToData(message.payload);
      const exists = store.quickNotes.some((q) => q.id === quickNote.id);
      store.quickNotes = exists
        ? store.quickNotes.map((q) => (q.id === quickNote.id ? quickNote : q))
        : [quickNote, ...store.quickNotes];
      saveData(store);
      emit({ type: "QUICKNOTE_UPSERT", quickNote });
      break;
    }
    case "DELETE_QUICK_NOTE": {
      store.quickNotes = store.quickNotes.filter((q) => q.id !== message.payload.id);
      saveData(store);
      emit({ type: "QUICKNOTE_DELETE", id: message.payload.id });
      break;
    }
    case "UPSERT_TASK": {
      const task = syncTaskToTaskItem(message.payload, store.tasks.length);
      const taskData = {
        id: task.id,
        title: task.title,
        completed: task.completed,
        priority: task.priority,
        dueDate: task.dueDate,
        dueTime: task.dueTime,
        repeatDays: task.repeatDays,
        order: task.order,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        parentId: task.parentId ?? null,
        noteId: task.noteId ?? null,
      };
      const exists = store.tasks.some((t) => t.id === task.id);
      store.tasks = exists
        ? store.tasks.map((t) => (t.id === task.id ? taskData : t))
        : [taskData, ...store.tasks];
      saveData(store);
      emit({ type: "TASK_UPSERT", task });
      break;
    }
    case "DELETE_TASK": {
      store.tasks = store.tasks.filter((t) => t.id !== message.payload.id);
      saveData(store);
      emit({ type: "TASK_DELETE", id: message.payload.id });
      break;
    }
    default:
      break;
  }
};

// ─── Initialize ──────────────────────────────────────────────────────────────

let unsubscribeSync: (() => void) | null = null;

export const initSyncBridge = (): (() => void) => {
  if (unsubscribeSync) return unsubscribeSync;

  unsubscribeSync = subscribeTaskSyncMessages((message: SyncIncomingMessage) => {
    if (message.type === "INIT" || message.type === "INIT_DATA" || message.type === "FULL_SYNC") {
      handleFullSync(
        message.type === "INIT"
          ? message
          : ({
              type: "INIT",
              payload: message.payload as {
                folders?: SyncFolder[];
                notes?: SyncNote[];
                quickNotes?: SyncQuickNote[];
                tasks: SyncTask[];
              },
            } as SyncIncomingMessage)
      );
      return;
    }

    handleEntityMessage(message);
  });

  return () => {
    if (unsubscribeSync) {
      unsubscribeSync();
      unsubscribeSync = null;
    }
  };
};

// Auto-export the task mapper for use by other modules
export { syncTaskToTaskItem };
