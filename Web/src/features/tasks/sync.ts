export type SyncPriority = "low" | "medium" | "high";

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
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SyncQuickNote = {
  id: string;
  title: string;
  content: string;
  text?: string;
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
};

export type SyncTask = {
  id: string;
  text?: string;
  title: string;
  completed: boolean;
  priority: SyncPriority;
  date?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  dueDate?: string | null;
  dueTime?: string | null;
  repeatDays?: number[];
  completedDates?: string[];
  order?: number;
  createdAt?: number;
  updatedAt: number;
  parentId?: string | null;
  noteId?: string | null;
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
  | { type: "UPSERT_APP_META"; payload: { key: string; value: string; updatedAt: number } }
  | { type: "DELETE_APP_META"; payload: { key: string; updatedAt: number } }
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
let shouldReconnect = false;
let reconnectAttempts = 0;
let reconnectTimer: number | null = null;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

const emitStatus = (nextStatus: SyncStatus) => {
  status = nextStatus;
  statusListeners.forEach((listener) => listener(status));
};

const emitMessage = (message: SyncIncomingMessage) => {
  messageListeners.forEach((listener) => listener(message));
};

const reconnectDelayForAttempt = (attempt: number): number => {
  if (attempt <= 0) return 1000;
  if (attempt === 1) return 1000;
  if (attempt === 2) return 2000;
  if (attempt === 3) return 5000;
  return 10000;
};

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const readTimestamp = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

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
      tasks: Array.isArray((message.payload as { tasks?: unknown }).tasks)
        ? ((message.payload as { tasks: SyncTask[] }).tasks ?? [])
        : [],
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

  if (message.type === "UPSERT_APP_META" || message.type === "DELETE_APP_META") {
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

const normalizePayload = (payload?: Record<string, unknown>) => {
  if (!payload) return {};

  const normalized: Record<string, unknown> = { ...payload };
  if ("dueDate" in normalized && !("date" in normalized)) {
    normalized.date = normalized.dueDate;
  }
  return normalized;
};

const normalizeOutgoingTask = (taskId: string, payload?: Record<string, unknown>) => {
  const normalized = normalizePayload(payload);
  const title = String(normalized.title ?? normalized.text ?? "Untitled task");
  const scheduledDate =
    typeof normalized.scheduledDate === "string"
      ? normalized.scheduledDate
      : typeof normalized.date === "string"
      ? normalized.date
      : typeof normalized.dueDate === "string"
      ? normalized.dueDate
      : null;
  const scheduledTime =
    typeof normalized.scheduledTime === "string"
      ? normalized.scheduledTime
      : typeof normalized.dueTime === "string"
      ? normalized.dueTime
      : null;
  return {
    id: String(normalized.id ?? taskId),
    title,
    text: title,
    completed: Boolean(normalized.completed),
    priority:
      normalized.priority === "low" || normalized.priority === "high" ? normalized.priority : "medium",
    date: scheduledDate,
    scheduledDate,
    dueDate: scheduledDate,
    scheduledTime,
    dueTime: scheduledTime,
    repeatDays: Array.isArray(normalized.repeatDays) ? normalized.repeatDays : [],
    completedDates: Array.isArray(normalized.completedDates) ? normalized.completedDates : [],
    order: typeof normalized.order === "number" ? normalized.order : undefined,
    parentId: typeof normalized.parentId === "string" ? normalized.parentId : null,
    noteId: typeof normalized.noteId === "string" ? normalized.noteId : null,
    updatedAt: Date.now(),
  };
};

export const connectTaskSync = (url: string) => {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return;

  shouldReconnect = true;
  clearReconnectTimer();

  if (socket && (status === "connected" || status === "connecting") && activeUrl === normalizedUrl) {
    return;
  }

  if (socket) {
    socket.close();
    socket = null;
  }

  activeUrl = normalizedUrl;
  emitStatus("connecting");

  socket = new WebSocket(normalizedUrl);

  socket.onopen = () => {
    reconnectAttempts = 0;
    emitStatus("connected");
    // Send INIT_SYNC to match what Mobile server expects
    sendRaw({ type: "INIT_SYNC" });
  };

  socket.onmessage = (event) => {
    const incoming = safeParseIncoming(String(event.data));
    if (!incoming) return;

    // All messages go through conflict-aware processing → emit to listeners
    const normalized = applyConflictAware(incoming);
    if (!normalized) return;
    emitMessage(normalized);
  };

  const scheduleReconnect = () => {
    if (!shouldReconnect || !activeUrl) return;
    clearReconnectTimer();
    reconnectAttempts += 1;
    const delay = reconnectDelayForAttempt(reconnectAttempts);
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (!shouldReconnect || !activeUrl) return;
      connectTaskSync(activeUrl);
    }, delay);
  };

  socket.onerror = () => {
    emitStatus("disconnected");
    scheduleReconnect();
  };

  socket.onclose = () => {
    socket = null;
    emitStatus("disconnected");
    scheduleReconnect();
  };
};

export const disconnectTaskSync = () => {
  shouldReconnect = false;
  reconnectAttempts = 0;
  clearReconnectTimer();
  if (socket) {
    socket.close();
    socket = null;
  }
  activeUrl = "";
  emitStatus("disconnected");
};

export const getTaskSyncStatus = (): SyncStatus => status;

export const subscribeTaskSyncMessages = (listener: MessageListener) => {
  messageListeners.add(listener);
  return () => { messageListeners.delete(listener); };
};

export const subscribeTaskSyncStatus = (listener: StatusListener) => {
  statusListeners.add(listener);
  listener(status);
  return () => { statusListeners.delete(listener); };
};

export const dispatchTaskSyncEvent = (event: Omit<TaskSyncEvent, "timestamp">) => {
  if (event.type === "TASK_DELETE") {
    sendRaw({
      type: "TASK_DELETE",
      payload: {
        id: event.taskId,
        updatedAt: Date.now(),
      },
    });
    return;
  }

  const payload = normalizeOutgoingTask(event.taskId, event.payload);

  if (event.type === "TASK_CREATE") {
    sendRaw({ type: "TASK_CREATE", payload });
    return;
  }

  if (event.type === "TASK_TOGGLE") {
    sendRaw({
      type: "TASK_TOGGLE",
      payload: {
        id: payload.id,
        completed: payload.completed,
        updatedAt: payload.updatedAt,
      },
    });
    return;
  }

  sendRaw({
    type: "TASK_UPDATE",
    payload,
  });
};

export const dispatchEntitySyncEvent = (event: {
  type:
    | "UPSERT_FOLDER"
    | "DELETE_FOLDER"
    | "UPSERT_NOTE"
    | "DELETE_NOTE"
    | "UPSERT_QUICK_NOTE"
    | "DELETE_QUICK_NOTE"
    | "UPSERT_APP_META"
    | "DELETE_APP_META";
  payload: Record<string, unknown>;
}) => {
  sendRaw({
    type: event.type,
    payload: event.payload,
  });
};
