import { useEffect, useMemo } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useTasksStore } from '@store/useTasksStore';
import WidgetSyncService from '@services/WidgetSyncService';

export const useWidgetSync = (
  syncIntervalMs: number = 60000,
  onTasksLoaded?: (count: number) => void
) => {
  const tasksMap = useTasksStore((state) => state.tasks);
  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const syncTasks = async () => {
      try {
        const completedTasks = tasks.filter((t) => t?.completed || (Array.isArray(t?.completedDates) && t.completedDates.length > 0));
        if (onTasksLoaded) onTasksLoaded(completedTasks.length);
        await WidgetSyncService.updateWidgetWithTasks(tasks);
      } catch (error) {
        console.error('[useWidgetSync] Error:', error);
      }
    };

    syncTasks();

    if (syncIntervalMs > 0) {
      const interval = setInterval(syncTasks, syncIntervalMs);
      return () => clearInterval(interval);
    }
  }, [tasks, syncIntervalMs, onTasksLoaded]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          WidgetSyncService.updateWidgetWithTasks(tasks).catch((e) =>
            console.error('[useWidgetSync] App open sync error:', e)
          );
        }
      }
    );

    return () => subscription.remove();
  }, [tasks]);

  return {
    syncNow: () => WidgetSyncService.updateWidgetWithTasks(tasks),
    clearWidget: () => WidgetSyncService.clearWidgetData(),
    getHeatmapData: () => WidgetSyncService.getHeatmapData(),
  };
};

export default useWidgetSync;
