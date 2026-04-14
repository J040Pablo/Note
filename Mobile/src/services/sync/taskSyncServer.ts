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
import { createTask, deleteTask, getAllTasks, updateTask } from "@services/tasksService";
import { deleteMetaKey, upsertMetaKey } from "@services/appMetaService";
import { subscribeTaskServerEvents, subscribeEntityServerEvents, type TaskServerEvent } from "@services/sync/taskSyncEvents";
import { fromSyncPriority, toSyncTask, type SyncPriority, type SyncTask } from "@services/sync/taskSyncProtocol";
import type { Task } from "@models/types";
import { isExpoGo, shouldLogDev } from "@utils/runtimeEnv";

type SocketClient = {
  id: string | number;
  on: (eventName: "message" | "disconnected", callback: (payload: unknown) => void) => void;
  send: (payload: string) => void;
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
  | { type: "TASK_TOGGLE"; payload?: { id?: string; completed?: boolean; updatedAt?: number } }
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
      payload?: {
        id?: string;
        parentId?: string | null;
        folderId?: string | null;
        title?: string;
        content?: string;
        createdAt?: number;
        updatedAt?: number;
      };
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
let unsubscribeTaskBroadcast: (() => void) | null = null;
let unsubscribeEntityBroadcast: (() => void) | null = null;
const clients = new Map<string, SocketClient>();
const processedMessageIds = new Map<string, number>();
const pendingFullSyncIds = new Set<string>();
const MAX_PROCESSED_MESSAGE_IDS = 4000;

let hasLoggedExpoGoWsUnsupported = false;

const getSocketId = (socket: SocketClient): string => String(socket.id);

const createMessageId = (): string => `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

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
      console.log("[SYNC][SEND]", id, type);
    }

    socket.send(JSON.stringify(normalized));
  } catch (error) {
    console.warn("[sync] failed to send message", error);
  }
};

const broadcast = (message: unknown) => {
  clients.forEach((socket) => sendToClient(socket, message));
};

const parseIncoming = (raw: unknown): SyncIncomingMessage | null => {
  try {
    if (!raw) return null;

    const value =
      typeof raw === "string"
        ? JSON.parse(raw)
        : typeof raw === "object" && raw !== null && "payload" in (raw as Record<string, unknown>)
        ? raw
        : raw;

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
  console.log("[SYNC][ACK]", messageId, status);
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
    reminders: nextReminders,
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
  console.log("[SYNC] Fetching data...");

  const notes = await getAllNotes().catch((e) => {
    console.error("[SYNC ERROR notes]", e);
    return [];
  });
  const quickNotes = await getAllQuickNotes().catch((e) => {
    console.error("[SYNC ERROR quickNotes]", e);
    return [];
  });
  const tasks = await getAllTasks().catch((e) => {
    console.error("[SYNC ERROR tasks]", e);
    return [];
  });
  const folders = await getAllFolders().catch((e) => {
    console.error("[SYNC ERROR folders]", e);
    return [];
  });

  console.log("[SYNC] Data fetched", {
    notes: notes.length,
    quickNotes: quickNotes.length,
    tasks: tasks.length,
    folders: folders.length,
  });

  const message: SyncFullDataMessage = {
    id: createMessageId(),
    sentAt: Date.now(),
    ackRequired: true,
    type: "FULL_SYNC",
    payload: {
      notes,
      quickNotes,
      tasks: tasks.map(toSyncTask),
      folders,
    },
  };

  if (typeof message.id === "string" && message.id.length > 0) {
    pendingFullSyncIds.add(message.id);
  }

  console.log("[SYNC] SENDING FULL_SYNC");
  sendToClient(socket, message);
  console.log("[SYNC] FULL_SYNC SENT");
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

const handleTaskCreate = async (payload: Extract<SyncIncomingMessage, { type: "TASK_CREATE" }>["payload"]) => {
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
  });
};

const handleTaskUpdate = async (payload: Extract<SyncIncomingMessage, { type: "TASK_UPDATE" }>["payload"]) => {
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

  await updateTask(mapIncomingPayloadToTask(existing, payload));
};

const handleTaskDelete = async (payload: Extract<SyncIncomingMessage, { type: "TASK_DELETE" }>["payload"]) => {
  const id = payload?.id;
  if (!id) return;

  await deleteTask(id);
};

const handleTaskToggle = async (payload: Extract<SyncIncomingMessage, { type: "TASK_TOGGLE" }>["payload"]) => {
  const id = payload?.id;
  if (!id) return;

  const all = await getAllTasks();
  const existing = all.find((task) => String(task.id) === String(id));
  if (!existing) return;

  const completed = typeof payload?.completed === "boolean" ? payload.completed : !existing.completed;
  await updateTask({
    ...existing,
    completed,
    updatedAt: Date.now(),
  });
};

const handleIncomingMessage = async (socket: SocketClient, message: SyncIncomingMessage) => {
  if (message.type === "INIT_SYNC" || message.type === "REQUEST_SYNC") {
    await sendInitialData(socket);
    return;
  }

  if (message.type === "FULL_SYNC_ACK") {
    const syncId = String(message.payload?.id ?? "").trim();
    if (syncId) {
      pendingFullSyncIds.delete(syncId);
      console.log("[SYNC][ACK]", syncId, "FULL_SYNC");
    }
    return;
  }

  if (message.type === "TASK_CREATE") {
    await handleTaskCreate(message.payload);
    return;
  }

  if (message.type === "UPSERT_TASK") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) {
      await handleTaskCreate(message.payload);
      return;
    }

    const all = await getAllTasks();
    const existing = all.find((task) => String(task.id) === id);
    if (!existing) {
      await handleTaskCreate(message.payload);
      return;
    }

    await handleTaskUpdate(message.payload);
    return;
  }

  if (message.type === "TASK_UPDATE") {
    await handleTaskUpdate(message.payload);
    return;
  }

  if (message.type === "TASK_DELETE") {
    await handleTaskDelete(message.payload);
    return;
  }

  if (message.type === "DELETE_TASK") {
    await handleTaskDelete(message.payload);
    return;
  }

  if (message.type === "TASK_TOGGLE") {
    await handleTaskToggle(message.payload);
    return;
  }

  if (message.type === "UPSERT_NOTE") {
    const id = String(message.payload?.id ?? "").trim();
    const title = String(message.payload?.title ?? "").trim();
    if (!id || !title) return;

    const all = await getAllNotes();
    const current = all.find((n) => String(n.id) === id);
    
    // Conflict resolution: skip if incoming is older
    if (current) {
      const incomingUpdatedAt = Number(message.payload?.updatedAt ?? 0);
      const currentUpdatedAt = Number(current.updatedAt ?? 0);
      if (incomingUpdatedAt > 0 && currentUpdatedAt > incomingUpdatedAt) {
        return;
      }
    }

    const folderId = (message.payload?.folderId ?? message.payload?.parentId ?? null) as string | null;
    const content = typeof message.payload?.content === "string" ? message.payload.content : "";

    if (!current) {
      await createNote({
        id,
        title,
        content,
        folderId,
        createdAt: Number(message.payload?.createdAt ?? Date.now()),
        updatedAt: Number(message.payload?.updatedAt ?? Date.now()),
      });
    } else {
      await updateNote({
        ...current,
        title,
        content,
        folderId,
        updatedAt: Number(message.payload?.updatedAt ?? Date.now()),
      });
    }

    return;
  }

  if (message.type === "DELETE_NOTE") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    await deleteNote(id);
    return;
  }

  if (message.type === "UPSERT_QUICK_NOTE") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    const title = String(message.payload?.title ?? "Quick Note").trim() || "Quick Note";
    const content =
      typeof message.payload?.content === "string"
        ? message.payload.content
        : typeof message.payload?.text === "string"
        ? message.payload.text
        : "";
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
      });
    } else {
      await updateQuickNote(id, { title, content, folderId });
    }

    return;
  }

  if (message.type === "DELETE_QUICK_NOTE") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    await deleteQuickNote(id);
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

    if (!current) {
      await createFolder(
        name,
        parentId,
        message.payload?.color ?? null,
        message.payload?.description ?? null,
        message.payload?.imageUrl ?? null,
        message.payload?.bannerUrl ?? null,
        {
          id,
          createdAt: Number(message.payload?.createdAt ?? Date.now()),
          updatedAt: Number(message.payload?.updatedAt ?? Date.now()),
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
        photoPath: message.payload?.imageUrl ?? current.photoPath ?? null,
        bannerPath: message.payload?.bannerUrl ?? current.bannerPath ?? null,
        createdAt: Number(message.payload?.createdAt ?? current.createdAt ?? Date.now()),
        updatedAt: Number(message.payload?.updatedAt ?? Date.now()),
      } as typeof current & { updatedAt: number });
    }

    return;
  }

  if (message.type === "DELETE_FOLDER") {
    const id = String(message.payload?.id ?? "").trim();
    if (!id) return;
    await deleteFolder(id);
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
  if (event.type === "TASK_CREATED" || event.type === "TASK_UPDATED") {
    broadcast({ type: "UPSERT_TASK", payload: event.payload });
    return;
  }
  broadcast({ type: "DELETE_TASK", payload: event.payload });
};

const onEntityEvent = (event: EntityServerEvent) => {
  broadcast(event);
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
  if (serverUrl) {
    return { url: serverUrl };
  }

  if (isExpoGo) {
    if (!hasLoggedExpoGoWsUnsupported && shouldLogDev) {
      hasLoggedExpoGoWsUnsupported = true;
      console.info("[sync] Disabled in Expo Go. Local WebSocket server requires a development build.");
    }
    return null;
  }

  const WebsocketServerCtor = getWebsocketServerCtor();
  if (!WebsocketServerCtor) {
    console.warn("[sync] react-native-websocket-server is unavailable.");
    return null;
  }

  const ipAddress = await Network.getIpAddressAsync();
  if (!ipAddress || ipAddress === "0.0.0.0") {
    console.warn("[sync] Could not resolve a valid local IP address.");
    return null;
  }

  const instance = new WebsocketServerCtor(ipAddress, port);
  instance.on("connection", (socket: SocketClient) => {
    const socketId = getSocketId(socket);
    clients.set(socketId, socket);
    console.log(`[sync] client connected: ${socketId}`);
    console.log("[SYNC] CLIENT CONNECTED");
    console.log("[SYNC][CONNECT] Mobile connected");
    console.log("[SYNC] CALLING sendInitialData");
    sendInitialData(socket)
      .then(() => {
        console.log("[SYNC] FULL_SYNC SENT");
      })
      .catch((error) => {
        console.warn("[sync] failed to send full sync", error);
      });

    socket.on("message", async (raw) => {
      const incoming = parseIncoming(raw);
      if (!incoming) return;

      const incomingId = getIncomingMessageId(incoming);
      const receivedAt = Date.now();
      console.log("[SYNC][RECEIVE]", incomingId ?? "-", incoming.type);

      if (incomingId && processedMessageIds.has(incomingId)) {
        console.log("[SYNC][APPLY]", incomingId, "duplicate-ignored");
        sendAck(socket, incomingId, receivedAt, Date.now(), "OK");
        return;
      }

      try {
        await handleIncomingMessage(socket, incoming);
        const appliedAt = Date.now();
        console.log("[SYNC][APPLY]", incomingId ?? "-", incoming.type);
        if (incomingId) {
          rememberProcessedMessage(incomingId);
          sendAck(socket, incomingId, receivedAt, appliedAt, "OK");
        }
      } catch (error) {
        console.log("[SYNC][ERROR]", incomingId ?? "-", error);
        if (incomingId) {
          sendAck(socket, incomingId, receivedAt, Date.now(), "ERROR");
        }
        console.warn("[sync] failed handling message", error);
      }
    });

    socket.on("disconnected", () => {
      clients.delete(socketId);
      console.log(`[sync] client disconnected: ${socketId}`);
    });
  });

  instance.start();
  server = instance;
  serverUrl = `ws://${ipAddress}:${port}`;

  if (!unsubscribeTaskBroadcast) {
    unsubscribeTaskBroadcast = subscribeTaskServerEvents(onTaskEvent);
  }

  if (!unsubscribeEntityBroadcast) {
    unsubscribeEntityBroadcast = subscribeEntityServerEvents(onEntityEvent);
  }

  console.log(`[sync] server started at ${serverUrl}`);
  return { url: serverUrl };
};

export const stopTaskSyncServer = () => {
  if (server) {
    server.stop();
  }

  server = null;
  serverUrl = null;
  clients.clear();

  if (unsubscribeTaskBroadcast) {
    unsubscribeTaskBroadcast();
    unsubscribeTaskBroadcast = null;
  }

  if (unsubscribeEntityBroadcast) {
    unsubscribeEntityBroadcast();
    unsubscribeEntityBroadcast = null;
  }
};

export const getTaskSyncServerUrl = (): string | null => serverUrl;
