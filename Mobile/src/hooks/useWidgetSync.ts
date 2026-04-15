/**
 * useWidgetSync
 *
 * React hook that keeps the Android contribution widget in sync with task state.
 *
 * Update triggers (in order of speed):
 * 1. Task store change           → debounced incremental sync (500 ms, today only)
 * 2. App foreground (active)     → full sync (ensures widget is always accurate)
 * 3. Mount                       → full sync (covers app startup + BOOT_COMPLETED case)
 * 4. Periodic interval           → full sync every `syncIntervalMs` (default 5 min)
 *
 * Does nothing on iOS or when WidgetBridge is unavailable.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import { useTasksStore } from '@store/useTasksStore';
import WidgetSyncService from '@services/WidgetSyncService';
import type { Task } from '@models/types';

export const useWidgetSync = (
  syncIntervalMs: number = 5 * 60 * 1000, // 5 minutes
  onTasksLoaded?: (count: number) => void
) => {
  const tasksMap = useTasksStore((state) => state.tasks);
  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

  // Track previous task reference to detect real changes vs re-renders
  const prevTasksRef = useRef<Task[]>([]);

  // ── Stable sync callbacks ─────────────────────────────────────────────

  const runFullSync = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      if (onTasksLoaded) {
        const completed = tasks.filter(
          (t) =>
            t?.completed ||
            (Array.isArray(t?.completedDates) && t.completedDates!.length > 0)
        );
        onTasksLoaded(completed.length);
      }
      await WidgetSyncService.updateWidgetWithTasks(tasks);
    } catch (e) {
      console.error('[useWidgetSync] fullSync error:', e);
    }
  }, [tasks, onTasksLoaded]);

  // ── Mount: run full sync once ─────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    runFullSync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs only on mount

  // ── Task changes: incremental sync (debounced) ───────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    // Skip the initial render (already handled by mount effect above)
    if (prevTasksRef.current === tasks) return;
    prevTasksRef.current = tasks;

    // Fast incremental update for today's count
    WidgetSyncService.debouncedUpdate(tasks);
  }, [tasks]);

  // ── App foreground: full sync ─────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          // Full sync on foreground — guaranteed accuracy regardless of what
          // happened while the app was in the background / killed.
          WidgetSyncService.updateWidgetWithTasks(tasks).catch((e) =>
            console.error('[useWidgetSync] foreground sync error:', e)
          );
        }
      }
    );

    return () => subscription.remove();
  }, [tasks]);

  // ── Periodic sync ────────────────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS !== 'android' || syncIntervalMs <= 0) return;

    const interval = setInterval(() => {
      WidgetSyncService.updateWidgetWithTasks(tasks).catch((e) =>
        console.error('[useWidgetSync] interval sync error:', e)
      );
    }, syncIntervalMs);

    return () => clearInterval(interval);
  }, [tasks, syncIntervalMs]);

  // ── Public API ────────────────────────────────────────────────────────
  return {
    /** Manually trigger a full widget sync */
    syncNow: () => WidgetSyncService.updateWidgetWithTasks(tasks),
    /** Clear all widget data */
    clearWidget: () => WidgetSyncService.clearWidgetData(),
    /** Read back stored heatmap data (for debugging) */
    getHeatmapData: () => WidgetSyncService.getHeatmapData(),
    /** Force widget UI redraw without changing data */
    refreshWidget: () => WidgetSyncService.refreshWidget(),
    /** Today's completed task count */
    todayCount: WidgetSyncService.countToday(tasks),
  };
};

export default useWidgetSync;
