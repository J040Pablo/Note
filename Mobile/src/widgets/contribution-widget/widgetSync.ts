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
 * "WidgetBridge" by WidgetDataModule.kt).
 */

import { NativeModules, Platform } from 'react-native';
import {
  buildContributionMap,
  countCompletedToday,
  todayKey,
  type MinimalTask,
} from './contributionData';

// ── Native bridge ──────────────────────────────────────────────────────
// Safely resolves regardless of whether we are on Android or in a test env.
const Bridge: {
  updateWidgetData?: (json: string) => Promise<void>;
  updateDay?: (date: string, count: number) => Promise<void>;
  getHeatmapData?: () => Promise<string>;
  clearHeatmapData?: () => Promise<void>;
  refreshWidget?: () => Promise<void>;
} = NativeModules.WidgetBridge ?? {};

const isAvailable = (): boolean =>
  Platform.OS === 'android' && typeof Bridge.updateWidgetData === 'function';

// ── Debounce helper ────────────────────────────────────────────────────
type AnyFn = (...args: any[]) => void;
function debounce<T extends AnyFn>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return ((...args: any[]) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

// ── Exported sync functions ────────────────────────────────────────────

/**
 * Full sync — recomputes the entire 70-day map and sends to native.
 * Safe to call on startup; 70-entry JSON is small (~2 KB).
 */
export async function fullWidgetSync(tasks: MinimalTask[]): Promise<void> {
  if (!isAvailable()) return;
  try {
    const map = buildContributionMap(tasks, 70);
    await Bridge.updateWidgetData!(JSON.stringify(map));
  } catch (e) {
    console.error('[widgetSync] fullWidgetSync error:', e);
  }
}

/**
 * Incremental sync — only sends today's count to native.
 * Use after a single task toggle for minimal overhead.
 */
export async function incrementalWidgetSync(tasks: MinimalTask[]): Promise<void> {
  if (!isAvailable()) return;
  try {
    const today = todayKey();
    const count = countCompletedToday(tasks);
    if (typeof Bridge.updateDay === 'function') {
      await Bridge.updateDay(today, count);
    } else {
      // Fallback if updateDay is not implemented
      await fullWidgetSync(tasks);
    }
  } catch (e) {
    console.error('[widgetSync] incrementalWidgetSync error:', e);
  }
}

/**
 * Debounced incremental sync (500 ms).
 * Attach this to task store changes so rapid toggles don't flood the bridge.
 */
export const debouncedIncrementalSync = debounce(
  (tasks: MinimalTask[]) => { incrementalWidgetSync(tasks); },
  500
);

/**
 * Debounced full sync (1000 ms).
 * Use when multiple tasks may change at once (e.g. bulk import).
 */
export const debouncedFullSync = debounce(
  (tasks: MinimalTask[]) => { fullWidgetSync(tasks); },
  1000
);

/**
 * Force widget to re-read SharedPreferences and redraw.
 * Call after restoring from backup or when widget appears stale.
 */
export async function refreshWidget(): Promise<void> {
  if (!isAvailable() || typeof Bridge.refreshWidget !== 'function') return;
  try {
    await Bridge.refreshWidget();
  } catch (e) {
    console.error('[widgetSync] refreshWidget error:', e);
  }
}

/**
 * Returns the current stored heatmap data (for debugging).
 */
export async function getStoredHeatmap(): Promise<Record<string, number>> {
  if (!isAvailable() || typeof Bridge.getHeatmapData !== 'function') return {};
  try {
    const raw = await Bridge.getHeatmapData();
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/**
 * Clears widget data (for testing / account reset).
 */
export async function clearWidgetData(): Promise<void> {
  if (!isAvailable() || typeof Bridge.clearHeatmapData !== 'function') return;
  try {
    await Bridge.clearHeatmapData();
  } catch (e) {
    console.error('[widgetSync] clearWidgetData error:', e);
  }
}
