import { useEffect } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useTasksStore } from '@store/useTasksStore';
import WidgetSyncService from '@services/WidgetSyncService';

export const useWidgetSync = (
  syncIntervalMs: number = 60000,
  onTasksLoaded?: (count: number) => void
) => {
  const tasks = useTasksStore((state) => Object.values(state.tasks));

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const syncTasks = async () => {
      try {
        const completedTasks = tasks.filter((t) => t?.completed);
        if (onTasksLoaded) onTasksLoaded(completedTasks.length);
        await WidgetSyncService.updateWidgetWithTasks(completedTasks);
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
          const completedTasks = tasks.filter((t) => t?.completed);
          WidgetSyncService.updateWidgetWithTasks(completedTasks).catch((e) =>
            console.error('[useWidgetSync] App open sync error:', e)
          );
        }
      }
    );

    return () => subscription.remove();
  }, [tasks]);

  return {
    syncNow: () =>
      WidgetSyncService.updateWidgetWithTasks(
        tasks.filter((t) => t?.completed)
      ),
    clearWidget: () => WidgetSyncService.clearWidgetData(),
    getHeatmapData: () => WidgetSyncService.getHeatmapData(),
  };
};

export default useWidgetSync;
