export type SyncPriority = "low" | "medium" | "high";
import { saveData } from "../../services/webData";

export type SyncFolder = {
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

export type SyncNote = {
  id: string;
  parentId: string | null;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
};

export type SyncQuickNote = {
  id: string;
  text: string;
  createdAt: number;
  updatedAt: number;
};

export type SyncTask = {
  id: string;
  title: string;
  completed: boolean;
  priority: SyncPriority;
  date?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  repeatDays?: number[];
  order?: number;
  createdAt?: number;
  updatedAt: number;
};

export type SyncIncomingMessage =
  | {
      type: "INIT";
      payload: {
        folders?: SyncFolder[];
        notes?: SyncNote[];
        quickNotes?: SyncQuickNote[];
        tasks: SyncTask[];
      };
    }
  | { type: "UPSERT_FOLDER"; payload: SyncFolder }
  | { type: "DELETE_FOLDER"; payload: { id: string } }
  | { type: "UPSERT_NOTE"; payload: SyncNote }
  | { type: "DELETE_NOTE"; payload: { id: string } }
  | { type: "UPSERT_QUICK_NOTE"; payload: SyncQuickNote }
  | { type: "DELETE_QUICK_NOTE"; payload: { id: string } }
  | { type: "UPSERT_TASK"; payload: SyncTask }
  | { type: "DELETE_TASK"; payload: { id: string } }
  // Backward-compatible message support.
  | {
      type: "INIT_DATA";
      payload: {
        notes: unknown[];
        tasks: SyncTask[];
        folders: unknown[];
        quickNotes?: SyncQuickNote[];
        files?: Array<{ id: string; name: string; path: string }>;
      };
    }
  | {
      type: "FULL_SYNC";
      payload: {
        folders?: SyncFolder[];
        notes?: SyncNote[];
        quickNotes?: SyncQuickNote[];
        tasks?: SyncTask[];
      };
    }
  | { type: "TASK_CREATED"; payload: SyncTask }
  | { type: "TASK_UPDATED"; payload: SyncTask }
  | { type: "TASK_DELETED"; payload: { id: string; updatedAt: number } };

export type TaskSyncEventType = "TASK_CREATE" | "TASK_UPDATE" | "TASK_DELETE" | "TASK_TOGGLE";

export type TaskSyncEvent = {
  type: TaskSyncEventType;
  taskId: string;
  payload?: Record<string, unknown>;
  timestamp: number;
};

type SyncStatus = "disconnected" | "connecting" | "connected";

type MessageListener = (message: SyncIncomingMessage) => void;
type StatusListener = (status: SyncStatus) => void;

let socket: WebSocket | null = null;
let status: SyncStatus = "disconnected";
let activeUrl = "";
let hasAppliedFullSync = false;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

const emitStatus = (nextStatus: SyncStatus) => {
  status = nextStatus;
  statusListeners.forEach((listener) => listener(status));
};

const emitMessage = (message: SyncIncomingMessage) => {
  messageListeners.forEach((listener) => listener(message));
};

const isFullDataSyncMessage = (
  message: SyncIncomingMessage
): message is Extract<SyncIncomingMessage, { type: "INIT" | "INIT_DATA" | "FULL_SYNC" }> =>
  message.type === "INIT" || message.type === "INIT_DATA" || message.type === "FULL_SYNC";

// normalize mobile data to web format
const normalizeSyncData = (payload: {
  folders?: SyncFolder[];
  notes?: SyncNote[];
  quickNotes?: SyncQuickNote[];
  tasks?: SyncTask[];
}) => {
  const now = Date.now();

  return {
    folders: (payload.folders ?? []).map((f, index) => ({
      id: String(f.id ?? `folder-${now}-${index}`),
      name: String(f.name ?? "Untitled folder"),
      parentId: typeof f.parentId === "string" ? f.parentId : null,
      createdAt: typeof f.createdAt === "number" ? f.createdAt : now,
      description: typeof f.description === "string" ? f.description : undefined,
      color: typeof f.color === "string" ? f.color : undefined,
      imageUrl: typeof f.imageUrl === "string" ? f.imageUrl : undefined,
      bannerUrl: typeof f.bannerUrl === "string" ? f.bannerUrl : undefined,
    })),
    notes: (payload.notes ?? []).map((n, index) => {
      const folderId = (n as SyncNote & { folderId?: string | null }).folderId;
      return {
        id: String(n.id ?? `note-${now}-${index}`),
        title: String(n.title ?? "Untitled note"),
        content: typeof n.content === "string" ? n.content : "",
        parentId: typeof n.parentId === "string" ? n.parentId : typeof folderId === "string" ? folderId : null,
        createdAt: typeof n.createdAt === "number" ? n.createdAt : now,
      };
    }),
    quickNotes: (payload.quickNotes ?? []).map((q, index) => {
      const content = (q as SyncQuickNote & { content?: string }).content;
      const title = (q as SyncQuickNote & { title?: string }).title;
      return {
        id: String(q.id ?? `quick-note-${now}-${index}`),
        text:
          typeof q.text === "string"
            ? q.text
            : typeof content === "string"
            ? content
            : typeof title === "string"
            ? title
            : "",
        createdAt: typeof q.createdAt === "number" ? q.createdAt : now,
      };
    }),
    tasks: (payload.tasks ?? []).map((t, index) => ({
      id: String(t.id ?? `task-${now}-${index}`),
      title: String(t.title ?? "Untitled task"),
      completed: Boolean(t.completed),
      priority: t.priority === "low" || t.priority === "medium" || t.priority === "high" ? t.priority : "medium",
      dueDate: typeof t.dueDate === "string" ? t.dueDate : typeof t.date === "string" ? t.date : null,
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : now,
      createdAt: typeof t.createdAt === "number" ? t.createdAt : now,
      dueTime: typeof t.dueTime === "string" ? t.dueTime : null,
      repeatDays: Array.isArray(t.repeatDays)
        ? t.repeatDays.filter((day): day is number => typeof day === "number")
        : [],
      order: typeof t.order === "number" ? t.order : index,
    })),
  };
};

const replaceLocalDataWithMobileSync = (
  message: Extract<SyncIncomingMessage, { type: "INIT" | "INIT_DATA" | "FULL_SYNC" }>
) => {
  const payload = message.payload as {
    folders?: SyncFolder[];
    notes?: SyncNote[];
    quickNotes?: SyncQuickNote[];
    tasks?: SyncTask[];
  };
  console.log("[FULL_SYNC RECEIVED RAW]", payload);
  console.log("[SYNC DATA RECEIVED]", payload);

  if (
    !Array.isArray(payload.folders) ||
    !Array.isArray(payload.notes) ||
    !Array.isArray(payload.quickNotes) ||
    !Array.isArray(payload.tasks)
  ) {
    console.error("[SYNC ERROR] Invalid FULL_SYNC payload", {
      folders: payload.folders,
      notes: payload.notes,
      quickNotes: payload.quickNotes,
      tasks: payload.tasks,
    });
    // TEMP: allow partial payload for debugging
  }

  // clear old data
  localStorage.removeItem("note.web.data.v1");
  localStorage.setItem("note.web.synced.v1", "1");

  const normalized = normalizeSyncData(payload);
  console.log("[NORMALIZED DATA]", normalized);

  // replace invalid structure
  saveData(normalized);
  console.log("[SAVED TO STORAGE]", localStorage.getItem("note.web.data.v1"));

  // force UI refresh after sync
  window.location.reload();
};

const safeParseIncoming = (raw: string): SyncIncomingMessage | null => {
  try {
    const parsed = JSON.parse(raw) as SyncIncomingMessage;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const sendRaw = (payload: unknown) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(payload));
};

const readTimestamp = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

// conflict check here
const shouldApplyIncoming = (incoming: Record<string, unknown>, current?: Record<string, unknown>) =>
  readTimestamp(incoming.updatedAt) >= readTimestamp(current?.updatedAt);

const entityCache = {
  folders: new Map<string, SyncFolder>(),
  notes: new Map<string, SyncNote>(),
  quickNotes: new Map<string, SyncQuickNote>(),
  tasks: new Map<string, SyncTask>(),
};

const applyInitCache = (payload: {
  folders?: SyncFolder[];
  notes?: SyncNote[];
  quickNotes?: SyncQuickNote[];
  tasks?: SyncTask[];
}) => {
  entityCache.folders.clear();
  entityCache.notes.clear();
  entityCache.quickNotes.clear();
  entityCache.tasks.clear();
  (payload.folders ?? []).forEach((folder) => entityCache.folders.set(folder.id, folder));
  (payload.notes ?? []).forEach((note) => entityCache.notes.set(note.id, note));
  (payload.quickNotes ?? []).forEach((quickNote) => entityCache.quickNotes.set(quickNote.id, quickNote));
  (payload.tasks ?? []).forEach((task) => entityCache.tasks.set(task.id, task));
};

const applyConflictAware = (message: SyncIncomingMessage): SyncIncomingMessage | null => {
  if (message.type === "INIT" || message.type === "INIT_DATA" || message.type === "FULL_SYNC") {
    applyInitCache({
      folders: "folders" in message.payload ? (message.payload.folders as SyncFolder[]) : [],
      notes: "notes" in message.payload ? (message.payload.notes as SyncNote[]) : [],
      quickNotes:
        "quickNotes" in message.payload ? (message.payload.quickNotes as SyncQuickNote[]) : [],
      tasks: message.payload.tasks,
    });
    return {
      type: "INIT",
      payload: {
        folders: [...entityCache.folders.values()],
        notes: [...entityCache.notes.values()],
        quickNotes: [...entityCache.quickNotes.values()],
        tasks: [...entityCache.tasks.values()],
      },
    };
  }

  if (message.type === "UPSERT_FOLDER") {
    const current = entityCache.folders.get(message.payload.id);
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) {
      return null;
    }
    entityCache.folders.set(message.payload.id, message.payload);
    return message;
  }
  if (message.type === "DELETE_FOLDER") {
    entityCache.folders.delete(message.payload.id);
    return message;
  }
  if (message.type === "UPSERT_NOTE") {
    const current = entityCache.notes.get(message.payload.id);
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) {
      return null;
    }
    entityCache.notes.set(message.payload.id, message.payload);
    return message;
  }
  if (message.type === "DELETE_NOTE") {
    entityCache.notes.delete(message.payload.id);
    return message;
  }
  if (message.type === "UPSERT_QUICK_NOTE") {
    const current = entityCache.quickNotes.get(message.payload.id);
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) {
      return null;
    }
    entityCache.quickNotes.set(message.payload.id, message.payload);
    return message;
  }
  if (message.type === "DELETE_QUICK_NOTE") {
    entityCache.quickNotes.delete(message.payload.id);
    return message;
  }
  if (message.type === "UPSERT_TASK") {
    const current = entityCache.tasks.get(message.payload.id);
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) {
      return null;
    }
    entityCache.tasks.set(message.payload.id, message.payload);
    return message;
  }
  if (message.type === "DELETE_TASK") {
    entityCache.tasks.delete(message.payload.id);
    return message;
  }

  if (message.type === "TASK_CREATED" || message.type === "TASK_UPDATED") {
    const normalized: SyncIncomingMessage = { type: "UPSERT_TASK", payload: message.payload };
    return applyConflictAware(normalized);
  }
  if (message.type === "TASK_DELETED") {
    const normalized: SyncIncomingMessage = { type: "DELETE_TASK", payload: { id: message.payload.id } };
    return applyConflictAware(normalized);
  }

  return null;
};

const normalizePayload = (payload?: Record<string, unknown>) => {
  if (!payload) return {};

  const normalized: Record<string, unknown> = { ...payload };
  if ("dueDate" in normalized && !("date" in normalized)) {
    normalized.date = normalized.dueDate;
  }
  if ("dueTime" in normalized) {
    delete normalized.dueTime;
  }
  if ("repeatDays" in normalized) {
    delete normalized.repeatDays;
  }
  if ("order" in normalized) {
    delete normalized.order;
  }
  if ("createdAt" in normalized) {
    delete normalized.createdAt;
  }

  return normalized;
};

const normalizeOutgoingTask = (taskId: string, payload?: Record<string, unknown>) => {
  const normalized = normalizePayload(payload);
  return {
    id: String(normalized.id ?? taskId),
    title: String(normalized.title ?? "Untitled task"),
    completed: Boolean(normalized.completed),
    priority:
      normalized.priority === "low" || normalized.priority === "high" ? normalized.priority : "medium",
    date: typeof normalized.date === "string" ? normalized.date : null,
    updatedAt: Date.now(),
  };
};

export const connectTaskSync = (url: string) => {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return;

  if (socket && (status === "connected" || status === "connecting") && activeUrl === normalizedUrl) {
    return;
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  activeUrl = normalizedUrl;
  hasAppliedFullSync = false;
  emitStatus("connecting");

  socket = new WebSocket(normalizedUrl);

  socket.onopen = () => {
    emitStatus("connected");
    sendRaw({ type: "INIT" });
  };

  socket.onmessage = (event) => {
    console.log("[RAW MESSAGE]", event.data);
    const incoming = safeParseIncoming(String(event.data));
    console.log("[PARSED MESSAGE]", incoming);
    if (!incoming) return;

    if (
      incoming &&
      typeof incoming === "object" &&
      (incoming as any).type === "FULL_SYNC" &&
      !hasAppliedFullSync
    ) {
      console.log("[FULL_SYNC DETECTED]");
      hasAppliedFullSync = true;
      replaceLocalDataWithMobileSync(incoming);
      return;
    }

    // received from mobile
    const normalized = applyConflictAware(incoming);
    if (!normalized) return;
    emitMessage(normalized);
  };

  socket.onerror = () => {
    emitStatus("disconnected");
  };

  socket.onclose = () => {
    emitStatus("disconnected");
  };
};

export const disconnectTaskSync = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
  activeUrl = "";
  hasAppliedFullSync = false;
  emitStatus("disconnected");
};

export const getTaskSyncStatus = (): SyncStatus => status;

export const subscribeTaskSyncMessages = (listener: MessageListener) => {
  messageListeners.add(listener);
  return () => messageListeners.delete(listener);
};

export const subscribeTaskSyncStatus = (listener: StatusListener) => {
  statusListeners.add(listener);
  listener(status);
  return () => statusListeners.delete(listener);
};

export const dispatchTaskSyncEvent = (event: Omit<TaskSyncEvent, "timestamp">) => {
  if (event.type === "TASK_DELETE") {
    sendRaw({
      type: "DELETE_TASK",
      payload: {
        id: event.taskId,
      },
    });
    return;
  }

  // sent to mobile
  sendRaw({
    type: "UPSERT_TASK",
    payload: normalizeOutgoingTask(event.taskId, event.payload),
  });
};

export const dispatchEntitySyncEvent = (event: {
  type:
    | "UPSERT_FOLDER"
    | "DELETE_FOLDER"
    | "UPSERT_NOTE"
    | "DELETE_NOTE"
    | "UPSERT_QUICK_NOTE"
    | "DELETE_QUICK_NOTE";
  payload: Record<string, unknown>;
}) => {
  // sent to mobile
  sendRaw({
    type: event.type,
    payload: event.payload,
  });
};
