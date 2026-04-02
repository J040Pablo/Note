import MessageQueue from "../../services/messageQueue";
import { loadData, markSynced, saveData, type DataFolder, type DataNote, type DataQuickNote } from "../../services/webData";
import type { TaskItem } from "../tasks/types";

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
  folderId?: string | null;
  title: string;
  content: string;
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
  priority: "low" | "medium" | "high";
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
      type: "REQUEST_SYNC" | "INIT_SYNC" | "INIT";
      id?: string;
      payload?: {
        folders?: SyncFolder[];
        notes?: SyncNote[];
        quickNotes?: SyncQuickNote[];
        tasks?: SyncTask[];
      };
    }
  | { type: "FULL_SYNC"; id?: string; payload: { folders?: SyncFolder[]; notes?: SyncNote[]; quickNotes?: SyncQuickNote[]; tasks?: SyncTask[] } }
  | { type: "UPSERT_FOLDER"; id?: string; payload: SyncFolder }
  | { type: "DELETE_FOLDER"; id?: string; payload: { id: string } }
  | { type: "UPSERT_NOTE"; id?: string; payload: SyncNote }
  | { type: "DELETE_NOTE"; id?: string; payload: { id: string } }
  | { type: "UPSERT_QUICK_NOTE"; id?: string; payload: SyncQuickNote }
  | { type: "DELETE_QUICK_NOTE"; id?: string; payload: { id: string } }
  | { type: "UPSERT_TASK"; id?: string; payload: SyncTask }
  | { type: "DELETE_TASK"; id?: string; payload: { id: string } }
  | { type: "TASK_CREATED"; id?: string; payload: SyncTask }
  | { type: "TASK_UPDATED"; id?: string; payload: SyncTask }
  | { type: "TASK_DELETED"; id?: string; payload: { id: string; updatedAt: number } }
  | { type: "UPSERT_APP_META"; id?: string; payload: { key: string; value: string; updatedAt: number } }
  | { type: "DELETE_APP_META"; id?: string; payload: { key: string; updatedAt: number } }
  | { type: "ACK"; id?: string; payload: { id: string } }
  | { type: "PING"; id?: string; payload?: { timestamp?: number } }
  | { type: "PONG"; id?: string; payload?: { replyTo?: string; timestamp?: number } };

type SyncStatus = "disconnected" | "connecting" | "connected";
type MessageListener = (message: SyncIncomingMessage) => void;
type StatusListener = (status: SyncStatus) => void;

const HEARTBEAT_INTERVAL = 5000;
const HEARTBEAT_TIMEOUT = 12000;
const RECONNECT_DELAY = 2000;

let socket: WebSocket | null = null;
let status: SyncStatus = "disconnected";
let activeUrl = "";
let shouldReconnect = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatWatchdogTimer: ReturnType<typeof setInterval> | null = null;
let awaitingInitialSync = false;
let lastPongAt = 0;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();
const pendingQueue = new MessageQueue();
const inFlightIds = new Set<string>();

const emitStatus = (nextStatus: SyncStatus) => {
  status = nextStatus;
  statusListeners.forEach((listener) => listener(status));
};

const emitMessage = (message: SyncIncomingMessage) => {
  messageListeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {
      console.warn("[sync] message listener failed", error);
    }
  });
};

const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const safeParse = (raw: string): SyncIncomingMessage | null => {
  try {
    const parsed = JSON.parse(raw) as SyncIncomingMessage;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const readTimestamp = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const shouldApplyIncoming = (incoming: Record<string, unknown>, current?: Record<string, unknown>) =>
  readTimestamp(incoming.updatedAt) >= readTimestamp(current?.updatedAt);

const entityCache = {
  folders: new Map<string, SyncFolder>(),
  notes: new Map<string, SyncNote>(),
  quickNotes: new Map<string, SyncQuickNote>(),
  tasks: new Map<string, SyncTask>(),
};

const applyInitCache = (payload: { folders?: SyncFolder[]; notes?: SyncNote[]; quickNotes?: SyncQuickNote[]; tasks?: SyncTask[] }) => {
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
  if (message.type === "REQUEST_SYNC" || message.type === "INIT_SYNC" || message.type === "INIT" || message.type === "FULL_SYNC") {
    const payload = (message.payload ?? {}) as { folders?: SyncFolder[]; notes?: SyncNote[]; quickNotes?: SyncQuickNote[]; tasks?: SyncTask[] };
    applyInitCache(payload);
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
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) return null;
    entityCache.folders.set(message.payload.id, message.payload);
    return message;
  }

  if (message.type === "DELETE_FOLDER") {
    entityCache.folders.delete(message.payload.id);
    return message;
  }

  if (message.type === "UPSERT_NOTE") {
    const current = entityCache.notes.get(message.payload.id);
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) return null;
    entityCache.notes.set(message.payload.id, message.payload);
    return message;
  }

  if (message.type === "DELETE_NOTE") {
    entityCache.notes.delete(message.payload.id);
    return message;
  }

  if (message.type === "UPSERT_QUICK_NOTE") {
    const current = entityCache.quickNotes.get(message.payload.id);
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) return null;
    entityCache.quickNotes.set(message.payload.id, message.payload);
    return message;
  }

  if (message.type === "DELETE_QUICK_NOTE") {
    entityCache.quickNotes.delete(message.payload.id);
    return message;
  }

  if (message.type === "UPSERT_TASK") {
    const current = entityCache.tasks.get(message.payload.id);
    if (!shouldApplyIncoming(message.payload as unknown as Record<string, unknown>, current as unknown as Record<string, unknown>)) return null;
    entityCache.tasks.set(message.payload.id, message.payload);
    return message;
  }

  if (message.type === "DELETE_TASK") {
    entityCache.tasks.delete(message.payload.id);
    return message;
  }

  if (message.type === "TASK_CREATED" || message.type === "TASK_UPDATED") {
    return applyConflictAware({ type: "UPSERT_TASK", id: message.id, payload: message.payload });
  }

  if (message.type === "TASK_DELETED") {
    return applyConflictAware({ type: "DELETE_TASK", id: message.id, payload: { id: message.payload.id } });
  }

  if (message.type === "UPSERT_APP_META" || message.type === "DELETE_APP_META") {
    return message;
  }

  if (message.type === "ACK" || message.type === "PING" || message.type === "PONG") {
    return message;
  }

  return null;
};

const sendRaw = (payload: unknown) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn("[sync] send failed", error);
    return false;
  }
};

const sendAck = (messageId?: string) => {
  if (!messageId) return;
  sendRaw({ type: "ACK", id: createId(), payload: { id: messageId } });
};

const queueEnvelope = (type: string, payload: unknown) => {
  const id = createId();
  pendingQueue.enqueue({ id, type, payload, maxRetries: 5 });
  return id;
};

const flushQueue = () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const queued = pendingQueue.getAll();
  for (const message of queued) {
    if (inFlightIds.has(message.id)) continue;
    const sent = sendRaw({ id: message.id, type: message.type, payload: message.payload });
    if (!sent) break;
    inFlightIds.add(message.id);
  }
};

const clearTimers = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatWatchdogTimer) {
    clearInterval(heartbeatWatchdogTimer);
    heartbeatWatchdogTimer = null;
  }
};

const scheduleReconnect = () => {
  if (!shouldReconnect || !activeUrl) return;
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (!shouldReconnect || !activeUrl) return;
    connectTaskSync(activeUrl);
  }, RECONNECT_DELAY);
};

const startHeartbeat = () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  if (heartbeatWatchdogTimer) clearInterval(heartbeatWatchdogTimer);

  lastPongAt = Date.now();
  heartbeatTimer = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    sendRaw({ id: createId(), type: "PING", payload: { timestamp: Date.now() } });
  }, HEARTBEAT_INTERVAL);

  heartbeatWatchdogTimer = setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
  }, 1000);
};

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (heartbeatWatchdogTimer) {
    clearInterval(heartbeatWatchdogTimer);
    heartbeatWatchdogTimer = null;
  }
};

const handleInitialSyncMessage = (message: SyncIncomingMessage) => {
  if (message.type !== "INIT" && message.type !== "FULL_SYNC") return false;

  const normalizedPayload =
    message.type === "INIT"
      ? message.payload
      : {
          folders: message.payload.folders ?? [],
          notes: message.payload.notes ?? [],
          quickNotes: message.payload.quickNotes ?? [],
          tasks: message.payload.tasks ?? [],
        };

  markSynced();
  saveData({
    folders: (normalizedPayload?.folders ?? []).map((folder) => ({
      id: folder.id,
      parentId: folder.parentId,
      name: folder.name,
      description: folder.description,
      color: folder.color,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      imageUrl: folder.imageUrl,
      bannerUrl: folder.bannerUrl,
    })),
    notes: (normalizedPayload?.notes ?? []).map((note) => ({
      id: note.id,
      parentId: note.parentId ?? note.folderId ?? null,
      title: note.title,
      content: note.content,
      folderId: note.folderId ?? note.parentId ?? null,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    })),
    quickNotes: (normalizedPayload?.quickNotes ?? []).map((quickNote) => ({
      id: quickNote.id,
      title: quickNote.title,
      text: quickNote.text ?? quickNote.content ?? "",
      content: quickNote.content ?? quickNote.text ?? "",
      folderId: quickNote.folderId ?? null,
      createdAt: quickNote.createdAt,
      updatedAt: quickNote.updatedAt,
    })),
    tasks: (normalizedPayload?.tasks ?? []).map((task, index) => ({
      id: task.id,
      title: task.title,
      completed: task.completed,
      priority: task.priority,
      dueDate: typeof task.scheduledDate === "string" ? task.scheduledDate : typeof task.date === "string" ? task.date : null,
      repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
      createdAt: typeof task.createdAt === "number" ? task.createdAt : task.updatedAt,
      updatedAt: task.updatedAt,
      dueTime: typeof task.scheduledTime === "string" ? task.scheduledTime : null,
      order: typeof task.order === "number" ? task.order : index,
      parentId: typeof task.parentId === "string" ? task.parentId : null,
      noteId: typeof task.noteId === "string" ? task.noteId : null,
    })),
  });

  flushQueue();
  emitMessage({ type: "INIT", payload: normalizedPayload });
  return true;
};

const handleIncoming = (raw: string) => {
  const incoming = safeParse(raw);
  if (!incoming) return;

  if (incoming.type === "ACK") {
    const ackedId = incoming.payload?.id;
    if (ackedId) {
      pendingQueue.removeMessage(ackedId);
      inFlightIds.delete(ackedId);
    }
    return;
  }

  if (incoming.type === "PONG") {
    lastPongAt = Date.now();
    if (incoming.id) sendAck(incoming.id);
    return;
  }

  if (incoming.id) {
    sendAck(incoming.id);
  }

  if (incoming.type === "PING") {
    lastPongAt = Date.now();
    sendRaw({ id: createId(), type: "PONG", payload: { replyTo: incoming.id, timestamp: Date.now() } });
    return;
  }

  if (handleInitialSyncMessage(incoming)) return;

  const normalized = applyConflictAware(incoming);
  if (!normalized) return;

  emitMessage(normalized);
};

export const connectTaskSync = (url: string) => {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) return;

  shouldReconnect = true;

  if (socket && activeUrl === normalizedUrl && (status === "connected" || status === "connecting")) {
    return;
  }

  clearTimers();

  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }

  activeUrl = normalizedUrl;
  emitStatus("connecting");

  try {
    socket = new WebSocket(normalizedUrl);
  } catch (error) {
    console.error("[sync] failed to create WebSocket", error);
    emitStatus("disconnected");
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    emitStatus("connected");
    awaitingInitialSync = true;
    startHeartbeat();
    sendRaw({ id: createId(), type: "REQUEST_SYNC", payload: { requestedAt: Date.now() } });
  };

  socket.onmessage = (event) => {
    handleIncoming(String(event.data));
  };

  socket.onerror = (error) => {
    console.error("[sync] WebSocket error", error);
    emitStatus("disconnected");
  };

  socket.onclose = () => {
    stopHeartbeat();
    socket = null;
    emitStatus("disconnected");
    scheduleReconnect();
  };
};

export const disconnectTaskSync = () => {
  shouldReconnect = false;
  awaitingInitialSync = false;
  activeUrl = "";
  clearTimers();
  inFlightIds.clear();

  if (socket) {
    try {
      socket.close();
    } catch {
      // ignore
    }
    socket = null;
  }

  emitStatus("disconnected");
};

export const getTaskSyncStatus = (): SyncStatus => status;

export const subscribeTaskSyncMessages = (listener: MessageListener): (() => void) => {
  messageListeners.add(listener);
  return () => {
    messageListeners.delete(listener);
  };
};

export const subscribeTaskSyncStatus = (listener: StatusListener): (() => void) => {
  statusListeners.add(listener);
  listener(status);
  return () => {
    statusListeners.delete(listener);
  };
};

export const dispatchTaskSyncEvent = (event: {
  type: "TASK_CREATE" | "TASK_UPDATE" | "TASK_DELETE" | "TASK_TOGGLE";
  taskId: string;
  payload?: Record<string, unknown>;
}) => {
  if (event.type === "TASK_DELETE") {
    queueEnvelope("TASK_DELETE", { id: event.taskId, updatedAt: Date.now() });
    flushQueue();
    return;
  }

  const payload = { id: event.taskId, ...(event.payload ?? {}), updatedAt: Date.now() };

  if (event.type === "TASK_TOGGLE") {
    queueEnvelope("TASK_TOGGLE", {
      id: event.taskId,
      completed: Boolean(event.payload?.completed),
      updatedAt: Date.now(),
    });
    flushQueue();
    return;
  }

  queueEnvelope(event.type, payload);
  flushQueue();
};

export const dispatchEntitySyncEvent = (event: {
  type: "UPSERT_FOLDER" | "DELETE_FOLDER" | "UPSERT_NOTE" | "DELETE_NOTE" | "UPSERT_QUICK_NOTE" | "DELETE_QUICK_NOTE" | "UPSERT_APP_META" | "DELETE_APP_META";
  payload: Record<string, unknown>;
}) => {
  queueEnvelope(event.type, {
    ...event.payload,
    updatedAt: Date.now(),
  });
  flushQueue();
};

export const flushSyncQueue = (): void => {
  flushQueue();
};

export const getPendingQueueSize = (): number => pendingQueue.size();

export const clearPendingQueue = (): void => pendingQueue.clear();

export const isWaitingForInitialSync = (): boolean => awaitingInitialSync;

export type { TaskItem };
