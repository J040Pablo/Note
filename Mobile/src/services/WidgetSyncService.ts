import { NativeModules, Platform } from 'react-native';

const TaskWidgetModule: any = NativeModules.TaskWidgetModule;

export interface TaskData {
  date: string;
  count: number;
}

export interface Task {
  id?: string;
  completed?: boolean;
  completedAt?: string | Date;
  dueDate?: string | Date;
  date?: string | Date;
  [key: string]: any;
}

export class WidgetSyncService {
  
  static groupTasksByDate(tasks: Task[] = []): Record<string, number> {
    const grouped: Record<string, number> = {};

    for (const task of tasks) {
      if (!task.completed) continue;
      
      const dateStr = task.completedAt || task.dueDate || task.date;
      if (!dateStr) continue;
      
      const normalized = this.normalizeDate(dateStr);
      grouped[normalized] = (grouped[normalized] || 0) + 1;
    }

    return grouped;
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

  static async updateWidgetWithTasks(tasks: Task[] = []): Promise<void> {
    if (Platform.OS !== 'android' || !TaskWidgetModule?.updateHeatmapData) {
      return;
    }

    try {
      const groupedData = this.groupTasksByDate(tasks);
      const taskDataArray = Object.entries(groupedData).map(([date, count]) => ({
        date,
        count,
      }));

      await TaskWidgetModule.updateHeatmapData(taskDataArray);
    } catch (error) {
      console.error('[Widget] Sync error:', error);
    }
  }

  static async updateWidgetWithTaskData(taskData: TaskData[] = []): Promise<void> {
    if (Platform.OS !== 'android' || !TaskWidgetModule?.updateHeatmapData) {
      return;
    }

    try {
      await TaskWidgetModule.updateHeatmapData(taskData);
    } catch (error) {
      console.error('[Widget] Update error:', error);
    }
  }

  static async getHeatmapData(): Promise<Record<string, number>> {
    if (Platform.OS !== 'android' || !TaskWidgetModule?.getHeatmapData) {
      return {};
    }

    try {
      const jsonString = await TaskWidgetModule.getHeatmapData();
      return JSON.parse(jsonString);
    } catch (error) {
      console.error('[Widget] Get error:', error);
      return {};
    }
  }

  static async clearWidgetData(): Promise<void> {
    if (Platform.OS !== 'android' || !TaskWidgetModule?.clearHeatmapData) {
      return;
    }

    try {
      await TaskWidgetModule.clearHeatmapData();
    } catch (error) {
      console.error('[Widget] Clear error:', error);
    }
  }

  static async refreshWidget(): Promise<void> {
    if (Platform.OS !== 'android' || !TaskWidgetModule?.refreshWidget) {
      return;
    }

    try {
      await TaskWidgetModule.refreshWidget();
    } catch (error) {
      console.error('[Widget] Refresh error:', error);
    }
  }
}

export default WidgetSyncService;
