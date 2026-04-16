import { Platform, PermissionsAndroid } from 'react-native';
import type { Task } from '@models/types';
import type { TaskReminderType } from '@models/types';
import { useNotificationsStore } from '@store/useNotificationsStore';
import { isExpoGo, shouldLogDev } from '@utils/runtimeEnv';

// Dynamically import expo-notifications with error handling
let Notifications: any = null;
let notificationsAvailable = false;
let hasLoggedNotificationsUnavailable = false;

// Module-level lock ensures JS thread serialization against instantaneous duplicate triggers
const schedulingLocks = new Map<string, number>();

// Normalise Expo's dual notification payload shape (differs between SDK versions / platforms)
const getTaskIdFromNotification = (n: any): string | undefined =>
  n?.content?.data?.taskId ?? n?.request?.content?.data?.taskId;

const getTriggerTs = (n: any) => {
  const t = n?.trigger?.value ?? n?.request?.trigger?.value;
  return typeof t === 'number'
    ? t
    : t instanceof Date
      ? t.getTime()
      : 0;
};

// Channel is created only once per app session — no need to call on every scheduling request
let channelInitialized = false;

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
  const traceId = Math.random().toString(36).substring(7);
  if (shouldLogDev) console.info(`[TRACE ${traceId}] Starting scheduleTaskNotifications for task=${task.id}`);

  // If notifications not available, return empty array
  if (!notificationsAvailable || !Notifications) {
    if (task.scheduledDate && task.scheduledTime) logNotificationsUnavailableOnce();
    return [];
  }

  // ─── PRE-LOCK PHASE ────────────────────────────────────────────────────────
  // All slow async I/O runs here, before acquiring the lock.
  // This prevents long lock contention caused by permission dialogs or OS calls.

  // Basic field validation
  if (!task.scheduledDate || !task.scheduledTime || task.completed) {
    const reason = !task.scheduledDate || !task.scheduledTime
      ? 'missing scheduledDate/scheduledTime'
      : 'task is completed';
    console.info(`[TRACE ${traceId}] Skipped scheduling for task=${task.id}: ${reason}`);
    return [];
  }

  // Permission check (may show a dialog — must NOT be inside the lock)
  if (!channelInitialized) {
    await ensureTaskNotificationChannel();
    channelInitialized = true;
  }
  let hasPermission = await hasNotificationPermission();
  if (shouldLogDev) {
    console.info(`[TRACE ${traceId}] Permission before scheduling task=${task.id}: ${String(hasPermission)}`);
  }
  if (!hasPermission) {
    hasPermission = await requestNotificationPermission();
  }
  if (!hasPermission) {
    console.warn(`[TRACE ${traceId}] Permission not granted. Skipping schedule for task=${task.id}`);
    return [];
  }

  // Build and validate the trigger date (pure computation — no I/O)
  const triggerDate = buildTriggerDate(task.scheduledDate, task.scheduledTime);
  if (!triggerDate) {
    console.warn(`[TRACE ${traceId}] Invalid scheduled date/time for task=${task.id} date=${task.scheduledDate} time=${task.scheduledTime}`);
    return [];
  }
  if (shouldLogDev) {
    console.info(`[TRACE ${traceId}] Base trigger for task=${task.id}: ${triggerDate.toISOString()}`);
  }
  if (triggerDate.getTime() <= Date.now()) {
    console.info(`[TRACE ${traceId}] Skipped scheduling for task=${task.id}: triggerDate is in the past`);
    return [];
  }

  const reminders = normalizeTaskReminders(task);
  if (reminders.length === 0) {
    return [];
  }

  // ─── LOCK ACQUISITION ──────────────────────────────────────────────────────
  const existingLock = schedulingLocks.get(task.id);
  if (existingLock !== undefined) {
    if (Date.now() - existingLock > 10000) {
      console.warn(`[TRACE ${traceId}] Stale lock detected (>10s) — overriding for task:`, task.id);
      schedulingLocks.delete(task.id);
    } else {
      console.log(`[TRACE ${traceId}] Lock active, skipping concurrent call for task:`, task.id);
      const live = await getScheduledNotifications();
      return live.filter((n: any) => getTaskIdFromNotification(n) === task.id).map((n: any) => n.identifier);
    }
  }

  schedulingLocks.set(task.id, Date.now());
  if (__DEV__) {
    console.info(`[TRACE ${traceId}] Acquired lock for task:`, task.id);
  }

  try {
    try {
      const resultingNotificationMap = new Map<number, string>();
      const MIN_SAFE_DELAY_MS = 5000;
      const MAX_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;
      const reserved = new Set<number>();

      // Native validation layer: Fetch ALL scheduled notifications directly inside lock
      // NO CACHE: we must be absolutely certain about device sync
      const nativeScheduled = await Notifications.getAllScheduledNotificationsAsync();
      const taskNativeNotifs = nativeScheduled.filter((n: any) => getTaskIdFromNotification(n) === task.id);

      for (const reminder of reminders) {
        const offsetMs = REMINDER_OFFSETS[reminder];
        const reminderDate = new Date(triggerDate.getTime() - offsetMs);
        const reminderTs = reminderDate.getTime();

        const now = Date.now();
        const deltaMs = reminderTs - now;
        const isValidDate = reminderDate instanceof Date && !isNaN(reminderDate.getTime());

        if (!isValidDate) {
          console.error(`[TRACE ${traceId}] Invalid reminderDate — skipping`, { reminder, reminderDate });
          continue;
        }

        if (offsetMs > 0 && Math.abs(reminderDate.getTime() - triggerDate.getTime()) < offsetMs * 0.8) {
          console.warn(`[TRACE ${traceId}] REMINDER COLLAPSED INTO BASE TIME`, { offsetMs, reminderDate: reminderDate.toISOString(), triggerDate: triggerDate.toISOString() });
        }

        if (deltaMs <= MIN_SAFE_DELAY_MS) {
          console.error(`[TRACE ${traceId}] COLLAPSE: Reminder is in the past or dangerously close`, {
            reminder, reminderDate: reminderDate.toISOString(), deltaMs
          });
          continue;
        }

        if (deltaMs > MAX_FUTURE_MS) {
          console.warn(`[TRACE ${traceId}] Too far in the future — Android OEM safety limit exceeded`, {
            reminder, reminderDate: reminderDate.toISOString(), deltaMs
          });
          continue;
        }

        // --- Idempotency Check ---
        // A notification is uniquely identified by: taskId + reminderTimestamp + reminderType
        const existingNative = taskNativeNotifs.find((n: any) => {
          const nReminder = n?.content?.data?.reminderType ?? n?.request?.content?.data?.reminderType;
          return getTriggerTs(n) === reminderTs && nReminder === reminder;
        });

        if (existingNative || reserved.has(reminderTs)) {
          if (shouldLogDev) {
            console.info(`[TRACE ${traceId}] existingNativeFound=${Boolean(existingNative)} reserved=${reserved.has(reminderTs)} reminderType=${reminder} reminderTs=${reminderTs}`);
          }
          if (existingNative) resultingNotificationMap.set(reminderTs, existingNative.identifier);
          continue;
        }

        reserved.add(reminderTs);

        // Last-mile re-check: guard against drift between validation and scheduling
        if (reminderTs <= Date.now()) {
          console.warn(`[TRACE ${traceId}] Became past before scheduling (async drift)`, { reminderTs });
          continue;
        }

        if (__DEV__) {
          console.log(`[TRACE ${traceId}] Scheduling fresh reminder:`, {
            taskId: task.id,
            reminderType: reminder,
            reminderTs,
            triggerDateIso: triggerDate.toISOString(),
            deltaMs,
          });
        }

        // Missing! -> Schedule it
        const payload = {
          content: {
            title: 'Task reminder',
            body: `You need to: ${task.text || 'Complete your task'}`,
            sound: true,
            data: {
              taskId: task.id,
              reminderType: reminder,
              uid: `${task.id}-${reminder}-${reminderTs}`
            },
            ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
          },
          trigger: {
            date: new Date(reminderDate.getTime()),
            ...(Platform.OS === 'android' ? { channelId: 'tasks' } : {}),
          } as any,
        };

        let notificationId = await Notifications.scheduleNotificationAsync(payload);

        // POST-VERIFY OS WRITE
        let verifySchedule = await Notifications.getAllScheduledNotificationsAsync();
        let isScheduled = verifySchedule.some((n: any) => n.identifier === String(notificationId));
        if (!isScheduled) {
          console.warn(`[TRACE ${traceId}] Silent fail detected! Retrying schedule...`);
          notificationId = await Notifications.scheduleNotificationAsync(payload);
        }

        resultingNotificationMap.set(reminderTs, String(notificationId));

        if (shouldLogDev) {
          console.info(`[TRACE ${traceId}] createdId=${notificationId} reminderTs=${reminderTs}`);
        }

        // Anti-batching micro-delay to prevent Android alarm grouping
        await new Promise(r => setTimeout(r, 120));
      }

      const finalIds = Array.from(resultingNotificationMap.values());

      if (shouldLogDev && finalIds.length === 0) {
        console.info(`[TRACE ${traceId}] No actionable reminders for task=${task.id}`);
      }

      // Canonical mapping preserves exactly the correctly matched set
      return finalIds;
    } catch (error) {
      console.error(`[TRACE ${traceId}] Error scheduling task notifications:`, error);
      const live = await getScheduledNotifications();
      return live.filter((n: any) => getTaskIdFromNotification(n) === task.id).map((n: any) => n.identifier);
    }
  } finally {
    schedulingLocks.delete(task.id);
    if (__DEV__) {
      console.log(`[TRACE ${traceId}] Released lock for task:`, task.id);
    }
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
 * Cancel all notifications natively bound to a task by taskId
 */
export const cancelTaskNotifications = async (taskId: string): Promise<void> => {
  if (!notificationsAvailable || !Notifications) {
    return;
  }

  try {
    const live = await getScheduledNotifications();
    const idsToCancel = live
      .filter((n: any) => getTaskIdFromNotification(n) === taskId)
      .map((n: any) => n.identifier);

    if (idsToCancel.length === 0) {
      if (shouldLogDev) console.info(`[NOTIF][CANCEL] No notifications found for task=${taskId}.`);
      return;
    }

    if (shouldLogDev) {
      console.info(`[NOTIF][CANCEL] Canceling ${idsToCancel.length} notifications for task=${taskId}.`);
    }

    for (const id of idsToCancel) {
      await cancelNotificationById(id);
    }

    // Flush + Verify Loop
    for (let i = 0; i < 3; i++) {
      const verifyLive = await getScheduledNotifications();
      const stillAlive = verifyLive.some((n: any) => getTaskIdFromNotification(n) === taskId);
      if (!stillAlive) break;
      await new Promise(r => setTimeout(r, 75));
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
    // Rely exclusively on OS to shred anything matching the task
    await cancelTaskNotifications(task.id);

    // allow native layer to settle
    await new Promise(res => setTimeout(res, 50));

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

export const setupNotificationHistoryListeners = () => {
  if (!notificationsAvailable || !Notifications) return { remove: () => { } };

  const receivedSub = Notifications.addNotificationReceivedListener((notification: any) => {
    const content = notification?.request?.content;
    const identifier = notification?.request?.identifier ?? `${Date.now()}-${Math.random()}`;

    useNotificationsStore.getState().addNotification({
      id: identifier,
      title: content?.title ?? "Notification",
      body: content?.body ?? "",
      taskId: content?.data?.taskId,
      receivedAt: Date.now(),
    });
  });

  // Tap listener (Response)
  const responseSub = Notifications.addNotificationResponseReceivedListener((response: any) => {
    const content = response?.notification?.request?.content;
    const identifier = response?.notification?.request?.identifier ?? `${Date.now()}-${Math.random()}`;

    const state = useNotificationsStore.getState();
    const existing = state.notifications.find((n) => n.id === identifier);

    if (existing) {
      if (existing.read === 0) {
        state.markAsRead(identifier);
      }
    } else {
      // Race condition: tap received before 'received' event
      state.addNotification({
        id: identifier,
        title: content?.title ?? "Notification",
        body: content?.body ?? "",
        taskId: content?.data?.taskId,
        receivedAt: Date.now(),
        read: 1, // Add as already read
      });
    }
  });

  return {
    remove: () => {
      receivedSub.remove();
      responseSub.remove();
    }
  };
};

export const addNotificationResponseListener = (callback: (response: any) => void) => {
  if (!notificationsAvailable || !Notifications) {
    return { remove: () => { } };
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
