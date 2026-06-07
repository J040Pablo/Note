import * as Network from "expo-network";
import { createFolder, deleteFolder, getAllFolders, updateFolder } from "@services/foldersService";
import {
  createNote,
  createQuickNote,
  deleteNote,
  deleteQuickNote,
  getAllNotes,
  getAllQuickNotes,
  getQuickNoteById,
  updateNote,
  updateQuickNote,
} from "@services/notesService";
import { createTask, deleteTask, getAllTasks, toDateKey, toggleTaskForDate, updateTask } from "@services/tasksService";
import { deleteMetaKey, upsertMetaKey } from "@services/appMetaService";
import { subscribeTaskServerEvents, type TaskServerEvent } from "@services/sync/taskSyncEvents";
import { subscribeEntityServerEvents, type EntityServerEvent } from "@services/sync/entitySyncEvents";
import { fromSyncPriority, toSyncTask, type SyncPriority, type SyncTask } from "@services/sync/taskSyncProtocol";
import type { Task, TaskReminderType } from "@models/types";
import { isExpoGo, shouldLogDev } from "@utils/runtimeEnv";
import { log, warn, error as logError } from '@utils/logger';
import { transformNoteImages } from "@utils/noteContent";
import { saveBase64Image, uriToBase64 } from "@services/imageService";

type SocketClient = {
  id: string | number;
  on: (eventName: "message" | "disconnected", callback: (payload: unknown) => void) => void;
  send: (payload: string) => void;
};

type SyncNotePayload = {
  id?: string;
  parentId?: string | null;
  folderId?: string | null;
  title?: string;
  content?: string;
  createdAt?: number;
  updatedAt?: number;
};

type ServerInstance = {
  on: (eventName: "connection", callback: (socket: SocketClient) => void) => void;
  start: () => void;
  stop: () => void;
};

type SyncIncomingMessage =
  | { type: "INIT_SYNC" | "REQUEST_SYNC" }
  | { type: "FULL_SYNC_ACK"; payload?: { id?: string; confirmedAt?: number } }
  | {
      type: "TASK_CREATE";
      payload?: Partial<SyncTask> & {
        title?: string;
        completed?: boolean;
        priority?: SyncPriority;
        date?: string | null;
      };
    }
  | {
      type: "TASK_UPDATE";
      payload?: Partial<SyncTask> & {
        id?: string;
        title?: string;
        completed?: boolean;
        priority?: SyncPriority;
        date?: string | null;
      };
    }
  | { type: "TASK_DELETE"; payload?: { id?: string; updatedAt?: number } }
  | { type: "TASK_TOGGLE"; payload?: { id?: string; date?: string; updatedAt?: number } }
  | { type: "UPSERT_TASK"; payload?: Partial<SyncTask> & { id?: string } }
  | { type: "DELETE_TASK"; payload?: { id?: string; updatedAt?: number } }
  | {
      type: "UPSERT_FOLDER";
      payload?: {
        id?: string;
        parentId?: string | null;
        name?: string;
        description?: string;
        color?: string;
        imageUrl?: string;
        bannerUrl?: string;
        createdAt?: number;
        updatedAt?: number;
      };
    }
  | { type: "DELETE_FOLDER"; payload?: { id?: string; updatedAt?: number } }
  | {
      type: "UPSERT_NOTE";
      payload?: SyncNotePayload;
    }
  | { type: "DELETE_NOTE"; payload?: { id?: string; updatedAt?: number } }
  | {
      type: "UPSERT_QUICK_NOTE";
      payload?: {
        id?: string;
        title?: string;
        content?: string;
        text?: string;
        folderId?: string | null;
        createdAt?: number;
        updatedAt?: number;
      };
    }
  | { type: "DELETE_QUICK_NOTE"; payload?: { id?: string; updatedAt?: number } }
  | { type: "UPSERT_APP_META"; payload?: { key?: string; value?: string; updatedAt?: number } }
  | { type: "DELETE_APP_META"; payload?: { key?: string; updatedAt?: number } };

type SyncTaskPayload = {
  id?: string;
  title?: string;
  text?: string;
  completed?: boolean;
  priority?: SyncPriority;
  date?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  repeatDays?: number[];
  completedDates?: string[];
  reminders?: string[];
  notificationIds?: string[];
  order?: number;
  parentId?: string | null;
  noteId?: string | null;
  updatedAt?: number;
};

type SyncFullDataMessage = {
  id?: string;
  sentAt?: number;
  ackRequired?: boolean;
  type: "FULL_SYNC";
  payload: {
    notes: unknown[];
    quickNotes: unknown[];
    tasks: SyncTask[];
    folders: unknown[];
  };
};

const DEFAULT_SYNC_PORT = 8787;

let server: ServerInstance | null = null;
let serverUrl: string | null = null;
let startPromise: Promise<{ url: string } | null> | null = null;
let unsubscribeTaskBroadcast: (() => void) | null = null;
let unsubscribeEntityBroadcast: (() => void) | null = null;
const clients = new Map<string, SocketClient>();
const socketClientIds = new Map<string, string>();
const processedMessageIds = new Map<string, number>();
const pendingFullSyncIds = new Set<string>();
const MAX_PROCESSED_MESSAGE_IDS = 4000;
const BROADCAST_SUPPRESSION_TTL_MS = 15_000;

type BroadcastSuppression = {
  socketId: string;
  clientId?: string;
  expiresAt: number;
};

const broadcastSuppressions = new Map<string, BroadcastSuppression>();

let hasLoggedExpoGoWsUnsupported = false;

const getSocketId = (socket: SocketClient): string => String(socket.id);

const createMessageId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const logSyncDebug = (...args: unknown[]) => {
  if (!shouldLogDev) return;
};

const normalizeOptionalString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const buildSuppressionKey = (entity: string, id: string): string => `${entity}:${id}`;

const keyFromIncomingMessage = (message: SyncIncomingMessage): string | null => {
  switch (message.type) {
    case "TASK_CREATE":
    case "TASK_UPDATE":
    case "UPSERT_TASK":
    case "TASK_TOGGLE": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("task", id) : null;
    }
    case "TASK_DELETE":
    case "DELETE_TASK": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("task", id) : null;
    }
    case "UPSERT_NOTE": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("note", id) : null;
    }
    case "DELETE_NOTE": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("note", id) : null;
    }
    case "UPSERT_QUICK_NOTE": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("quickNote", id) : null;
    }
    case "DELETE_QUICK_NOTE": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("quickNote", id) : null;
    }
    case "UPSERT_FOLDER": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("folder", id) : null;
    }
    case "DELETE_FOLDER": {
      const id = normalizeOptionalString(message.payload?.id);
      return id ? buildSuppressionKey("folder", id) : null;
    }
    case "UPSERT_APP_META": {
      const key = normalizeOptionalString(message.payload?.key);
      return key ? buildSuppressionKey("appMeta", key) : null;
    }
    case "DELETE_APP_META": {
      const key = normalizeOptionalString(message.payload?.key);
      return key ? buildSuppressionKey("appMeta", key) : null;
    }
    default:
      return null;
  }
};

const keyFromTaskEvent = (event: TaskServerEvent): string | null => {
  if (event.type === "TASK_DELETED") {
    return buildSuppressionKey("task", String(event.payload.id));
  }
  return buildSuppressionKey("task", String(event.payload.id));
};

const keyFromEntityEvent = (event: EntityServerEvent): string | null => {
  switch (event.type) {
    case "UPSERT_FOLDER":
    case "DELETE_FOLDER":
      return buildSuppressionKey("folder", String(event.payload.id));
    case "UPSERT_NOTE":
    case "DELETE_NOTE":
      return buildSuppressionKey("note", String(event.payload.id));
    case "UPSERT_QUICK_NOTE":
    case "DELETE_QUICK_NOTE":
      return buildSuppressionKey("quickNote", String(event.payload.id));
    case "UPSERT_TASK":
    case "DELETE_TASK":
      return buildSuppressionKey("task", String(event.payload.id));
    case "UPSERT_APP_META":
    case "DELETE_APP_META":
      return buildSuppressionKey("appMeta", String(event.payload.key));
    default:
      return null;
  }
};

const rememberBroadcastSuppression = (key: string, socketId: string, clientId?: string) => {
  broadcastSuppressions.set(key, {
    socketId,
    clientId,
    expiresAt: Date.now() + BROADCAST_SUPPRESSION_TTL_MS,
  });
};

const takeBroadcastSuppression = (key: string): BroadcastSuppression | null => {
  const entry = broadcastSuppressions.get(key);
  if (!entry) return null;
  broadcastSuppressions.delete(key);
  if (entry.expiresAt < Date.now()) return null;
  return entry;
};

const rememberProcessedMessage = (messageId: string) => {
  processedMessageIds.set(messageId, Date.now());
  if (processedMessageIds.size <= MAX_PROCESSED_MESSAGE_IDS) return;

  const sorted = Array.from(processedMessageIds.entries()).sort((a, b) => a[1] - b[1]);
  const dropCount = Math.floor(MAX_PROCESSED_MESSAGE_IDS / 2);
  for (let index = 0; index < dropCount; index += 1) {
    const entry = sorted[index];
    if (!entry) continue;
    processedMessageIds.delete(entry[0]);
  }
};

const sendToClient = (socket: SocketClient, message: unknown) => {
  try {
    const normalized =
      message && typeof message === "object"
        ? ({
            id: (message as { id?: string }).id ?? createMessageId(),
            sentAt: (message as { sentAt?: number }).sentAt ?? Date.now(),
            ...message,
          } as Record<string, unknown>)
        : message;

    if (normalized && typeof normalized === "object") {
      const type = String((normalized as { type?: string }).type ?? "UNKNOWN");
      const id = String((normalized as { id?: string }).id ?? "-");
    }

    socket.send(JSON.stringify(normalized));
  } catch (error) {
    warn("[sync] failed to send message", error);
  }
};

const broadcast = (
  message: unknown,
  options?: {
    excludeSocketId?: string;
    excludeClientId?: string;
  }
) => {
  clients.forEach((socket, socketId) => {
    if (options?.excludeSocketId && socketId === options.excludeSocketId) {
      return;
    }
    if (options?.excludeClientId) {
      const socketClientId = socketClientIds.get(socketId);
      if (socketClientId && socketClientId === options.excludeClientId) {
        return;
      }
    }
    sendToClient(socket, message);
  });
};

const parseIncoming = (raw: unknown): SyncIncomingMessage | null => {
  try {
    if (!raw) return null;

    let value: unknown = raw;

    if (typeof value === "string") {
      value = JSON.parse(value);
    } else if (value instanceof ArrayBuffer) {
      value = JSON.parse(new TextDecoder().decode(value));
    } else if (typeof value === "object" && value !== null) {
      const record = value as Record<string, unknown>;
      if (typeof record.data === "string") {
        value = JSON.parse(record.data);
      } else if (record.data instanceof ArrayBuffer) {
        value = JSON.parse(new TextDecoder().decode(record.data));
      } else if (typeof record.utf8Data === "string") {
        value = JSON.parse(record.utf8Data);
      }
    }

    if (!value || typeof value !== "object") return null;

    const type = (value as { type?: string }).type;
    if (!type) return null;

    return value as SyncIncomingMessage;
  } catch {
    return null;
  }
};

const getIncomingMessageId = (message: SyncIncomingMessage): string | null => {
  const id = (message as SyncIncomingMessage & { id?: unknown }).id;
  if (typeof id !== "string") return null;
  const trimmed = id.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sendAck = (
  socket: SocketClient,
  messageId: string,
  receivedAt: number,
  appliedAt: number,
  status: "OK" | "ERROR" = "OK"
) => {
  sendToClient(socket, {
    type: "ACK",
    id: messageId,
    payload: {
      id: messageId,
      receivedAt,
      appliedAt,
      status,
    },
  });
};

const hasOwn = (value: unknown, key: string): boolean =>
  !!value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key);

const mapIncomingPayloadToTask = (existing: Task, payload: SyncTaskPayload): Task => {
  const nextPriority =
    payload && "priority" in payload && payload.priority
      ? fromSyncPriority(payload.priority as SyncPriority)
      : existing.priority;

  const hasTitle = hasOwn(payload, "title") || hasOwn(payload, "text");
  const incomingTitle = hasOwn(payload, "title") ? payload?.title : payload?.text;
  const nextTitle =
    !hasTitle || incomingTitle === undefined
      ? existing.text
      : incomingTitle === null
      ? ""
      : typeof incomingTitle === "string"
      ? incomingTitle.trim()
      : existing.text;

  const hasScheduledDate = hasOwn(payload, "scheduledDate");
  const hasDate = hasOwn(payload, "date");
  const nextDate = hasScheduledDate
    ? payload?.scheduledDate === undefined
      ? existing.scheduledDate ?? null
      : payload?.scheduledDate === null
      ? null
      : typeof payload?.scheduledDate === "string"
      ? payload.scheduledDate
      : existing.scheduledDate ?? null
    : hasDate
    ? payload?.date === undefined
      ? existing.scheduledDate ?? null
      : payload?.date === null
      ? null
      : typeof payload?.date === "string"
      ? payload.date
      : existing.scheduledDate ?? null
    : existing.scheduledDate ?? null;

  const hasScheduledTime = hasOwn(payload, "scheduledTime");
  const nextTime = hasScheduledTime
    ? payload?.scheduledTime === undefined
      ? existing.scheduledTime ?? null
      : payload?.scheduledTime === null
      ? null
      : typeof payload?.scheduledTime === "string"
      ? payload.scheduledTime
      : existing.scheduledTime ?? null
    : nextDate === null
    ? null
    : existing.scheduledTime ?? null;

  const nextCompleted = hasOwn(payload, "completed")
    ? payload?.completed === undefined
      ? existing.completed
      : payload?.completed === null
      ? false
      : Boolean(payload?.completed)
    : existing.completed;

  const nextParentId = hasOwn(payload, "parentId")
    ? payload?.parentId === undefined
      ? existing.parentId ?? null
      : payload?.parentId === null
      ? null
      : typeof payload?.parentId === "string"
      ? payload.parentId
      : existing.parentId ?? null
    : existing.parentId ?? null;

  const nextNoteId = hasOwn(payload, "noteId")
    ? payload?.noteId === undefined
      ? existing.noteId ?? null
      : payload?.noteId === null
      ? null
      : typeof payload?.noteId === "string"
      ? payload.noteId
      : existing.noteId ?? null
    : existing.noteId ?? null;

  const nextReminders = hasOwn(payload, "reminders")
    ? payload?.reminders === undefined
      ? existing.reminders
      : payload?.reminders === null
      ? []
      : Array.isArray(payload?.reminders)
      ? payload.reminders
      : existing.reminders
    : existing.reminders;

  const nextNotificationIds =
    Array.isArray(payload?.notificationIds) && payload.notificationIds.length > 0
      ? payload.notificationIds
      : existing.notificationIds;

  return {
    ...existing,
    text: nextTitle,
    completed: nextCompleted,
    priority: nextPriority,
    scheduledDate: nextDate,
    scheduledTime: nextTime,
    repeatDays: Array.isArray(payload?.repeatDays) ? payload.repeatDays : existing.repeatDays,
    completedDates: Array.isArray(payload?.completedDates) ? payload.completedDates : existing.completedDates,
    reminders: nextReminders as TaskReminderType[],
    notificationIds: nextNotificationIds,
    orderIndex: typeof payload?.order === "number" ? payload.order : existing.orderIndex,
    parentId: nextParentId,
    noteId: nextNoteId,
    updatedAt: Date.now(),
  };
};

let fullSyncResolvers: Array<() => void> = [];

export const waitForFullSync = async (): Promise<void> => {
  return new Promise<void>((resolve) => {
    fullSyncResolvers.push(resolve);
  });
};

const sendInitialData = async (socket: SocketClient) => {

  const notes = await getAllNotes().catch((e) => {
    logError("[SYNC ERROR notes]", e);
    return [];
  });
  const quickNotes = await getAllQuickNotes().catch((e) => {
    logError("[SYNC ERROR quickNotes]", e);
    return [];
  });
  const tasks = await getAllTasks().catch((e) => {
    logError("[SYNC ERROR tasks]", e);
    return [];
  });
  const folders = await getAllFolders().catch((e) => {
    logError("[SYNC ERROR folders]", e);
    return [];
  });

  // Ensure notes/quickNotes do not contain local-only file:// URIs when sent over the wire.
  const safeNotes = await Promise.all(
    notes.map(async (n: any) => {
      try {
        const content = typeof n.content === "string" ? n.content : "";
        const transformed = await transformNoteImages(content, async (uri) => {
          if (typeof uri === "string" && uri.startsWith("file://")) {
            return (await uriToBase64(uri)) || uri;
          }
          return uri;
        });
        return { ...n, content: transformed };
      } catch (e) {
        return n;
      }
    })
  );

  const safeQuickNotes = await Promise.all(
    quickNotes.map(async (q: any) => {
      try {
        const content = typeof q.content === "string" ? q.content : "";
        const transformed = await transformNoteImages(content, async (uri) => {
          if (typeof uri === "string" && uri.startsWith("file://")) {
            return (await uriToBase64(uri)) || uri;
          }
          return uri;
        });
        return { ...q, content: transformed };
      } catch (e) {
        return q;
      }
    })
  );

  const safeFolders = await Promise.all(
    folders.map(async (f: any) => {
      try {
        const makeSyncUri = async (p: any) => {
          if (!p || typeof p !== "string") return p;
          try {
            if (p.startsWith("file://") || p.startsWith("content://")) {
              return (await uriToBase64(p)) || p;
            }
          } catch {
            // ignore
          }
          return p;
        };
        const imageUrl = await makeSyncUri(f.photoPath ?? f.imageUrl ?? null);
        const bannerUrl = await makeSyncUri(f.bannerPath ?? f.bannerUrl ?? null);
        return { ...f, photoPath: f.photoPath ?? undefined, bannerPath: f.bannerPath ?? undefined, imageUrl, bannerUrl };
      } catch (e) {
        return f;
      }
    })
  );

  const message: SyncFullDataMessage = {
    id: createMessageId(),
    sentAt: Date.now(),
    ackRequired: true,
    type: "FULL_SYNC",
    payload: {
      notes: safeNotes,
      quickNotes: safeQuickNotes,
      folders: safeFolders,
      tasks: tasks.map(toSyncTask),
      // folders included above as safeFolders
    },
  };

  if (typeof message.id === "string" && message.id.length > 0) {
    pendingFullSyncIds.add(message.id);
  }

  sendToClient(socket, message);
  // Resolve any waiters
  if (fullSyncResolvers.length > 0) {
    fullSyncResolvers.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore
      }
    });
    fullSyncResolvers = [];
  }
};

const handleTaskCreate = async (payload: Extract<SyncIncomingMessage, { type: "TASK_CREATE" }>["payload"], origin?: string) => {
  const title = (payload?.title ?? payload?.text ?? "").trim();
  if (!title) return;

  await createTask({
    id: payload?.id,
    text: title,
    priority: fromSyncPriority(payload?.priority),
    scheduledDate: payload?.scheduledDate ?? payload?.date ?? null,
    scheduledTime: payload?.scheduledTime ?? null,
    repeatDays: Array.isArray(payload?.repeatDays) ? payload.repeatDays : [],
    reminders: Array.isArray((payload as any)?.reminders) ? (payload as any).reminders : undefined,
    parentId: typeof payload?.parentId === "string" ? payload.parentId : null,
    noteId: typeof payload?.noteId === "string" ? payload.noteId : null,
    updatedAt: Number(payload?.updatedAt ?? Date.now()),
  }, origin);
};

const handleTaskUpdate = async (payload: Extract<SyncIncomingMessage, { type: "TASK_UPDATE" }>["payload"], origin?: string) => {
  const id = payload?.id;
  if (!id) return;

  const all = await getAllTasks();
  const existing = all.find((task) => String(task.id) === String(id));
  if (!existing) return;

  const incomingUpdatedAt = Number(payload?.updatedAt ?? 0);
  const existingUpdatedAt = Number(existing.updatedAt ?? 0);
  if (incomingUpdatedAt > 0 && existingUpdatedAt > incomingUpdatedAt) {
    return;
  }

  await updateTask(mapIncomingPayloadToTask(existing, payload), origin);
};

const handleTaskDelete = async (payload: Extract<SyncIncomingMessage, { type: "TASK_DELETE" }>["payload"], origin?: string) => {
  const id = payload?.id;
  if (!id) return;

  await deleteTask(id, origin);
};

const handleTaskToggle = async (payload: Extract<SyncIncomingMessage, { type: "TASK_TOGGLE" }>["payload"], origin?: string) => {
  const id = payload?.id;
  if (!id) return;

  const all = await getAllTasks();
  const existing = all.find((task) => String(task.id) === String(id));
  if (!existing) return;

  const dateKey =
    typeof payload?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(payload.date)
      ? payload.date
      : toDateKey(new Date());

  await toggleTaskForDate(existing, dateKey, origin);
};

const handleNoteUpsert = async (payload: SyncNotePayload, origin?: string) => {
  const id = String(payload?.id ?? "").trim();
  const title = String(payload?.title ?? "").trim();
  if (!id || !title) return;

  const all = await getAllNotes();
  const current = all.find((note) => String(note.id) === id);

  if (current) {
    const incomingUpdatedAt = Number(payload?.updatedAt ?? 0);
    const currentUpdatedAt = Number(current.updatedAt ?? 0);
    if (incomingUpdatedAt > 0 && currentUpdatedAt > incomingUpdatedAt) {
      return;
    }
  }

  const folderId = (payload?.folderId ?? payload?.parentId ?? null) as string | null;
  const rawContent = typeof payload?.content === "string" ? payload.content : "";
  
  // Convert incoming base64 images to local files
  const content = await transformNoteImages(rawContent, async (uri) => {
    if (uri.startsWith("data:image/")) {
      return (await saveBase64Image(uri)) || uri;
    }
    return uri;
  });

  const createdAt = Number(payload?.createdAt ?? current?.createdAt ?? Date.now());
  const updatedAt = Number(payload?.updatedAt ?? Date.now());

  await createNote({
    id,
    title,
    content,
    folderId,
    createdAt,
    updatedAt,
  }, origin);
};

const handleTaskUpsert = async (
  payload:
    | Extract<SyncIncomingMessage, { type: "TASK_CREATE" }>["payload"]
    | Extract<SyncIncomingMessage, { type: "UPSERT_TASK" }>["payload"],
  origin?: string
) => {
  const id = String(payload?.id ?? "").trim();
  if (!id) {
    await handleTaskCreate(payload, origin);
    return;
  }

  const all = await getAllTasks();
  const existing = all.find((task) => String(task.id) === id);
  if (!existing) {
    await handleTaskCreate(payload, origin);
    return;
  }

  await handleTaskUpdate(payload, origin);
};

const handleIncomingMessage = async (socket: SocketClient, message: SyncIncomingMessage) => {
  const origin = getSocketId(socket);
  if (message.type === "INIT_SYNC" || message.type === "REQUEST_SYNC") {
    await sendInitialData(socket);
    return;
  }

  if (message.type === "FULL_SYNC_ACK") {
    const syncId = String(message.payload?.id ?? "").trim();
    if (syncId) {
      pendingFullSyncIds.delete(syncId);
    }
    return;
  }

  if (message.type === "TASK_CREATE" || message.type === "UPSERT_TASK") {
    await handleTaskUpsert(message.payload, origin);
    return;
  }

  if (message.type === "TASK_UPDATE") {
    await handleTaskUpdate(message.payload, origin);
    return;
  }

  if (message.type === "TASK_DELETE") {
    await handleTaskDelete(message.payload, origin);
    return;
  }

  if (message.type === "DELETE_TASK") {
    await handleTaskDelete(message.payload, origin);
    return;
  }

  if (message.type === "TASK_TOGGLE") {
    await handleTaskToggle(message.payload, origin);
    return;
  }

  if (message.type === "UPSERT_NOTE") {
    await handleNoteUpsert(message.payload ?? {}, origin);
    return;
  }

  if (message.type === "DELETE_NOTE") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    await deleteNote(id, origin);
    return;
  }

  if (message.type === "UPSERT_QUICK_NOTE") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    const title = String(message.payload?.title ?? "Quick Note").trim() || "Quick Note";
    const rawContent =
      typeof message.payload?.content === "string"
        ? message.payload.content
        : typeof message.payload?.text === "string"
        ? message.payload.text
        : "";
        
    // Convert incoming base64 images to local files
    const content = await transformNoteImages(rawContent, async (uri) => {
      if (uri.startsWith("data:image/")) {
        return (await saveBase64Image(uri)) || uri;
      }
      return uri;
    });

    const folderId = (message.payload?.folderId ?? null) as string | null;
    const current = await getQuickNoteById(id);

    // Conflict resolution: skip if incoming is older
    if (current) {
      const incomingUpdatedAt = Number(message.payload?.updatedAt ?? 0);
      const currentUpdatedAt = Number(current.updatedAt ?? 0);
      if (incomingUpdatedAt > 0 && currentUpdatedAt > incomingUpdatedAt) {
        return;
      }
    }

    if (!current) {
      await createQuickNote({
        id,
        title,
        content,
        folderId,
        createdAt: Number(message.payload?.createdAt ?? Date.now()),
        updatedAt: Number(message.payload?.updatedAt ?? Date.now()),
      }, origin);
    } else {
      await updateQuickNote(id, { title, content, folderId }, origin);
    }

    return;
  }

  if (message.type === "DELETE_QUICK_NOTE") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    await deleteQuickNote(id, origin);
    return;
  }

  if (message.type === "UPSERT_FOLDER") {
    const id = String(message.payload?.id ?? "").trim();
    const name = String(message.payload?.name ?? "").trim();
    if (!id || !name) return;

    const all = await getAllFolders();
    const current = all.find((f) => String(f.id) === id);
    
    // Conflict resolution: skip if incoming is older
    if (current) {
      const incomingUpdatedAt = Number(message.payload?.updatedAt ?? 0);
      const currentUpdatedAt = Number(current.updatedAt ?? 0);
      if (incomingUpdatedAt > 0 && currentUpdatedAt > incomingUpdatedAt) {
        return;
      }
    }

    const parentId = (message.payload?.parentId ?? null) as string | null;

    // Persist incoming folder images if they are base64 or local URIs
    const transformIncoming = async (incoming: unknown) => {
      if (!incoming || typeof incoming !== "string") return null;
      const uri = incoming as string;
      try {
        if (uri.startsWith("data:image/")) {
          return (await saveBase64Image(uri)) || uri;
        }
        if (uri.startsWith("file://") || uri.startsWith("content://")) {
          const data = await uriToBase64(uri);
          if (data) return (await saveBase64Image(data)) || uri;
        }
      } catch (e) {
        // ignore
      }
      return uri;
    };

    const incomingImage = message.payload?.imageUrl ?? null;
    const incomingBanner = message.payload?.bannerUrl ?? null;
    const photoPathArg = await transformIncoming(incomingImage);
    const bannerPathArg = await transformIncoming(incomingBanner);

    if (!current) {
      await createFolder(
        name,
        parentId,
        message.payload?.color ?? null,
        message.payload?.description ?? null,
        photoPathArg,
        bannerPathArg,
        {
          id,
          createdAt: Number(message.payload?.createdAt ?? Date.now()),
          updatedAt: Number(message.payload?.updatedAt ?? Date.now()),
          origin,
        }
      );
    } else {
      await updateFolder({
        ...current,
        id,
        name,
        parentId,
        color: message.payload?.color ?? current.color ?? null,
        description: message.payload?.description ?? current.description ?? null,
        photoPath: photoPathArg ?? current.photoPath ?? null,
        bannerPath: bannerPathArg ?? current.bannerPath ?? null,
        createdAt: Number(message.payload?.createdAt ?? current.createdAt ?? Date.now()),
        updatedAt: Number(message.payload?.updatedAt ?? Date.now()),
      } as typeof current & { updatedAt: number }, origin);
    }

    return;
  }

  if (message.type === "DELETE_FOLDER") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    await deleteFolder(id, origin);
    return;
  }

  if (message.type === "UPSERT_APP_META") {
    const key = String(message.payload?.key ?? "").trim();
    if (!key) return;
    const value = String(message.payload?.value ?? "");
    await upsertMetaKey(key, value);
    return;
  }

  if (message.type === "DELETE_APP_META") {
    const key = String(message.payload?.key ?? "").trim();
    if (!key) return;
    await deleteMetaKey(key);
  }
};

const onTaskEvent = (event: TaskServerEvent) => {
  const socketId = event.origin;
  const clientId = socketClientIds.get(socketId ?? "");

  if (event.type === "TASK_CREATED" || event.type === "TASK_UPDATED") {
    broadcast(
      { type: "UPSERT_TASK", payload: event.payload },
      {
        excludeSocketId: socketId,
        excludeClientId: clientId,
      }
    );
    return;
  }

  broadcast(
    { type: "DELETE_TASK", payload: event.payload },
    {
      excludeSocketId: socketId,
      excludeClientId: clientId,
    }
  );
};

const onEntityEvent = (event: EntityServerEvent) => {
  const socketId = event.origin;
  const clientId = socketClientIds.get(socketId ?? "");
  
  broadcast(event, {
    excludeSocketId: socketId,
    excludeClientId: clientId,
  });
};

const getWebsocketServerCtor = (): (new (ipAddress: string, port: number) => ServerInstance) | null => {
  try {
    const moduleRef = require("react-native-websocket-server");
    const ctor = moduleRef?.default ?? moduleRef;
    return ctor ?? null;
  } catch {
    return null;
  }
};

export const startTaskSyncServer = async (port = DEFAULT_SYNC_PORT): Promise<{ url: string } | null> => {
  logSyncDebug("[SYNC][SERVER][INIT]", { port });

  if (serverUrl) {
    logSyncDebug("[SYNC][SERVER][INIT] already-started", { url: serverUrl });
    return { url: serverUrl };
  }

  if (startPromise) {
    return startPromise;
  }

  startPromise = (async () => {
    if (isExpoGo) {
      if (!hasLoggedExpoGoWsUnsupported && shouldLogDev) {
        hasLoggedExpoGoWsUnsupported = true;
      }
      return null;
    }

    const WebsocketServerCtor = getWebsocketServerCtor();
    if (!WebsocketServerCtor) {
      warn("[sync] react-native-websocket-server is unavailable.");
      return null;
    }

    const ipAddress = await Network.getIpAddressAsync();
    if (!ipAddress || ipAddress === "0.0.0.0") {
      warn("[sync] Could not resolve a valid local IP address.");
      return null;
    }

    const instance = new WebsocketServerCtor("0.0.0.0", port);
    instance.on("connection", (socket: SocketClient) => {
      const socketId = getSocketId(socket);
      clients.set(socketId, socket);
      logSyncDebug(`[sync] client connected: ${socketId}`);
      sendInitialData(socket)
        .then(() => {
          logSyncDebug("[SYNC] FULL_SYNC SENT");
        })
        .catch((error) => {
          warn("[sync] failed to send full sync", error);
        });

      socket.on("message", async (raw) => {
        const incoming = parseIncoming(raw);
        if (!incoming) {
          const rawType = typeof raw;
          const rawKeys = raw && typeof raw === "object" ? Object.keys(raw as Record<string, unknown>) : [];
          warn("[SYNC][SERVER][PARSE_IGNORED]", { rawType, rawKeys });
          return;
        }

        const incomingClientId = normalizeOptionalString(
          (incoming as SyncIncomingMessage & { clientId?: unknown }).clientId
        );
        if (incomingClientId) {
          socketClientIds.set(socketId, incomingClientId);
        }

        const suppressionKey = keyFromIncomingMessage(incoming);
        if (suppressionKey) {
          rememberBroadcastSuppression(suppressionKey, socketId, incomingClientId ?? undefined);
        }

        const incomingId = getIncomingMessageId(incoming);
        const receivedAt = Date.now();
        logSyncDebug("[SYNC][RECEIVE]", incomingId ?? "-", incoming.type);

        if (incomingId && processedMessageIds.has(incomingId)) {
          logSyncDebug("[SYNC][DEDUP]", incomingId, "ignored");
          logSyncDebug("[SYNC][APPLY]", incomingId, "duplicate-ignored");
          sendAck(socket, incomingId, receivedAt, Date.now(), "OK");
          return;
        }

        if (incomingId) {
          rememberProcessedMessage(incomingId);
        }

        try {
          await handleIncomingMessage(socket, incoming);
          const appliedAt = Date.now();
          if (incomingId) {
            sendAck(socket, incomingId, receivedAt, appliedAt, "OK");
          }
        } catch (error) {
          logError("[SYNC][ERROR]", incomingId ?? "-", error);
          if (incomingId) {
            sendAck(socket, incomingId, receivedAt, Date.now(), "ERROR");
          }
          warn("[sync] failed handling message", error);
        }
      });

      socket.on("disconnected", () => {
        clients.delete(socketId);
        socketClientIds.delete(socketId);
        logSyncDebug(`[sync] client disconnected: ${socketId}`);
      });
    });

    instance.start();
    server = instance;
    serverUrl = `ws://${ipAddress}:${port}`;

    try {
      if (!unsubscribeTaskBroadcast) {
        unsubscribeTaskBroadcast = subscribeTaskServerEvents(onTaskEvent);
        logSyncDebug("[SYNC][SERVER][EVENT_REGISTER]", { channel: "task" });
      }

      if (!unsubscribeEntityBroadcast) {
        unsubscribeEntityBroadcast = subscribeEntityServerEvents(onEntityEvent);
        logSyncDebug("[SYNC][SERVER][EVENT_REGISTER]", { channel: "entity" });
      }
    } catch (error) {
      logError("[SYNC][SERVER][EVENT_REGISTER_ERROR]", error);
      throw error;
    }

    logSyncDebug(`[sync] server started at ${serverUrl}`);
    return { url: serverUrl };
  })();

  try {
    return await startPromise;
  } finally {
    startPromise = null;
  }
};

export const stopTaskSyncServer = () => {
  if (server) {
    server.stop();
  }

  server = null;
  serverUrl = null;
  clients.clear();
  socketClientIds.clear();

  if (unsubscribeTaskBroadcast) {
    unsubscribeTaskBroadcast();
    unsubscribeTaskBroadcast = null;
  }

  if (unsubscribeEntityBroadcast) {
    unsubscribeEntityBroadcast();
    unsubscribeEntityBroadcast = null;
  }

  startPromise = null;
};

export const getTaskSyncServerUrl = (): string | null => serverUrl;
