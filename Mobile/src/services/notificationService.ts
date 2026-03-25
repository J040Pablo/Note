import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Task } from '@models/types';
import type { TaskReminderType } from '@models/types';

// Dynamically import expo-notifications with error handling
let Notifications: any = null;
let notificationsAvailable = false;

const isExpoGo =
  Constants.executionEnvironment === 'storeClient' ||
  Constants.appOwnership === 'expo';

if (isExpoGo) {
  console.warn('[Notifications] Expo Go detected. Local scheduling is disabled in this environment.');
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
      console.warn('[Notifications] Service not fully available. Using fallback mode.');
      notificationsAvailable = false;
    }
  } catch (error) {
    console.warn('[Notifications] Module not available. Notifications disabled.');
    notificationsAvailable = false;
  }
}

/**
 * Request user permission for notifications
 * Returns false in Expo Go
 */
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!notificationsAvailable || !Notifications) {
    console.warn('[Notifications] Not available in Expo Go. Use `eas build` for development build.');
    return false;
  }

  try {
    const { status } = await Notifications.requestPermissionsAsync();
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
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
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
    if (task.scheduledDate && task.scheduledTime) {
      console.log(`[Notifications] Would schedule reminder for: ${task.text} (${task.scheduledDate} ${task.scheduledTime})`);
      console.log('[Notifications] To enable notifications:');
      console.log('  1. Run: eas build --platform android --profile preview');
      console.log('  2. Install the development build on your device');
      console.log('  3. Notifications will work automatically');
    }
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
      return [];
    }

    const triggerDate = buildTriggerDate(task.scheduledDate, task.scheduledTime);
    if (!triggerDate) {
      console.warn('[Notifications] Invalid scheduled date/time');
      return [];
    }

    if (triggerDate.getTime() <= Date.now()) {
      console.log('[Notifications] Skipping past trigger date');
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
          ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
        },
        trigger: reminderDate as any,
      });

      notificationIds.push(String(notificationId));
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
