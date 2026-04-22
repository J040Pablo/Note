import { log, warn, error as logError } from '@utils/logger';
type SyncClientStatus = "disconnected" | "connecting" | "connected";

type SyncClientMessage =
  | { type: "INIT_DATA"; payload?: unknown }
  | { type: "TASK_CREATED"; payload?: unknown }
  | { type: "TASK_UPDATED"; payload?: unknown }
  | { type: "TASK_DELETED"; payload?: unknown };

let socket: WebSocket | null = null;
let status: SyncClientStatus = "disconnected";
let currentUrl: string | null = null;

const safeParse = (raw: string): SyncClientMessage | null => {
  try {
    const parsed = JSON.parse(raw) as SyncClientMessage;
    if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const isValidWsUrl = (value: string): boolean => {
  const trimmed = value.trim();
  return /^wss?:\/\//i.test(trimmed);
};

export const connectTaskSyncClient = (url: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const target = url.trim();
    if (!isValidWsUrl(target)) {
      reject(new Error("Invalid WebSocket URL."));
      return;
    }

    if (socket) {
      socket.close();
      socket = null;
    }

    status = "connecting";
    currentUrl = target;

    const ws = new WebSocket(target);
    let settled = false;

    ws.onopen = () => {
      status = "connected";
      ws.send(JSON.stringify({ type: "INIT_SYNC" }));
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    ws.onmessage = (event) => {
      const incoming = safeParse(String(event.data));
      if (!incoming) return;
      log("[sync-client] message", incoming.type);
    };

    ws.onerror = () => {
      status = "disconnected";
      if (!settled) {
        settled = true;
        reject(new Error("Could not connect to sync server."));
      }
    };

    ws.onclose = () => {
      status = "disconnected";
      if (socket === ws) {
        socket = null;
      }
    };

    socket = ws;
  });
};

export const disconnectTaskSyncClient = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
  status = "disconnected";
  currentUrl = null;
};

export const getTaskSyncClientStatus = (): SyncClientStatus => status;

export const getTaskSyncClientUrl = (): string | null => currentUrl;
