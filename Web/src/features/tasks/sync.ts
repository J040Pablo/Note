import MessageQueue from "../../services/messageQueue";

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
  color?: string;
  imageUrl?: string;
  bannerUrl?: string;
  createdAt: number;
  updatedAt: number;
};

export type SyncQuickNote = {
  id: string;
  title: string;
  content: string;
  text?: string;
  folderId?: string | null;
  color?: string;
  imageUrl?: string;
  bannerUrl?: string;
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
  color?: string;
  imageUrl?: string;
  bannerUrl?: string;
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
  | { type: "TASK_DELETED"; payload: { id: string; updatedAt: number } }
  | {
      type: "ACK";
      id?: string;
      payload?: {
        id?: string;
        receivedAt?: number;
        appliedAt?: number;
        status?: "OK" | "ERROR";
      };
    }
  | { type: "FULL_SYNC_ACK"; payload?: { id?: string; confirmedAt?: number } };

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

type ReliableMessage = {
  id: string;
  clientId: string;
  type: string;
  payload: Record<string, unknown>;
  sentAt: number;
  ackRequired: true;
};

type PendingMessageState = {
  message: ReliableMessage;
  sentAt: number;
  lastSentAt: number;
  retryCount: number;
};

let socket: WebSocket | null = null;
let status: SyncStatus = "disconnected";
let activeUrl = "";
let shouldReconnect = false;
let reconnectAttempts = 0;
let reconnectTimer: number | null = null;

// Message queue for offline support + retry
const messageQueue = new MessageQueue();
const pendingQueue = new Map<string, PendingMessageState>();
const processedIncomingIds = new Set<string>();
const MAX_PROCESSED_IDS = 2000;

const ACK_TIMEOUT_MS = 3000;
const ACK_RETRY_INTERVAL_MS = 1000;
let ackRetryTimer: number | null = null;

const SYNC_CLIENT_ID_KEY = "note.sync.clientId";

const getOrCreateClientId = (): string => {
  try {
    const current = window.localStorage.getItem(SYNC_CLIENT_ID_KEY)?.trim();
    if (current) return current;
    const next = `web-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    window.localStorage.setItem(SYNC_CLIENT_ID_KEY, next);
    return next;
  } catch {
    return `web-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
};

const CLIENT_ID = getOrCreateClientId();

const isSyncDebugEnabled = (): boolean => {
  try {
    return import.meta.env.DEV && window.localStorage.getItem("note.sync.debug") === "1";
  } catch {
    return false;
  }
};

const logSyncDebug = (...args: unknown[]) => {
  if (!isSyncDebugEnabled()) return;
  console.log(...args);
};

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

const pruneProcessedIncomingIds = () => {
  if (processedIncomingIds.size <= MAX_PROCESSED_IDS) return;
  const keep = Array.from(processedIncomingIds).slice(-Math.floor(MAX_PROCESSED_IDS / 2));
  processedIncomingIds.clear();
  keep.forEach((id) => processedIncomingIds.add(id));
};

const startAckRetryLoop = () => {
  if (ackRetryTimer !== null) {
    window.clearInterval(ackRetryTimer);
    ackRetryTimer = null;
  }

  ackRetryTimer = window.setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const now = Date.now();
    pendingQueue.forEach((pending, messageId) => {
      if (now - pending.lastSentAt < ACK_TIMEOUT_MS) return;

      try {
        socket?.send(JSON.stringify(pending.message));
        pending.lastSentAt = now;
        pending.retryCount += 1;
      } catch (error) {
        console.log("[SYNC][ERROR]", messageId, error);
      }
    });
  }, ACK_RETRY_INTERVAL_MS);
};

const stopAckRetryLoop = () => {
  if (ackRetryTimer !== null) {
    window.clearInterval(ackRetryTimer);
    ackRetryTimer = null;
  }
};

const resolveAckId = (incoming: SyncIncomingMessage): string | null => {
  if (incoming.type !== "ACK") return null;

  const payloadId = incoming.payload?.id;
  if (typeof payloadId === "string" && payloadId.trim().length > 0) {
    return payloadId.trim();
  }

  if (typeof incoming.id === "string" && incoming.id.trim().length > 0) {
    return incoming.id.trim();
  }

  return null;
};

const getIncomingId = (incoming: SyncIncomingMessage): string | null => {
  const maybe = (incoming as SyncIncomingMessage & { id?: unknown }).id;
  if (typeof maybe !== "string") return null;
  const trimmed = maybe.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const replayQueuedMessages = () => {
  console.log("[sync] replaying queued messages, count:", messageQueue.size());
  const beforeDrainCount = messageQueue.size();
  if (beforeDrainCount > 0) {
    logSyncDebug("[SYNC][QUEUE_DRAIN][START]", { queued: beforeDrainCount });
  }

  let drained = 0;
  while (!messageQueue.isEmpty()) {
    const queued = messageQueue.peek();
    if (!queued) break;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.log("[sync] socket not ready, stopping replay");
      break;
    }

    try {
      const rawPayload = queued.payload as unknown;
      const envelope =
        rawPayload && typeof rawPayload === "object" && "type" in (rawPayload as Record<string, unknown>)
          ? (rawPayload as Record<string, unknown>)
          : {
              id: queued.id,
              type: queued.type,
              payload: queued.payload,
              sentAt: queued.timestamp,
              ackRequired: true,
            };

      socket.send(JSON.stringify(envelope));
      messageQueue.dequeue();
      drained += 1;
      console.log("[sync] replayed message:", queued.id);

      if ((envelope as { ackRequired?: unknown }).ackRequired === true && typeof (envelope as { id?: unknown }).id === "string") {
        const envelopeId = String((envelope as { id?: unknown }).id);
        pendingQueue.set(envelopeId, {
          message: envelope as unknown as ReliableMessage,
          sentAt: Number((envelope as { sentAt?: unknown }).sentAt ?? Date.now()),
          lastSentAt: Date.now(),
          retryCount: 0,
        });
        console.log("[SYNC][SEND]", envelopeId, String((envelope as { type?: unknown }).type ?? "UNKNOWN"));
      }
    } catch (error) {
      console.warn("[sync] replay error", error);
      break;
    }
  }

  if (beforeDrainCount > 0) {
    logSyncDebug("[SYNC][QUEUE_DRAIN][END]", {
      before: beforeDrainCount,
      drained,
      remaining: messageQueue.size(),
    });
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

const hasAnyInitCollections = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as { folders?: unknown; notes?: unknown; quickNotes?: unknown; tasks?: unknown };
  return (
    Array.isArray(data.folders) ||
    Array.isArray(data.notes) ||
    Array.isArray(data.quickNotes) ||
    Array.isArray(data.tasks)
  );
};

const payloadIsSuspiciouslyEmpty = (payload: unknown): boolean => {
  if (!payload || typeof payload !== "object") return true;
  const data = payload as { folders?: unknown[]; notes?: unknown[]; quickNotes?: unknown[]; tasks?: unknown[] };
  return (
    Array.isArray(data.folders) && data.folders.length === 0 &&
    Array.isArray(data.notes) && data.notes.length === 0 &&
    Array.isArray(data.quickNotes) && data.quickNotes.length === 0 &&
    Array.isArray(data.tasks) && data.tasks.length === 0
  );
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
    if (message.type === "FULL_SYNC") {
      const incomingTasks = Array.isArray(message.payload.tasks) ? message.payload.tasks : [];
      const hasAnyPayloadCollections = hasAnyInitCollections(message.payload);
      const hasExistingCachedData =
        entityCache.tasks.size > 0 ||
        entityCache.notes.size > 0 ||
        entityCache.quickNotes.size > 0 ||
        entityCache.folders.size > 0;

      if (incomingTasks.length === 0 && entityCache.tasks.size > 0) {
        console.warn("[SYNC][FULL_SYNC][IGNORED] empty tasks payload with existing local tasks");
        return null;
      }

      if (!hasAnyPayloadCollections && hasExistingCachedData) {
        console.warn("[SYNC][FULL_SYNC][IGNORED] malformed payload (missing collections)");
        return null;
      }

      if (payloadIsSuspiciouslyEmpty(message.payload) && hasExistingCachedData) {
        console.warn("[SYNC][FULL_SYNC][IGNORED] empty payload to avoid unintended wipe");
        return null;
      }
    }

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

const sendControlMessage = (payload: unknown) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    console.log("[SYNC][ERROR]", "-", error);
    return false;
  }
};

const sendReliableMessage = (message: ReliableMessage) => {
  const outbound: ReliableMessage =
    typeof message.clientId === "string" && message.clientId.trim().length > 0
      ? message
      : {
          ...message,
          clientId: CLIENT_ID,
        };

  const readyState = socket?.readyState;
  const isOpen = !!socket && readyState === WebSocket.OPEN;

  logSyncDebug("[SYNC][SEND_ATTEMPT]", {
    messageId: outbound.id,
    type: outbound.type,
    payloadValid: !!outbound.payload && typeof outbound.payload === "object",
  });
  logSyncDebug("[SYNC][SOCKET_STATE]", {
    messageId: outbound.id,
    type: outbound.type,
    isOpen,
    readyState: readyState ?? "no-socket",
  });

  if (
    outbound.type === "TASK_CREATE" ||
    outbound.type === "TASK_UPDATE" ||
    outbound.type === "TASK_TOGGLE" ||
    outbound.type === "TASK_DELETE"
  ) {
    if (pendingQueue.has(outbound.id)) {
      logSyncDebug("[SYNC][SENT]", {
        messageId: outbound.id,
        type: outbound.type,
        skipped: "already-pending",
      });
      return;
    }
    logSyncDebug("[SYNC][WS][STATE]", outbound.type, {
      messageId: outbound.id,
      isOpen,
      readyState: readyState ?? "no-socket",
    });
  }

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    messageQueue.enqueue({
      id: message.id,
      type: outbound.type,
      payload: outbound,
      maxRetries: 5,
    });
    logSyncDebug("[sync] queued message:", outbound.id);
    if (
      outbound.type === "TASK_CREATE" ||
      outbound.type === "TASK_UPDATE" ||
      outbound.type === "TASK_TOGGLE" ||
      outbound.type === "TASK_DELETE"
    ) {
      logSyncDebug("[SYNC][WS][QUEUE]", outbound.type, { messageId: outbound.id });
    }
    logSyncDebug("[SYNC][QUEUED]", {
      messageId: outbound.id,
      type: outbound.type,
      queueSize: messageQueue.size(),
    });
    return;
  }

  try {
    if (pendingQueue.has(outbound.id)) {
      logSyncDebug("[SYNC][SENT]", {
        messageId: outbound.id,
        type: outbound.type,
        skipped: "already-pending",
      });
      return;
    }
    socket.send(JSON.stringify(outbound));
    pendingQueue.set(outbound.id, {
      message: outbound,
      sentAt: outbound.sentAt,
      lastSentAt: Date.now(),
      retryCount: 0,
    });
    logSyncDebug("[SYNC][SENT]", {
      messageId: outbound.id,
      type: outbound.type,
      ackRequired: outbound.ackRequired,
    });
    if (
      outbound.type === "TASK_CREATE" ||
      outbound.type === "TASK_UPDATE" ||
      outbound.type === "TASK_TOGGLE" ||
      outbound.type === "TASK_DELETE"
    ) {
      logSyncDebug("[SYNC][WS][SENT]", outbound.type, { messageId: outbound.id });
    }
  } catch (error) {
    console.log("[SYNC][ERROR]", outbound.id, error);
    messageQueue.enqueue({
      id: outbound.id,
      type: outbound.type,
      payload: outbound,
      maxRetries: 5,
    });
  }
};

const sendRaw = (payload: unknown) => {
  return sendControlMessage(payload);
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
    console.log("[SYNC][CONNECT] Web connected");
    startAckRetryLoop();
    // Send INIT_SYNC to match what Mobile server expects
    sendRaw({ type: "INIT_SYNC" });
    // Replay any queued messages
    setTimeout(() => {
      replayQueuedMessages();
    }, 500);
  };

  socket.onmessage = (event) => {
    const incoming = safeParseIncoming(String(event.data));
    if (!incoming) return;

    const incomingId = getIncomingId(incoming);
    console.log("[SYNC][RECEIVE]", incomingId ?? "-", incoming.type);

    if (incoming.type === "ACK") {
      const ackId = resolveAckId(incoming);
      if (!ackId) return;

      const pending = pendingQueue.get(ackId);
      if (!pending) {
        logSyncDebug("[SYNC][ACK]", ackId, "latency:", "n/a");
        return;
      }

      const ackStatus = incoming.payload?.status;
      if (ackStatus === "ERROR") {
        console.log("[SYNC][ERROR]", ackId, "ACK status ERROR");
        return;
      }

      const latency = Date.now() - pending.sentAt;
      pendingQueue.delete(ackId);
      logSyncDebug("[SYNC][ACK]", ackId, "latency:", latency);
      logSyncDebug("[SYNC][LATENCY]", latency);
      if (latency > 500) {
        console.warn("[SYNC][SLOW]", latency);
      }
      return;
    }

    if (incomingId) {
      if (processedIncomingIds.has(incomingId)) {
        return;
      }
      processedIncomingIds.add(incomingId);
      pruneProcessedIncomingIds();
    }

    if (incoming.type === "FULL_SYNC" && incomingId) {
      const confirmed = sendRaw({
        type: "FULL_SYNC_ACK",
        payload: {
          id: incomingId,
          confirmedAt: Date.now(),
        },
      });
      if (!confirmed) {
        console.log("[SYNC][ERROR]", incomingId, "FULL_SYNC_ACK failed");
        return;
      }
    }

    // All messages go through conflict-aware processing → emit to listeners
    const normalized = applyConflictAware(incoming);
    if (!normalized) return;
    console.log("[SYNC][APPLY]", incomingId ?? "-");
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
    console.log("[SYNC][ERROR]", "-", "WebSocket error");
    emitStatus("disconnected");
    scheduleReconnect();
  };

  socket.onclose = () => {
    stopAckRetryLoop();
    socket = null;
    emitStatus("disconnected");
    scheduleReconnect();
  };
};

export const disconnectTaskSync = () => {
  shouldReconnect = false;
  reconnectAttempts = 0;
  clearReconnectTimer();
  stopAckRetryLoop();
  if (socket) {
    socket.close();
    socket = null;
  }
  activeUrl = "";
  emitStatus("disconnected");
};

export const getTaskSyncStatus = (): SyncStatus => status;

export const requestTaskSync = (): boolean => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return false;
  }
  return sendRaw({ type: "INIT_SYNC" });
};

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
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const sentAt = Date.now();
  const socketState = socket ? socket.readyState : WebSocket.CLOSED;

  if (event.type === "TASK_DELETE") {
    sendReliableMessage({
      id,
      clientId: CLIENT_ID,
      type: "TASK_DELETE",
      payload: {
        id: event.taskId,
        updatedAt: Date.now(),
      },
      sentAt,
      ackRequired: true,
    });
    return;
  }

  const payload = normalizeOutgoingTask(event.taskId, event.payload);

  if (event.type === "TASK_CREATE") {
    console.log("[SYNC][DEBUG] TASK_CREATE sent", {
      taskId: event.taskId,
      socketState,
      socketOpen: socketState === WebSocket.OPEN,
    });

    sendReliableMessage({
      id,
      clientId: CLIENT_ID,
      type: "TASK_CREATE",
      payload,
      sentAt,
      ackRequired: true,
    });
    return;
  }

  if (event.type === "TASK_TOGGLE") {
    const toggleDate = typeof event.payload?.date === "string" ? event.payload.date : payload.date;
    sendReliableMessage({
      id,
      clientId: CLIENT_ID,
      type: "TASK_TOGGLE",
      payload: {
        id: payload.id,
        date: toggleDate,
        updatedAt: payload.updatedAt,
      },
      sentAt,
      ackRequired: true,
    });
    return;
  }

  console.log("[SYNC][DEBUG] TASK_UPDATE sent", {
    taskId: event.taskId,
    socketState,
    socketOpen: socketState === WebSocket.OPEN,
  });

  sendReliableMessage({
    id,
    clientId: CLIENT_ID,
    type: "TASK_UPDATE",
    payload,
    sentAt,
    ackRequired: true,
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
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  sendReliableMessage({
    id,
    clientId: CLIENT_ID,
    type: event.type,
    payload: event.payload,
    sentAt: Date.now(),
    ackRequired: true,
  });
};
