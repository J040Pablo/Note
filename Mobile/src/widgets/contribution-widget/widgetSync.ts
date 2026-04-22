/**
 * widgetSync.ts
 *
 * Orchestrates data flow between JS tasks → SharedPreferences → Android widget.
 *
 * Two sync strategies:
 *
 * 1. FULL sync  – buildContributionMap() over all tasks → send full JSON.
 *    Use on: app startup, foreground restore, after large batch changes.
 *
 * 2. INCREMENTAL sync – count today's completions → sendDayUpdate(today, count).
 *    Use on: single task toggle to minimise write overhead and bridge calls.
 *
 * The bridge module is accessed via NativeModules.WidgetBridge (registered as
 * "WidgetBridge" by WidgetBridgeModule.kt).
 */

import { log, error as logError } from '@utils/logger';
import { NativeModules, Platform } from 'react-native';
import { getDB } from '@db/database';
import {
  buildContributionMap,
  countCompletedToday,
  todayKey,
  type MinimalTask,
} from './contributionData';

type BridgeShape = {
  updateWidgetData?: (json: string) => Promise<void>;
  updateDay?: (date: string, count: number) => Promise<void>;
  getHeatmapData?: () => Promise<string>;
  clearHeatmapData?: () => Promise<void>;
  refreshWidget?: () => Promise<void>;
};

export type WidgetSyncResult = {
  success: boolean;
  operation: string;
  code:
    | 'ok'
    | 'queued'
    | 'unavailable'
    | 'bridge-missing-method'
    | 'execution-error'
    | 'parse-error'
    | 'max-retries-exceeded'
    | 'superseded';
  retries: number;
  error?: string;
};

type WidgetQueueType = 'full-sync' | 'incremental-sync' | 'refresh' | 'clear';

export type WidgetQueueItem = {
  type: WidgetQueueType;
  payload: {
    json?: string;
    date?: string;
    count?: number;
    fallbackJson?: string;
  };
  retries: number;
  id: number;
};

type AnyFn = (...args: any[]) => void;
function debounce<T extends AnyFn>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

type QueueRecord = WidgetQueueItem & {
  resolve: (value: WidgetSyncResult) => void;
};

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000, 5000];
const FAILED_RETRY_SENTINEL = MAX_RETRIES + 1;

let queueCounter = 0;
let isProcessingQueue = false;
const syncQueue: QueueRecord[] = [];
const queuedDbIds = new Set<number>();
let queueDbInitPromise: Promise<void> | null = null;
let currentlyProcessingId: number | null = null;

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const logInfo = (event: string, details?: Record<string, unknown>): void => {
  // Ignorar logs repetitivos que só sujam a tela
  const ignoredEvents = [
    'queued',
    'processing-start',
    'processing-success',
    'incremental-sync-requested',
    'full-sync-requested'
  ];
  if (ignoredEvents.includes(event)) return;

  log('[widgetSync]', event, details ?? {});
};

const _logError = (event: string, details?: Record<string, unknown>): void => {
  logError('[widgetSync]', event, details ?? {});
};

type PersistedWidgetQueueItem = Omit<WidgetQueueItem, 'id'> & { id?: number };

type QueueDbRow = {
  id: number;
  type: string;
  payload: string;
  retries: number;
  createdAt: number;
};

async function ensureQueueTable(): Promise<void> {
  if (!queueDbInitPromise) {
    queueDbInitPromise = (async () => {
      const db = await getDB();
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS widget_sync_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          retries INTEGER NOT NULL DEFAULT 0,
          createdAt INTEGER NOT NULL
        );
      `);
      await db.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_widget_sync_queue_created
        ON widget_sync_queue(createdAt, id);
      `);
    })().catch((error) => {
      queueDbInitPromise = null;
      throw error;
    });
  }

  await queueDbInitPromise;
}

async function insertQueueRow(type: WidgetQueueType, payload: WidgetQueueItem['payload']): Promise<number> {
  await ensureQueueTable();
  const db = await getDB();
  const createdAt = Date.now();
  const payloadJson = JSON.stringify(payload ?? {});
  const result = await db.runAsync(
    'INSERT INTO widget_sync_queue (type, payload, retries, createdAt) VALUES (?, ?, ?, ?)',
    type,
    payloadJson,
    0,
    createdAt
  );
  return Number(result.lastInsertRowId);
}

async function deleteQueueRow(id: number): Promise<void> {
  await ensureQueueTable();
  const db = await getDB();
  await db.runAsync('DELETE FROM widget_sync_queue WHERE id = ?', id);
}

async function updateQueueRowRetries(id: number, retries: number): Promise<void> {
  await ensureQueueTable();
  const db = await getDB();
  await db.runAsync('UPDATE widget_sync_queue SET retries = ? WHERE id = ?', retries, id);
}

async function loadQueueRows(whereSql: string, ...params: Array<string | number>): Promise<QueueDbRow[]> {
  await ensureQueueTable();
  const db = await getDB();
  return db.getAllAsync<QueueDbRow>(
    `SELECT id, type, payload, retries, createdAt
     FROM widget_sync_queue
     WHERE ${whereSql}
     ORDER BY createdAt ASC, id ASC`,
    ...params
  );
}

function isValidQueueType(value: unknown): value is WidgetQueueType {
  return value === 'full-sync' || value === 'incremental-sync' || value === 'refresh' || value === 'clear';
}

function normalizePersistedItem(raw: PersistedWidgetQueueItem): WidgetQueueItem | null {
  if (!isValidQueueType(raw?.type)) return null;

  const retries = Number(raw?.retries ?? 0);
  const item: WidgetQueueItem = {
    id: Number(raw?.id ?? ++queueCounter),
    type: raw.type,
    retries: Number.isFinite(retries) ? Math.max(0, retries) : 0,
    payload: {
      json: typeof raw?.payload?.json === 'string' ? raw.payload.json : undefined,
      date: typeof raw?.payload?.date === 'string' ? raw.payload.date : undefined,
      count: Number.isFinite(Number(raw?.payload?.count)) ? Number(raw.payload.count) : undefined,
      fallbackJson:
        typeof raw?.payload?.fallbackJson === 'string' ? raw.payload.fallbackJson : undefined,
    },
  };
  return item;
}

function rowToPersistedItem(row: QueueDbRow): PersistedWidgetQueueItem | null {
  try {
    if (!isValidQueueType(row.type)) {
      logError('queue-row-invalid-type', { rowId: row.id, type: row.type });
      return null;
    }

    return {
      id: Number(row.id),
      type: row.type,
      retries: Number(row.retries),
      payload: JSON.parse(row.payload ?? '{}'),
    };
  } catch (error) {
    logError('queue-row-parse-failed', {
      rowId: row.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function pushRestoredItems(items: WidgetQueueItem[], source: 'pending' | 'failed'): Promise<number> {
  if (items.length === 0) return 0;

  let restoredCount = 0;

  for (let i = 0; i < items.length; i += 1) {
    const restored = items[i];
    if (queuedDbIds.has(restored.id) || currentlyProcessingId === restored.id) {
      continue;
    }

    syncQueue.push({
      ...restored,
      resolve: () => undefined,
    });
    queuedDbIds.add(restored.id);
    restoredCount += 1;
  }

  if (restoredCount > 0) {
    logInfo('queue-restored', { source, count: restoredCount, queueSize: syncQueue.length });
    void processQueue();
  }

  return restoredCount;
}

async function restorePendingQueueFromStorage(): Promise<number> {
  try {
    const rows = await loadQueueRows('retries <= ?', MAX_RETRIES);
    if (rows.length === 0) return 0;

    const normalized = rows
      .map((row) => rowToPersistedItem(row))
      .filter((item): item is PersistedWidgetQueueItem => item !== null)
      .map((item) => normalizePersistedItem(item))
      .filter((item): item is WidgetQueueItem => item !== null);

    return pushRestoredItems(normalized, 'pending');
  } catch (error) {
    logError('queue-restore-failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

async function restoreFailedQueueFromStorage(): Promise<number> {
  try {
    const rows = await loadQueueRows('retries > ?', MAX_RETRIES);
    if (rows.length === 0) return 0;

    const normalized = rows
      .map((row) => rowToPersistedItem(row))
      .filter((item): item is PersistedWidgetQueueItem => item !== null)
      .map((item) => normalizePersistedItem(item))
      .filter((item): item is WidgetQueueItem => item !== null)
      .map((item) => ({ ...item, retries: 0 }));

    await ensureQueueTable();
    const db = await getDB();
    await db.runAsync('UPDATE widget_sync_queue SET retries = 0 WHERE retries > ?', MAX_RETRIES);

    return pushRestoredItems(normalized, 'failed');
  } catch (error) {
    logError('failed-queue-restore-failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

const getBridge = (): BridgeShape => (NativeModules.WidgetBridge ?? {}) as BridgeShape;

const isAvailable = (): boolean =>
  Platform.OS === 'android' && typeof getBridge().updateWidgetData === 'function';

const unavailableResult = (operation: string, error: string): WidgetSyncResult => ({
  success: false,
  operation,
  code: 'unavailable',
  retries: 0,
  error,
});

const okResult = (operation: string, retries: number): WidgetSyncResult => ({
  success: true,
  operation,
  code: 'ok',
  retries,
});

const errorResult = (
  operation: string,
  code: WidgetSyncResult['code'],
  retries: number,
  error: unknown
): WidgetSyncResult => ({
  success: false,
  operation,
  code,
  retries,
  error: error instanceof Error ? error.message : String(error),
});

const supersededResult = (operation: string): WidgetSyncResult => ({
  success: false,
  operation,
  code: 'superseded',
  retries: 0,
  error: 'Superseded by a newer sync request.',
});

function nextRetryDelayMs(retries: number): number {
  return RETRY_DELAYS_MS[Math.min(retries, RETRY_DELAYS_MS.length - 1)];
}

async function compactQueueForIncoming(itemType: WidgetQueueType): Promise<void> {
  if (syncQueue.length === 0) return;

  for (let i = syncQueue.length - 1; i >= 0; i -= 1) {
    const pending = syncQueue[i];

    const shouldRemove =
      itemType === 'full-sync'
        ? pending.type === 'full-sync' || pending.type === 'incremental-sync'
        : itemType === 'incremental-sync'
          ? pending.type === 'incremental-sync'
          : false;

    if (shouldRemove) {
      syncQueue.splice(i, 1);
      queuedDbIds.delete(pending.id);
      await deleteQueueRow(pending.id);
      pending.resolve(supersededResult(pending.type));
    }
  }
}

function enqueueQueueItem(
  type: WidgetQueueType,
  payload: WidgetQueueItem['payload']
): Promise<WidgetSyncResult> {
  return new Promise<WidgetSyncResult>((resolve) => {
    void (async () => {
      try {
        await compactQueueForIncoming(type);
        const dbId = await insertQueueRow(type, payload);

        const item: QueueRecord = {
          id: dbId,
          type,
          payload,
          retries: 0,
          resolve,
        };

        queueCounter = Math.max(queueCounter, dbId);
        syncQueue.push(item);
        queuedDbIds.add(item.id);
        logInfo('queued', {
          id: item.id,
          type: item.type,
          queueSize: syncQueue.length,
        });
        void processQueue();
      } catch (error) {
        logError('enqueue-failed', {
          type,
          error: error instanceof Error ? error.message : String(error),
        });
        resolve(errorResult(type, 'execution-error', 0, error));
      }
    })();
  });
}

async function executeQueueItem(item: WidgetQueueItem): Promise<WidgetSyncResult> {
  if (Platform.OS !== 'android') {
    return unavailableResult(item.type, 'Platform is not Android.');
  }

  const bridge = getBridge();

  try {
    switch (item.type) {
      case 'full-sync': {
        if (typeof bridge.updateWidgetData !== 'function') {
          return errorResult('full-sync', 'bridge-missing-method', item.retries, 'WidgetBridge.updateWidgetData is not available.');
        }
        await bridge.updateWidgetData(item.payload.json ?? '{}');
        if (typeof bridge.refreshWidget === 'function') {
          await bridge.refreshWidget();
        }
        return okResult('full-sync', item.retries);
      }

      case 'incremental-sync': {
        const date = item.payload.date ?? todayKey();
        const count = Number(item.payload.count ?? 0);

        if (typeof bridge.updateDay === 'function') {
          await bridge.updateDay(date, count);
        } else if (typeof bridge.updateWidgetData === 'function') {
          await bridge.updateWidgetData(item.payload.fallbackJson ?? '{}');
        } else {
          return errorResult(
            'incremental-sync',
            'bridge-missing-method',
            item.retries,
            'Neither WidgetBridge.updateDay nor WidgetBridge.updateWidgetData is available.'
          );
        }

        if (typeof bridge.refreshWidget === 'function') {
          await bridge.refreshWidget();
        }
        return okResult('incremental-sync', item.retries);
      }

      case 'refresh': {
        if (typeof bridge.refreshWidget !== 'function') {
          return errorResult('refresh', 'bridge-missing-method', item.retries, 'WidgetBridge.refreshWidget is not available.');
        }
        await bridge.refreshWidget();
        return okResult('refresh', item.retries);
      }

      case 'clear': {
        if (typeof bridge.clearHeatmapData !== 'function') {
          return errorResult('clear', 'bridge-missing-method', item.retries, 'WidgetBridge.clearHeatmapData is not available.');
        }
        await bridge.clearHeatmapData();
        if (typeof bridge.refreshWidget === 'function') {
          await bridge.refreshWidget();
        }
        return okResult('clear', item.retries);
      }

      default:
        return errorResult(String(item.type), 'execution-error', item.retries, 'Unknown queue item type.');
    }
  } catch (error) {
    return errorResult(item.type, 'execution-error', item.retries, error);
  }
}

async function processQueue(): Promise<void> {
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (syncQueue.length > 0) {
      const current = syncQueue.shift()!;
      currentlyProcessingId = current.id;
      logInfo('processing-start', {
        id: current.id,
        type: current.type,
        retries: current.retries,
        queueSize: syncQueue.length,
      });

      const result = await executeQueueItem(current);

      if (result.success) {
        await deleteQueueRow(current.id);
        queuedDbIds.delete(current.id);
        logInfo('processing-success', {
          id: current.id,
          type: current.type,
          retries: current.retries,
        });
        current.resolve(result);
        continue;
      }

      if (current.retries < MAX_RETRIES) {
        const nextRetries = current.retries + 1;
        const delay = nextRetryDelayMs(current.retries);
        logError('processing-retry', {
          id: current.id,
          type: current.type,
          retries: nextRetries,
          delayMs: delay,
          error: result.error,
        });

        await wait(delay);
        syncQueue.unshift({ ...current, retries: nextRetries });
        await updateQueueRowRetries(current.id, nextRetries);
        continue;
      }

      const finalResult: WidgetSyncResult = {
        ...result,
        code: 'max-retries-exceeded',
        retries: current.retries,
      };
      logError('processing-failed-final', {
        id: current.id,
        type: current.type,
        retries: current.retries,
        error: finalResult.error,
      });
      await updateQueueRowRetries(current.id, FAILED_RETRY_SENTINEL);
      queuedDbIds.delete(current.id);
      current.resolve(finalResult);
    }
  } finally {
    isProcessingQueue = false;
    currentlyProcessingId = null;
  }
}

// ── Exported sync functions ────────────────────────────────────────────

/**
 * Full sync — recomputes the entire 70-day map and sends to native.
 * Safe to call on startup; 70-entry JSON is small (~2 KB).
 */
export async function fullWidgetSync(tasks: MinimalTask[]): Promise<WidgetSyncResult> {
  if (!isAvailable()) {
    const bridge = getBridge();
    const error =
      Platform.OS !== 'android'
        ? 'Platform is not Android.'
        : `WidgetBridge.updateWidgetData unavailable (type=${typeof bridge.updateWidgetData}).`;
    logError('full-sync-unavailable', { error });
    return unavailableResult('full-sync', error);
  }

  try {
    const map = buildContributionMap(tasks, 112);
    const json = JSON.stringify(map);
    logInfo('full-sync-requested', { taskCount: tasks.length, mapKeys: Object.keys(map).length });
    return await enqueueQueueItem('full-sync', { json });
  } catch (e) {
    logError('full-sync-build-error', { error: e instanceof Error ? e.message : String(e) });
    return errorResult('full-sync', 'execution-error', 0, e);
  }
}

/**
 * Incremental sync — only sends today's count to native.
 * Use after a single task toggle for minimal overhead.
 */
export async function incrementalWidgetSync(tasks: MinimalTask[]): Promise<WidgetSyncResult> {
  if (!isAvailable()) {
    const bridge = getBridge();
    const error =
      Platform.OS !== 'android'
        ? 'Platform is not Android.'
        : `WidgetBridge.updateWidgetData unavailable (type=${typeof bridge.updateWidgetData}).`;
    logError('incremental-sync-unavailable', { error });
    return unavailableResult('incremental-sync', error);
  }

  try {
    const today = todayKey();
    const count = countCompletedToday(tasks);
    const fallbackJson = JSON.stringify(buildContributionMap(tasks, 112));
    logInfo('incremental-sync-requested', { today, count, taskCount: tasks.length });
    return await enqueueQueueItem('incremental-sync', {
      date: today,
      count,
      fallbackJson,
    });
  } catch (e) {
    logError('incremental-sync-build-error', { error: e instanceof Error ? e.message : String(e) });
    return errorResult('incremental-sync', 'execution-error', 0, e);
  }
}

/**
 * Debounced incremental sync (500 ms).
 * Attach this to task store changes so rapid toggles don't flood the bridge.
 */
export const debouncedIncrementalSync = debounce(
  (tasks: MinimalTask[]) => {
    void incrementalWidgetSync(tasks);
  },
  500
);

/**
 * Debounced full sync (1000 ms).
 * Use when multiple tasks may change at once (e.g. bulk import).
 */
export const debouncedFullSync = debounce(
  (tasks: MinimalTask[]) => {
    void fullWidgetSync(tasks);
  },
  1000
);

/**
 * Force widget to re-read SharedPreferences and redraw.
 * Call after restoring from backup or when widget appears stale.
 */
export async function refreshWidget(): Promise<WidgetSyncResult> {
  if (!isAvailable()) {
    const error =
      Platform.OS !== 'android'
        ? 'Platform is not Android.'
        : 'WidgetBridge is unavailable; refresh skipped.';
    logError('refresh-unavailable', { error });
    return unavailableResult('refresh', error);
  }

  const bridge = getBridge();
  if (typeof bridge.refreshWidget !== 'function') {
    const error = 'WidgetBridge.refreshWidget is not available.';
    logError('refresh-missing-method', { error });
    return errorResult('refresh', 'bridge-missing-method', 0, error);
  }

  logInfo('refresh-requested');
  return enqueueQueueItem('refresh', {});
}

/**
 * Returns the current stored heatmap data (for debugging).
 */
export async function getStoredHeatmap(): Promise<Record<string, number>> {
  if (!isAvailable()) {
    logError('get-stored-heatmap-unavailable', {
      platform: Platform.OS,
    });
    return {};
  }

  const bridge = getBridge();
  if (typeof bridge.getHeatmapData !== 'function') {
    logError('get-stored-heatmap-missing-method', {
      method: 'getHeatmapData',
    });
    return {};
  }

  try {
    const raw = await bridge.getHeatmapData();
    return JSON.parse(raw);
  } catch (e) {
    logError('get-stored-heatmap-parse-error', {
      error: e instanceof Error ? e.message : String(e),
    });
    return {};
  }
}

/**
 * Clears widget data (for testing / account reset).
 */
export async function clearWidgetData(): Promise<WidgetSyncResult> {
  if (!isAvailable()) {
    const error =
      Platform.OS !== 'android'
        ? 'Platform is not Android.'
        : 'WidgetBridge is unavailable; clear skipped.';
    logError('clear-unavailable', { error });
    return unavailableResult('clear', error);
  }

  const bridge = getBridge();
  if (typeof bridge.clearHeatmapData !== 'function') {
    const error = 'WidgetBridge.clearHeatmapData is not available.';
    logError('clear-missing-method', { error });
    return errorResult('clear', 'bridge-missing-method', 0, error);
  }

  logInfo('clear-requested');
  return enqueueQueueItem('clear', {});
}

/**
 * Sends a precomputed heatmap JSON through the same resilient queue.
 * Useful for compatibility callers that already have the payload.
 */
export async function syncHeatmapJson(json: string): Promise<WidgetSyncResult> {
  if (!isAvailable()) {
    const bridge = getBridge();
    const error =
      Platform.OS !== 'android'
        ? 'Platform is not Android.'
        : `WidgetBridge.updateWidgetData unavailable (type=${typeof bridge.updateWidgetData}).`;
    logError('sync-json-unavailable', { error });
    return unavailableResult('sync-heatmap-json', error);
  }

  try {
    JSON.parse(json);
  } catch (e) {
    logError('sync-json-invalid-payload', {
      error: e instanceof Error ? e.message : String(e),
    });
    return errorResult('sync-heatmap-json', 'parse-error', 0, e);
  }

  logInfo('sync-json-requested');
  return enqueueQueueItem('full-sync', { json });
}

/**
 * Restores any in-flight queue saved before a crash/kill.
 */
export async function restoreWidgetSyncQueue(): Promise<number> {
  const restored = await restorePendingQueueFromStorage();
  return restored;
}

/**
 * Re-processes previously failed items (max-retries-exceeded) when app resumes.
 */
export async function recoverFailedWidgetSync(): Promise<number> {
  const recovered = await restoreFailedQueueFromStorage();
  return recovered;
}
