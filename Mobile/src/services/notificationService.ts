import { Platform, PermissionsAndroid } from 'react-native';
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
        }),
      });
      notificationsAvailable = true;
    } catch (error) {
      if (shouldLogDev) {
        console.warn('[Notifications] Handler registration failed. Continuing with module fallback mode.');
      }
      // Keep notifications enabled if module exists; handler options can vary by SDK.
      notificationsAvailable = true;
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
    const current = await Notifications.getPermissionsAsync();
    if (shouldLogDev) {
      console.info(`[NOTIF][PERMISSION] Current permission: status=${current.status}, canAskAgain=${String(current.canAskAgain)}`);
    }

    if (current.status === 'granted') {
      return true;
    }

    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      try {
        const androidResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (shouldLogDev) {
          console.info(`[NOTIF][PERMISSION] Android POST_NOTIFICATIONS: ${androidResult}`);
        }
      } catch (androidPermissionError) {
        console.warn('[Notifications] Android POST_NOTIFICATIONS request failed:', androidPermissionError);
      }
    }

    const { status } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    if (shouldLogDev) {
      console.info(`[NOTIF][PERMISSION] Permission request result: ${status}`);
    }
    if (status !== 'granted') {
      console.warn('[Notifications] Permission denied by user - notifications will not work');
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
  const normalized = deduped
    .filter((value): value is TaskReminderType => value in REMINDER_OFFSETS)
    .slice(0, 4);

  if (normalized.length === 0 && shouldLogDev) {
    console.info('[NOTIF][SCHEDULE] No valid reminders found, defaulting to [AT_TIME]');
  }
  return normalized.length > 0 ? normalized : defaultReminder;
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
    if (shouldLogDev) {
      console.info(`[NOTIF][PERMISSION] Before scheduling task=${task.id}: ${String(hasPermission)}`);
    }
    if (!hasPermission) {
      hasPermission = await requestNotificationPermission();
    }

    if (!hasPermission) {
      console.warn(`[NOTIF][PERMISSION] Permission not granted. Skipping schedule for task=${task.id}`);
      return [];
    }

    if (!task.scheduledDate || !task.scheduledTime || task.completed) {
      const reason = !task.scheduledDate || !task.scheduledTime
        ? 'missing scheduledDate/scheduledTime'
        : 'task is completed';
      console.info(`[NOTIF][SCHEDULE] Skipped scheduling for task=${task.id}: ${reason}`);
      return [];
    }

    const triggerDate = buildTriggerDate(task.scheduledDate, task.scheduledTime);
    if (!triggerDate) {
      console.warn(`[NOTIF][SCHEDULE] Invalid scheduled date/time for task=${task.id} date=${task.scheduledDate} time=${task.scheduledTime}`);
      return [];
    }

    if (shouldLogDev) {
      console.info(`[NOTIF][SCHEDULE] Base trigger for task=${task.id}: ${triggerDate.toISOString()}`);
    }

    // Validate trigger is in future (including time of day for today)
    const now = new Date();
    const isToday = triggerDate.toDateString() === now.toDateString();
    const isPastTime = isToday && triggerDate.getTime() <= now.getTime();
    
    if (triggerDate.getTime() <= Date.now() || isPastTime) {
      const reason = isToday ? 'time already passed today' : 'date is in the past';
      console.info(`[NOTIF][SCHEDULE] Skipped scheduling for task=${task.id}: ${reason}`);
      return [];
    }

    const reminders = normalizeTaskReminders(task);
    if (reminders.length === 0) {
      return [];
    }

    const nowMs = Date.now();
    const seenTimestamps = new Set<number>();
    const notificationIds: string[] = [];

    for (const reminder of reminders) {
      const offsetMs = REMINDER_OFFSETS[reminder];
      const reminderDate = new Date(triggerDate.getTime() - offsetMs);
      const reminderTs = reminderDate.getTime();

      if (reminderTs <= nowMs) {
        if (shouldLogDev) {
          console.info(`[NOTIF][SCHEDULE] Skipped reminder=${reminder} for task=${task.id}: trigger already in the past (${reminderDate.toISOString()})`);
        }
        continue;
      }

      if (seenTimestamps.has(reminderTs)) {
        if (shouldLogDev) {
          console.info(`[NOTIF][SCHEDULE] Skipped reminder=${reminder} for task=${task.id}: duplicate trigger timestamp`);
        }
        continue;
      }
      seenTimestamps.add(reminderTs);

      if (shouldLogDev) {
        console.info(`[NOTIF][SCHEDULE] Scheduling reminder=${reminder} for task=${task.id} at ${reminderDate.toISOString()}`);
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Task reminder',
          body: `You need to: ${task.text}`,
          sound: true,
          data: { taskId: task.id },
          ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
        },
        trigger: {
          date: reminderDate,
          ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
        } as any,
      });

      notificationIds.push(String(notificationId));
      if (shouldLogDev) {
        console.info(`[NOTIF][SCHEDULE] Scheduled successfully: id=${notificationId}, trigger=${reminderDate.toISOString()}`);
      }
    }

    if (shouldLogDev && notificationIds.length === 0) {
      console.info(`[NOTIF][SCHEDULE] No reminders scheduled for task=${task.id} (all reminders resolved to past timestamps).`);
    }

    if (shouldLogDev) {
      const allScheduled = await getScheduledNotifications();
      console.info(`[NOTIF][SCHEDULE] Total scheduled notifications on device: ${allScheduled.length}`);
      allScheduled.forEach((item: any, idx: number) => {
        const identifier = item?.identifier ?? `index-${idx}`;
        const date = item?.trigger?.value ? new Date(item.trigger.value).toISOString() : 'unknown';
        const channelId = item?.content?.channelId ?? item?.request?.content?.channelId ?? 'unknown';
        const taskId = item?.content?.data?.taskId ?? item?.request?.content?.data?.taskId ?? 'unknown';
        console.info(`[NOTIF][SCHEDULE] [${idx}] id=${identifier} trigger=${date} taskId=${String(taskId)} channelId=${String(channelId)}`);
      });
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
    if (shouldLogDev) {
      console.info(`[NOTIF][CANCEL] Canceled notification id=${notificationId}`);
    }
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
      if (shouldLogDev) {
        console.info('[NOTIF][CANCEL] No notification IDs to cancel.');
      }
      return;
    }

    if (shouldLogDev) {
      console.info(`[NOTIF][CANCEL] Canceling ${notificationIds.length} notifications.`);
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

export const logScheduledNotificationsDetailed = async (): Promise<void> => {
  if (!__DEV__) return;

  const items = await getScheduledNotifications();
  console.info(`[NOTIF][SCHEDULE] Detailed scheduled notifications count=${items.length}`);
  items.forEach((item: any, idx: number) => {
    const identifier = item?.identifier ?? item?.request?.identifier ?? `index-${idx}`;
    const timestamp = item?.trigger?.value ?? item?.request?.trigger?.value ?? null;
    const triggerIso = timestamp ? new Date(timestamp).toISOString() : 'unknown';
    const content = item?.content ?? item?.request?.content ?? {};
    const taskId = content?.data?.taskId ?? 'unknown';
    const channelId = content?.channelId ?? item?.trigger?.channelId ?? item?.request?.trigger?.channelId ?? 'unknown';
    console.info(
      `[NOTIF][SCHEDULE] [${idx}] id=${String(identifier)} trigger=${triggerIso} taskId=${String(taskId)} channelId=${String(channelId)}`
    );
  });
};

/**
 * Check if notifications are available in current environment
 */
export const areNotificationsAvailable = (): boolean => {
  return notificationsAvailable;
};

/**
 * Schedule a test notification in ~5 seconds for debugging.
 * Useful to validate permission, channel setup and runtime delivery.
 */
export const scheduleTestNotification = async (): Promise<string | null> => {
  if (!notificationsAvailable || !Notifications) {
    logNotificationsUnavailableOnce();
    return null;
  }

  try {
    await ensureTaskNotificationChannel();

    let hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
      hasPermission = await requestNotificationPermission();
    }

    if (!hasPermission) {
      console.warn('[Notifications] Test notification skipped: permission not granted.');
      return null;
    }

    const triggerDate = new Date(Date.now() + 5000);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Notification test',
        body: 'If you see this, local notifications are working.',
        sound: true,
        data: { type: 'test-notification' },
        ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
      },
      trigger: {
        date: triggerDate,
        ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
      } as any,
    });

    if (shouldLogDev) {
      console.info(`[Notifications] Test notification scheduled: id=${id}, trigger=${triggerDate.toISOString()}`);
      const allScheduled = await getScheduledNotifications();
      console.info(`[Notifications] Total scheduled notifications on device after test schedule: ${allScheduled.length}`);
    }

    return String(id);
  } catch (error) {
    console.error('[Notifications] Error scheduling test notification:', error);
    return null;
  }
};

export const addNotificationResponseListener = (callback: (response: any) => void) => {
  if (!notificationsAvailable || !Notifications) {
    return { remove: () => {} };
  }
  return Notifications.addNotificationResponseReceivedListener(callback);
};

export const getLastNotificationResponse = async (): Promise<any | null> => {
  if (!notificationsAvailable || !Notifications) {
    return null;
  }

  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch (error) {
    console.error('[Notifications] Error getting last notification response:', error);
    return null;
  }
};

export const sendPomodoroModeSwitchNotification = async (enteredMode: "focus" | "break"): Promise<void> => {
  if (!notificationsAvailable || !Notifications) {
    return;
  }

  try {
    await ensureTaskNotificationChannel();

    let hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
      hasPermission = await requestNotificationPermission();
    }

    if (!hasPermission) {
      return;
    }

    const body = enteredMode === "break"
      ? "Focus time ended. Time for a break!"
      : "Break finished. Back to focus!";

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Pomodoro",
        body,
        sound: true,
        data: { type: "pomodoro-mode-switch", mode: enteredMode },
        ...(Platform.OS === "android" ? { channelId: "tasks" } : {})
      },
      trigger: null
    });
  } catch (error) {
    console.error("[Notifications] Error sending Pomodoro mode notification:", error);
  }
};
