/**
 * WidgetSyncService
 *
 * Facade over the low-level widgetSync module.
 * Keeps the same public API as before (updateWidgetWithTasks, etc.) so existing
 * callers don't break, while internally delegating to the corrected architecture.
 *
 * Architecture:
 *  updateWidgetWithTasks()  → full sync (app start / foreground restore)
 *  updateTodayCount()       → incremental sync (single task toggle)
 *  refreshWidget()          → force redraw with existing SharedPreferences data
 *  getHeatmapData()         → read current stored map (debug)
 *  clearWidgetData()        → wipe widget data
 */

import { Platform } from 'react-native';
import type { Task } from '@models/types';
import {
  fullWidgetSync,
  incrementalWidgetSync,
  debouncedIncrementalSync,
  debouncedFullSync,
  refreshWidget as nativeRefresh,
  getStoredHeatmap,
  clearWidgetData as nativeClear,
} from '../widgets/contribution-widget/widgetSync';
import {
  buildContributionMap,
  countCompletedToday,
  toDateKey,
  todayKey,
  type ContributionMap,
} from '../widgets/contribution-widget/contributionData';

export type { ContributionMap };

export interface TaskData {
  date: string;
  count: number;
}

class WidgetSyncService {

  // ── Date helpers (kept for backward-compat callers) ──────────────────

  static normalizeDate(dateInput: string | Date | null | undefined): string {
    return toDateKey(dateInput as any);
  }

  static todayKey(): string {
    return todayKey();
  }

  // ── Heatmap generation (pure, no side effects) ───────────────────────

  static generateHeatmapData(tasks: Task[] = []): ContributionMap {
    return buildContributionMap(tasks, 70);
  }

  // ── Sync methods ─────────────────────────────────────────────────────

  /**
   * Full sync — sends all 70 days to native.
   * Use on app start or foreground restore.
   */
  static async updateWidgetWithTasks(tasks: Task[] = []): Promise<void> {
    if (Platform.OS !== 'android') return;
    await fullWidgetSync(tasks);
  }

  /**
   * Incremental sync — only updates today's count.
   * Use immediately after a task is toggled.
   */
  static async updateTodayCount(tasks: Task[]): Promise<void> {
    if (Platform.OS !== 'android') return;
    await incrementalWidgetSync(tasks);
  }

  /**
   * Debounced incremental sync (500 ms).
   * Safe to call in a Zustand subscription or useEffect without flooding.
   */
  static debouncedUpdate(tasks: Task[]): void {
    if (Platform.OS !== 'android') return;
    debouncedIncrementalSync(tasks);
  }

  /**
   * Debounced full sync (1 sec).
   * Use when many tasks may change at once.
   */
  static debouncedFullUpdate(tasks: Task[]): void {
    if (Platform.OS !== 'android') return;
    debouncedFullSync(tasks);
  }

  /**
   * Legacy method — alias for updateWidgetWithTasks.
   * Kept for backward compatibility.
   */
  static async updateWidgetData(heatmapJson: string): Promise<void> {
    if (Platform.OS !== 'android') return;
    const { NativeModules } = require('react-native');
    const Bridge = NativeModules.WidgetBridge;
    if (Bridge?.updateWidgetData) {
      await Bridge.updateWidgetData(heatmapJson);
    }
  }

  /**
   * Returns today's completed task count from the task list.
   */
  static countToday(tasks: Task[]): number {
    return countCompletedToday(tasks);
  }

  // ── Native bridge pass-throughs ──────────────────────────────────────

  static async refreshWidget(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await nativeRefresh();
  }

  static async getHeatmapData(): Promise<ContributionMap> {
    if (Platform.OS !== 'android') return {};
    return getStoredHeatmap();
  }

  static async clearWidgetData(): Promise<void> {
    if (Platform.OS !== 'android') return;
    await nativeClear();
  }

  // ── Legacy groupTasksByDate (kept for widgetIntegrationExample.ts) ───

  static groupTasksByDate(tasks: Task[]): ContributionMap {
    return buildContributionMap(tasks, 70);
  }
}

export default WidgetSyncService;
