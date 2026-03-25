import Constants from "expo-constants";
import * as Network from "expo-network";
import { getAllFolders } from "@services/foldersService";
import { getAllNotes } from "@services/notesService";
import { createTask, deleteTask, getAllTasks, updateTask } from "@services/tasksService";
import { getAllFiles } from "@services/filesService";
import { emitTaskServerEvent, subscribeTaskServerEvents, type TaskServerEvent } from "@services/sync/taskSyncEvents";
import { fromSyncPriority, toSyncTask, type SyncPriority, type SyncTask } from "@services/sync/taskSyncProtocol";
import type { Task } from "@models/types";

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
  | { type: "INIT_SYNC" }
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
  | { type: "TASK_TOGGLE"; payload?: { id?: string; completed?: boolean; updatedAt?: number } };

type SyncTaskPayload = {
  id?: string;
  title?: string;
  completed?: boolean;
  priority?: SyncPriority;
  date?: string | null;
  updatedAt?: number;
};

type SyncInitDataMessage = {
  type: "INIT_DATA";
  payload: {
    notes: unknown[];
    tasks: SyncTask[];
    folders: unknown[];
    files: Array<{ id: string; name: string; path: string }>;
  };
};

const DEFAULT_SYNC_PORT = 8787;

let server: ServerInstance | null = null;
let serverUrl: string | null = null;
let unsubscribeTaskBroadcast: (() => void) | null = null;
const clients = new Map<string, SocketClient>();

const isExpoGo =
  Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";

const getSocketId = (socket: SocketClient): string => String(socket.id);

const sendToClient = (socket: SocketClient, message: unknown) => {
  try {
    socket.send(JSON.stringify(message));
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

const mapIncomingPayloadToTask = (existing: Task, payload: SyncTaskPayload): Task => {
  const nextPriority =
    payload && "priority" in payload && payload.priority
      ? fromSyncPriority(payload.priority as SyncPriority)
      : existing.priority;

  const hasDate = payload && "date" in payload;

  return {
    ...existing,
    text:
      payload && "title" in payload && typeof payload.title === "string"
        ? payload.title.trim() || existing.text
        : existing.text,
    completed:
      payload && "completed" in payload && typeof payload.completed === "boolean"
        ? payload.completed
        : existing.completed,
    priority: nextPriority,
    scheduledDate: hasDate ? (payload.date ?? null) : existing.scheduledDate ?? null,
    scheduledTime: hasDate ? null : existing.scheduledTime ?? null,
    updatedAt: Date.now(),
  };
};

const sendInitialData = async (socket: SocketClient) => {
  const [notes, tasks, folders, files] = await Promise.all([
    getAllNotes(),
    getAllTasks(),
    getAllFolders(),
    getAllFiles(),
  ]);

  const message: SyncInitDataMessage = {
    type: "INIT_DATA",
    payload: {
      notes,
      tasks: tasks.map(toSyncTask),
      folders,
      files: files.map((file) => ({
        id: String(file.id),
        name: file.name,
        path: file.path,
      })),
    },
  };

  sendToClient(socket, message);
};

const handleTaskCreate = async (payload: Extract<SyncIncomingMessage, { type: "TASK_CREATE" }>["payload"]) => {
  const title = (payload?.title ?? "").trim();
  if (!title) return;

  const created = await createTask({
    id: payload?.id,
    text: title,
    priority: fromSyncPriority(payload?.priority),
    scheduledDate: payload?.date ?? null,
    repeatDays: [],
    updatedAt: Number(payload?.updatedAt ?? Date.now()),
  });

  emitTaskServerEvent({ type: "TASK_CREATED", payload: toSyncTask(created) });
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

  const updated = await updateTask(mapIncomingPayloadToTask(existing, payload));
  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updated) });
};

const handleTaskDelete = async (payload: Extract<SyncIncomingMessage, { type: "TASK_DELETE" }>["payload"]) => {
  const id = payload?.id;
  if (!id) return;

  await deleteTask(id);
  emitTaskServerEvent({
    type: "TASK_DELETED",
    payload: { id: String(id), updatedAt: Number(payload?.updatedAt ?? Date.now()) },
  });
};

const handleTaskToggle = async (payload: Extract<SyncIncomingMessage, { type: "TASK_TOGGLE" }>["payload"]) => {
  const id = payload?.id;
  if (!id) return;

  const all = await getAllTasks();
  const existing = all.find((task) => String(task.id) === String(id));
  if (!existing) return;

  const completed = typeof payload?.completed === "boolean" ? payload.completed : !existing.completed;
  const updated = await updateTask({
    ...existing,
    completed,
    updatedAt: Date.now(),
  });

  emitTaskServerEvent({ type: "TASK_UPDATED", payload: toSyncTask(updated) });
};

const handleIncomingMessage = async (socket: SocketClient, message: SyncIncomingMessage) => {
  if (message.type === "INIT_SYNC") {
    await sendInitialData(socket);
    return;
  }

  if (message.type === "TASK_CREATE") {
    await handleTaskCreate(message.payload);
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

  if (message.type === "TASK_TOGGLE") {
    await handleTaskToggle(message.payload);
  }
};

const onTaskEvent = (event: TaskServerEvent) => {
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
    console.warn("[sync] Expo Go does not support local WebSocket server native module. Use development build.");
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

    socket.on("message", async (raw) => {
      const incoming = parseIncoming(raw);
      if (!incoming) return;

      try {
        await handleIncomingMessage(socket, incoming);
      } catch (error) {
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
};

export const getTaskSyncServerUrl = (): string | null => serverUrl;
