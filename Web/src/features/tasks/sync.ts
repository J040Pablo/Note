export type SyncPriority = "low" | "medium" | "high";

export type SyncTask = {
  id: string;
  title: string;
  completed: boolean;
  priority: SyncPriority;
  date: string | null;
  updatedAt: number;
};

export type SyncIncomingMessage =
  | {
      type: "INIT_DATA";
      payload: {
        notes: unknown[];
        tasks: SyncTask[];
        folders: unknown[];
        files?: Array<{ id: string; name: string; path: string }>;
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

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

const emitStatus = (nextStatus: SyncStatus) => {
  status = nextStatus;
  statusListeners.forEach((listener) => listener(status));
};

const emitMessage = (message: SyncIncomingMessage) => {
  messageListeners.forEach((listener) => listener(message));
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
  emitStatus("connecting");

  socket = new WebSocket(normalizedUrl);

  socket.onopen = () => {
    emitStatus("connected");
    sendRaw({ type: "INIT_SYNC" });
  };

  socket.onmessage = (event) => {
    const incoming = safeParseIncoming(String(event.data));
    if (!incoming) return;
    emitMessage(incoming);
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
  const timestamp = Date.now();

  if (event.type === "TASK_CREATE") {
    sendRaw({
      type: "TASK_CREATE",
      payload: {
        ...normalizePayload(event.payload),
        updatedAt: timestamp,
      },
    });
    return;
  }

  if (event.type === "TASK_UPDATE") {
    sendRaw({
      type: "TASK_UPDATE",
      payload: {
        id: event.taskId,
        ...normalizePayload(event.payload),
        updatedAt: timestamp,
      },
    });
    return;
  }

  if (event.type === "TASK_DELETE") {
    sendRaw({
      type: "TASK_DELETE",
      payload: {
        id: event.taskId,
        updatedAt: timestamp,
      },
    });
    return;
  }

  sendRaw({
    type: "TASK_TOGGLE",
    payload: {
      id: event.taskId,
      ...normalizePayload(event.payload),
      updatedAt: timestamp,
    },
  });
};
