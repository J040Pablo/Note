import { Platform } from 'react-native';
import type { Task } from '@models/types';
import type { TaskReminderType } from '@models/types';
import { isExpoGo, shouldLogDev } from '@utils/runtimeEnv';

// Dynamically import expo-notifications with error handling
let Notifications: any = null;
let notificationsAvailable = false;
let hasLoggedNotificationsUnavailable = false;

if (isExpoGo) {
  notificationsAvailable = false;
} else {
  try {
    Notifications = require('expo-notifications');

    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      notificationsAvailable = true;
    } catch (error) {
      if (shouldLogDev) {
        console.warn('[Notifications] Service not fully available. Using fallback mode.');
      }
      notificationsAvailable = false;
    }
  } catch (error) {
    if (shouldLogDev) {
      console.warn('[Notifications] Module not available. Notifications disabled.');
    }
    notificationsAvailable = false;
  }
}

const logNotificationsUnavailableOnce = () => {
  if (hasLoggedNotificationsUnavailable || !shouldLogDev) return;
  hasLoggedNotificationsUnavailable = true;
  console.info('[Notifications] Disabled in Expo Go. Use a development build to enable local notifications.');
};

/**
 * Request user permission for notifications
 * Returns false in Expo Go
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!notificationsAvailable || !Notifications) {
    logNotificationsUnavailableOnce();
    return false;
  }

  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (shouldLogDev) {
      console.info(`[Notifications] Permission request result: ${status}`);
    }
    return status === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
};

/**
 * Ensure Android notification channel exists (no-op on iOS)
 */
export const ensureTaskNotificationChannel = async (): Promise<void> => {
  if (!notificationsAvailable || !Notifications) return;

  try {
    if (Platform.OS !== 'android') return;
    await Notifications.setNotificationChannelAsync('tasks', {
      name: 'Tasks',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
    if (shouldLogDev) {
      console.info('[NOTIF] Channel "tasks" set with MAX importance');
    }
  } catch (error) {
    console.error('Error creating notification channel:', error);
  }
};

/**
 * Check if notification permissions are granted
 */
export const hasNotificationPermission = async (): Promise<boolean> => {
  if (!notificationsAvailable || !Notifications) {
    return false;
  }

  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (error) {
    console.error('Error checking notification permission:', error);
    return false;
  }
};

const buildTriggerDate = (scheduledDate: string, scheduledTime: string): Date | null => {
  const [y, m, d] = scheduledDate.split('-').map(Number);
  const [hh, mm] = scheduledTime.split(':').map(Number);

  if (![y, m, d, hh, mm].every(Number.isFinite)) return null;

  const triggerDate = new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
  if (Number.isNaN(triggerDate.getTime())) return null;
  return triggerDate;
};

const REMINDER_OFFSETS: Record<TaskReminderType, number> = {
  AT_TIME: 0,
  '10_MIN_BEFORE': 10 * 60 * 1000,
  '1_HOUR_BEFORE': 60 * 60 * 1000,
  '1_DAY_BEFORE': 24 * 60 * 60 * 1000,
};

const normalizeTaskReminders = (task: Task): TaskReminderType[] => {
  const raw = task.reminders;
  const defaultReminder: TaskReminderType[] = ['AT_TIME'];
  const source = Array.isArray(raw) ? raw : defaultReminder;

  const deduped = Array.from(new Set(source.map(String)));
  return deduped
    .filter((value): value is TaskReminderType => value in REMINDER_OFFSETS)
    .slice(0, 4);
};

/**
 * Schedule task notification at exact task date/time
 * Returns array with notification ID
 * 
 * Note: Only works with development build or physical device with Expo app.
 * Expo Go on SDK 53+ does not support notifications.
 */
export const scheduleTaskNotifications = async (task: Task): Promise<string[]> => {
  // If notifications not available, return empty array
  if (!notificationsAvailable || !Notifications) {
    if (task.scheduledDate && task.scheduledTime) logNotificationsUnavailableOnce();
    return [];
  }

  try {
    await ensureTaskNotificationChannel();

    let hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
      hasPermission = await requestNotificationPermission();
    }

    if (!hasPermission) {
      console.warn('[Notifications] Permission not granted');
      return [];
    }

    if (!task.scheduledDate || !task.scheduledTime || task.completed) {
      if (shouldLogDev) {
        console.info('[Notifications] Skipped scheduling: missing date/time or task already completed.');
      }
      return [];
    }

    const triggerDate = buildTriggerDate(task.scheduledDate, task.scheduledTime);
    if (!triggerDate) {
      console.warn('[Notifications] Invalid scheduled date/time');
      return [];
    }

    if (triggerDate.getTime() <= Date.now()) {
      if (shouldLogDev) {
        console.info('[Notifications] Skipped scheduling: trigger date is in the past.');
      }
      return [];
    }

    const reminders = normalizeTaskReminders(task);
    if (reminders.length === 0) {
      return [];
    }

    const now = Date.now();
    const seenTimestamps = new Set<number>();
    const notificationIds: string[] = [];

    for (const reminder of reminders) {
      const offsetMs = REMINDER_OFFSETS[reminder];
      const reminderDate = new Date(triggerDate.getTime() - offsetMs);
      const reminderTs = reminderDate.getTime();

      if (reminderTs <= now) {
        continue;
      }

      if (seenTimestamps.has(reminderTs)) {
        continue;
      }
      seenTimestamps.add(reminderTs);

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task reminder',
          body: `You need to: ${task.text}`,
          sound: true,
          data: { taskId: task.id },
          ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
        },
        trigger: reminderDate as any,
      });

      notificationIds.push(String(notificationId));
      if (shouldLogDev) {
        console.info(`[Notifications] Scheduled successfully: id=${notificationId}, trigger=${reminderDate.toISOString()}`);
      }
    }

    if (shouldLogDev && notificationIds.length === 0) {
      console.info('[Notifications] No reminders scheduled (all reminders resolved to past timestamps).');
    }

    return notificationIds;
  } catch (error) {
    console.error('Error scheduling task notifications:', error);
    return [];
  }
};

/**
 * Cancel specific notification by ID
 */
export const cancelNotificationById = async (notificationId: string): Promise<void> => {
  if (!notificationsAvailable || !Notifications) {
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.error(`Error canceling notification ${notificationId}:`, error);
  }
};

/**
 * Cancel all notifications for a task
 */
export const cancelTaskNotifications = async (notificationIds?: string[]): Promise<void> => {
  if (!notificationsAvailable || !Notifications) {
    return;
  }

  try {
    if (!notificationIds || notificationIds.length === 0) {
      return;
    }

    for (const id of notificationIds) {
      await cancelNotificationById(id);
    }
  } catch (error) {
    console.error('Error canceling task notifications:', error);
  }
};

/**
 * Reschedule notifications for a task
 * Useful when task is modified
 */
export const rescheduleTaskNotifications = async (task: Task): Promise<string[]> => {
  if (!notificationsAvailable || !Notifications) {
    return [];
  }

  try {
    // Cancel old notifications if they exist
    if (task.notificationIds && task.notificationIds.length > 0) {
      await cancelTaskNotifications(task.notificationIds);
    }

    // Schedule new notifications
    const newNotificationIds = await scheduleTaskNotifications(task);
    return newNotificationIds;
  } catch (error) {
    console.error('Error rescheduling task notifications:', error);
    return [];
  }
};

/**
 * Get all scheduled notifications
 */
export const getScheduledNotifications = async (): Promise<any[]> => {
  if (!notificationsAvailable || !Notifications) {
    return [];
  }

  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
};

/**
 * Check if notifications are available in current environment
 */
export const areNotificationsAvailable = (): boolean => {
  return notificationsAvailable;
};

export const addNotificationResponseListener = (callback: (response: any) => void) => {
  if (!notificationsAvailable || !Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationResponseReceivedListener(callback);
};
