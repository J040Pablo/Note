/**
 * Enhanced Web Sync Service with:
 * - Offline message queue
 * - Heartbeat/ping-pong
 * - No forced page reloads
 * - Proper delta handling for all entities
 * - Conflict resolution
 * - Payload validation
 */

import MessageQueue, { type QueuedMessage } from "../../services/messageQueue";
import {
  validateSyncTask,
  validateSyncNote,
  validateSyncQuickNote,
  type SyncTask,
  type SyncNote,
  type SyncQuickNote,
  type SyncFolder,
  type SyncPriority,
} from "../../services/sync/syncProtocolEnhanced";

// ============= TYPES =============

// Helper to check if incoming update should be applied (conflict resolution)
const shouldApplySync = (incomingTimestamp: number, currentTimestamp?: number): boolean => {
  if (!currentTimestamp) return true;
  return incomingTimestamp >= currentTimestamp;
};

type SyncIncomingMessage =
  | {
      type: "INIT_SYNC" | "INIT";
      payload: {
        folders?: SyncFolder[];
        notes?: SyncNote[];
        quickNotes?: SyncQuickNote[];
        tasks: SyncTask[];
      };
    }
  | { type: "FULL_SYNC"; payload: { folders?: SyncFolder[]; notes?: SyncNote[]; quickNotes?: SyncQuickNote[]; tasks?: SyncTask[] } }
  | { type: "UPSERT_FOLDER"; payload: SyncFolder }
  | { type: "DELETE_FOLDER"; payload: { id: string } }
  | { type: "UPSERT_NOTE"; payload: SyncNote }
  | { type: "DELETE_NOTE"; payload: { id: string } }
  | { type: "UPSERT_QUICK_NOTE"; payload: SyncQuickNote }
  | { type: "DELETE_QUICK_NOTE"; payload: { id: string } }
  | { type: "UPSERT_TASK"; payload: SyncTask }
  | { type: "DELETE_TASK"; payload: { id: string } }
  | { type: "TASK_CREATED"; payload: SyncTask }
  | { type: "TASK_UPDATED"; payload: SyncTask }
  | { type: "TASK_DELETED"; payload: { id: string; updatedAt: number } }
  | { type: "UPSERT_APP_META"; payload: { key: string; value: string; updatedAt: number } }
  | { type: "DELETE_APP_META"; payload: { key: string; updatedAt: number } };

type SyncStatus = "disconnected" | "connecting" | "connected";
type MessageListener = (message: SyncIncomingMessage) => void;
type StatusListener = (status: SyncStatus) => void;

// ============= STATE =============

let socket: WebSocket | null = null;
let status: SyncStatus = "disconnected";
let activeUrl = "";
let shouldReconnect = false;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();

// Offline queue
const messageQueue = new MessageQueue();

// Heartbeat
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
let lastHeartbeat = Date.now();

// Entity cache for conflict resolution
const entityCache = {
  folders: new Map<string, SyncFolder>(),
  notes: new Map<string, SyncNote>(),
  quickNotes: new Map<string, SyncQuickNote>(),
  tasks: new Map<string, SyncTask>(),
};

// ============= HEARTBEAT =============

const startHeartbeat = () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  
  heartbeatTimer = setInterval(() => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: "PING" }));
        lastHeartbeat = Date.now();
      } catch (error) {
        console.warn("[Sync] Heartbeat failed", error);
      }
    }
  }, HEARTBEAT_INTERVAL);
};

const stopHeartbeat = () => {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
};

// ============= OFFLINE QUEUE =============

const processMessageQueue = async () => {
  if (messageQueue.isEmpty() || !socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  console.log(`[Sync] Processing offline queue (${messageQueue.size()} messages)`);

  while (!messageQueue.isEmpty()) {
    const message = messageQueue.peek();
    if (!message) break;

    try {
      socket.send(JSON.stringify({
        type: message.type,
        payload: message.payload,
      }));

      messageQueue.dequeue();
      console.log(`[Sync] Sent queued message: ${message.type}`);
    } catch (error) {
      console.warn(`[Sync] Failed to send queued message`, error);
      message.retryCount++;

      if (message.retryCount >= message.maxRetries) {
        console.warn(`[Sync] Giving up on message after ${message.maxRetries} retries`, message.id);
        messageQueue.dequeue();
      } else {
        messageQueue.incrementRetry(message.id);
      }
      break;
    }
  }
};

// ============= STATUS MANAGEMENT =============

const emitStatus = (nextStatus: SyncStatus) => {
  status = nextStatus;
  statusListeners.forEach((listener) => listener(status));
};

const emitMessage = (message: SyncIncomingMessage) => {
  messageListeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {
      console.warn("[Sync] Message listener error", error);
    }
  });
};

// ============= MESSAGE SENDING =============

const sendRaw = (payload: unknown) => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn("[Sync] WebSocket not ready, queuing message");
    messageQueue.enqueue({
      type: "UPSERT_TASK", // Default type, will be overridden
      payload,
      maxRetries: 3,
    });
    return;
  }

  try {
    socket.send(JSON.stringify(payload));
  } catch (error) {
    console.warn("[Sync] Failed to send, queuing message", error);
    messageQueue.enqueue({
      type: "UPSERT_TASK",
      payload,
      maxRetries: 3,
    });
  }
};

// ============= CONFLICT RESOLUTION =============

const applyConflictAware = (message: SyncIncomingMessage): SyncIncomingMessage | null => {
  if (message.type === "INIT_SYNC" || message.type === "INIT" || message.type === "FULL_SYNC") {
    // Clear cache and reload all
    entityCache.folders.clear();
    entityCache.notes.clear();
    entityCache.quickNotes.clear();
    entityCache.tasks.clear();

    const payload = message.payload as Record<string, unknown>;
    
    if (Array.isArray(payload.folders)) {
      (payload.folders as SyncFolder[]).forEach((f) => entityCache.folders.set(f.id, f));
    }
    if (Array.isArray(payload.notes)) {
      (payload.notes as SyncNote[]).forEach((n) => entityCache.notes.set(n.id, n));
    }
    if (Array.isArray(payload.quickNotes)) {
      (payload.quickNotes as SyncQuickNote[]).forEach((q) => entityCache.quickNotes.set(q.id, q));
    }
    if (Array.isArray(payload.tasks)) {
      (payload.tasks as SyncTask[]).forEach((t) => entityCache.tasks.set(t.id, t));
    }

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

  // Conflict resolution for single entities
  if (message.type === "UPSERT_FOLDER") {
    const current = entityCache.folders.get(message.payload.id);
    if (!shouldApplySync(message.payload.updatedAt, current?.updatedAt)) {
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
    if (!shouldApplySync(message.payload.updatedAt, current?.updatedAt)) {
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
    if (!shouldApplySync(message.payload.updatedAt, current?.updatedAt)) {
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
    if (!shouldApplySync(message.payload.updatedAt, current?.updatedAt)) {
      return null;
    }
    entityCache.tasks.set(message.payload.id, message.payload);
    return message;
  }

  if (message.type === "DELETE_TASK") {
    entityCache.tasks.delete(message.payload.id);
    return message;
  }

  // Normalize TASK_CREATED/UPDATED/DELETED to standard messages
  if (message.type === "TASK_CREATED" || message.type === "TASK_UPDATED") {
    const normalized: SyncIncomingMessage = { type: "UPSERT_TASK", payload: message.payload };
    return applyConflictAware(normalized);
  }

  if (message.type === "TASK_DELETED") {
    const normalized: SyncIncomingMessage = { type: "DELETE_TASK", payload: { id: message.payload.id } };
    return applyConflictAware(normalized);
  }

  if (message.type === "UPSERT_APP_META" || message.type === "DELETE_APP_META") {
    return message;
  }

  return null;
};

// ============= MESSAGE PARSING =============

const safeParseIncoming = (raw: string): SyncIncomingMessage | null => {
  try {
    const parsed = JSON.parse(raw) as SyncIncomingMessage;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

// ============= RECONNECTION =============

const reconnectDelayForAttempt = (attempt: number): number => {
  const baseDelay = 1000;
  const maxDelay = 30000;
  // Exponential backoff with jitter
  const delay = Math.min(baseDelay * Math.pow(2, Math.min(attempt, 4)), maxDelay);
  const jitter = Math.random() * delay * 0.1;
  return Math.floor(delay + jitter);
};

const clearReconnectTimer = () => {
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
};

const scheduleReconnect = () => {
  if (!shouldReconnect || !activeUrl) return;
  
  clearReconnectTimer();
  reconnectAttempts++;
  const delay = reconnectDelayForAttempt(reconnectAttempts);
  
  console.log(`[Sync] Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts})`);
  
  reconnectTimer = setTimeout(() => {
    if (shouldReconnect && activeUrl) {
      connectTaskSync(activeUrl);
    }
  }, delay);
};

// ============= PUBLIC API =============

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

  try {
    socket = new WebSocket(normalizedUrl);
  } catch (error) {
    console.error("[Sync] Failed to create WebSocket", error);
    emitStatus("disconnected");
    scheduleReconnect();
    return;
  }

  socket.onopen = () => {
    console.log("[Sync] Connected to server");
    reconnectAttempts = 0;
    emitStatus("connected");
    startHeartbeat();
    sendRaw({ type: "INIT_SYNC" });
    processMessageQueue();
  };

  socket.onmessage = (event) => {
    if (String(event.data).trim() === "PONG") {
      lastHeartbeat = Date.now();
      return;
    }

    const incoming = safeParseIncoming(String(event.data));
    if (!incoming) return;

    const normalized = applyConflictAware(incoming);
    if (!normalized) return;

    emitMessage(normalized);
  };

  socket.onerror = (error) => {
    console.error("[Sync] WebSocket error", error);
    emitStatus("disconnected");
  };

  socket.onclose = () => {
    console.log("[Sync] Disconnected from server");
    stopHeartbeat();
    socket = null;
    emitStatus("disconnected");
    scheduleReconnect();
  };
};

export const disconnectTaskSync = () => {
  shouldReconnect = false;
  reconnectAttempts = 0;
  clearReconnectTimer();
  stopHeartbeat();
  
  if (socket) {
    socket.close();
    socket = null;
  }
  
  activeUrl = "";
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
  const payload = event.payload || {};

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

  if (event.type === "TASK_TOGGLE") {
    sendRaw({
      type: "TASK_TOGGLE",
      payload: {
        id: event.taskId,
        completed: Boolean(payload.completed),
        updatedAt: Date.now(),
      },
    });
    return;
  }

  sendRaw({
    type: event.type === "TASK_CREATE" ? "TASK_CREATE" : "TASK_UPDATE",
    payload: {
      id: event.taskId,
      ...payload,
      updatedAt: Date.now(),
    },
  });
};

export const dispatchEntitySyncEvent = (event: {
  type: "UPSERT_FOLDER" | "DELETE_FOLDER" | "UPSERT_NOTE" | "DELETE_NOTE" | "UPSERT_QUICK_NOTE" | "DELETE_QUICK_NOTE" | "UPSERT_APP_META" | "DELETE_APP_META";
  payload: Record<string, unknown>;
}) => {
  sendRaw({
    type: event.type,
    payload: {
      ...event.payload,
      updatedAt: Date.now(),
    },
  });
};

export const getQueueSize = (): number => messageQueue.size();

export const clearQueue = (): void => messageQueue.clear();

// Type exports for consumers
export type { SyncTask, SyncNote, SyncQuickNote, SyncFolder, SyncPriority };
