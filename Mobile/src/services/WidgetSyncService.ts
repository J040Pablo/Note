import { NativeModules, Platform } from 'react-native';
import type { Task } from '@models/types';

const WidgetBridge: any = NativeModules.WidgetBridge ?? NativeModules.TaskWidgetModule;

export interface TaskData {
  date: string;
  count: number;
}

export class WidgetSyncService {
  static getLast30DayKeys(): string[] {
    const keys: string[] = [];
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      keys.push(this.normalizeDate(d));
    }

    return keys;
  }

  static generateHeatmapData(tasks: Task[] = []): Record<string, number> {
    const keys = this.getLast30DayKeys();
    const heatmap: Record<string, number> = {};
    keys.forEach((k) => {
      heatmap[k] = 0;
    });

    for (const task of tasks) {
      const completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];

      if (completedDates.length > 0) {
        for (const key of completedDates) {
          if (key in heatmap) {
            heatmap[key] = (heatmap[key] || 0) + 1;
          }
        }
        continue;
      }

      if (task.completed) {
        const fallbackDate = task.scheduledDate ?? this.normalizeDate(new Date(task.updatedAt || Date.now()));
        if (fallbackDate in heatmap) {
          heatmap[fallbackDate] = (heatmap[fallbackDate] || 0) + 1;
        }
      }
    }

    return heatmap;
  }
  
  static normalizeDate(dateInput: string | Date | null | undefined): string {
    if (!dateInput) return new Date().toISOString().split('T')[0];
    
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    
    if (isNaN(date.getTime())) {
      return new Date().toISOString().split('T')[0];
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  static async updateWidgetData(heatmapJson: string): Promise<void> {
    if (Platform.OS !== 'android' || !WidgetBridge?.updateWidgetData) {
      return;
    }

    await WidgetBridge.updateWidgetData(heatmapJson);
  }

  static async updateWidgetWithTasks(tasks: Task[] = []): Promise<void> {
    if (Platform.OS !== 'android' || !WidgetBridge?.updateWidgetData) {
      return;
    }

    try {
      const groupedData = this.generateHeatmapData(tasks);
      await this.updateWidgetData(JSON.stringify(groupedData));
    } catch (error) {
      console.error('[Widget] Sync error:', error);
    }
  }

  static async updateWidgetWithTaskData(taskData: TaskData[] = []): Promise<void> {
    if (Platform.OS !== 'android' || !WidgetBridge?.updateWidgetData) {
      return;
    }

    try {
      const map: Record<string, number> = {};
      for (const item of taskData) {
        map[item.date] = item.count;
      }
      await this.updateWidgetData(JSON.stringify(map));
    } catch (error) {
      console.error('[Widget] Update error:', error);
    }
  }

  static async getHeatmapData(): Promise<Record<string, number>> {
    if (Platform.OS !== 'android' || !WidgetBridge?.getHeatmapData) {
      return {};
    }

    try {
      const jsonString = await WidgetBridge.getHeatmapData();
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[Widget] Get error:', error);
      return {};
    }
  }

  static async clearWidgetData(): Promise<void> {
    if (Platform.OS !== 'android' || !WidgetBridge?.clearHeatmapData) {
      return;
    }

    try {
      await WidgetBridge.clearHeatmapData();
    } catch (error) {
      console.error('[Widget] Clear error:', error);
    }
  }

  static async refreshWidget(): Promise<void> {
    if (Platform.OS !== 'android' || !WidgetBridge?.refreshWidget) {
      return;
    }

    try {
      await WidgetBridge.refreshWidget();
    } catch (error) {
      console.error('[Widget] Refresh error:', error);
    }
  }
}

export default WidgetSyncService;
