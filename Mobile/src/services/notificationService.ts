import { Platform, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';
import type {
  Notification,
  NotificationResponse,
  NotificationContentInput,
  NotificationTriggerInput,
  Subscription,
} from 'expo-notifications';
import type { Task, TaskReminderType } from '@models/types';
import { useNotificationsStore } from '@store/useNotificationsStore';
import { isExpoGo, shouldLogDev } from '@utils/runtimeEnv';
import { log, warn, error as logError } from '@utils/logger';

const notificationsAvailable = !isExpoGo;
let hasLoggedNotificationsUnavailable = false;
let channelInitialized = false;

const schedulingQueues = new Map<string, Promise<string[]>>();

const noopSubscription = { remove: () => {} };

const getTaskIdFromNotification = (notification: any): string | undefined =>
  notification?.content?.data?.taskId ??
  notification?.request?.content?.data?.taskId ??
  notification?.notification?.request?.content?.data?.taskId;

const getNotificationIdentifier = (notification: any): string =>
  String(
    notification?.identifier ??
      notification?.request?.identifier ??
      notification?.notification?.request?.identifier ??
      Date.now()
  );

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const logNotificationsUnavailableOnce = () => {
  if (hasLoggedNotificationsUnavailable || !shouldLogDev || notificationsAvailable) return;
  hasLoggedNotificationsUnavailable = true;
  log('[Notifications] Local notifications are only available in development builds.');
};

const buildTriggerDate = (scheduledDate: string, scheduledTime: string): Date | null => {
  const [year, month, day] = scheduledDate.split('-').map(Number);
  const [hour, minute] = scheduledTime.split(':').map(Number);

  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    return null;
  }

  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
};

const REMINDER_OFFSETS: Record<TaskReminderType, number> = {
  AT_TIME: 0,
  '10_MIN_BEFORE': 10 * 60 * 1000,
  '1_HOUR_BEFORE': 60 * 60 * 1000,
  '1_DAY_BEFORE': 24 * 60 * 60 * 1000,
};

const normalizeTaskReminders = (task: Task): TaskReminderType[] => {
  const source = Array.isArray(task.reminders) ? task.reminders : ['AT_TIME'];
  const deduped = Array.from(new Set(source.map(String)));
  const valid = deduped.filter((value): value is TaskReminderType => value in REMINDER_OFFSETS);
  return valid.length > 0 ? valid : ['AT_TIME'];
};

const buildTaskNotificationContent = (
  task: Task,
  reminder: TaskReminderType
): NotificationContentInput => ({
  title: 'Task Reminder',
  body: task.text || 'You have a task to complete',
  data: { taskId: task.id, reminderType: reminder },
  sound: 'default',
  priority: Notifications.AndroidNotificationPriority.MAX,
});

const buildDateTrigger = (date: Date): NotificationTriggerInput => ({
  type: Notifications.SchedulableTriggerInputTypes.DATE,
  date,
  channelId: 'tasks',
});

const buildTimeIntervalTrigger = (seconds: number): NotificationTriggerInput => ({
  type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
  seconds,
  repeats: false,
  channelId: 'tasks',
});

const scheduleTaskNotificationsInternal = async (task: Task): Promise<string[]> => {
  if (!notificationsAvailable) {
    logNotificationsUnavailableOnce();
    return [];
  }

  if (!task.scheduledDate || !task.scheduledTime || task.completed) {
    await cancelTaskNotifications(task.id);
    return [];
  }

  const ids: string[] = [];

  try {
    await ensureTaskNotificationChannel();

    if (!(await hasNotificationPermission())) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        return [];
      }
    }

    const triggerBase = buildTriggerDate(task.scheduledDate, task.scheduledTime);
    if (!triggerBase) {
      await cancelTaskNotifications(task.id);
      return [];
    }

    await cancelTaskNotifications(task.id);

    const reminders = normalizeTaskReminders(task);
    const now = Date.now();

    for (const reminder of reminders) {
      const triggerMs = triggerBase.getTime() - REMINDER_OFFSETS[reminder];
      if (!Number.isFinite(triggerMs) || triggerMs <= now) {
        continue;
      }

      const identifier = await Notifications.scheduleNotificationAsync({
        content: buildTaskNotificationContent(task, reminder),
        trigger: buildDateTrigger(new Date(triggerMs)),
      });

      ids.push(identifier);
    }
  } catch (error) {
    logError('Scheduling error:', error);
  }

  return ids;
};

export const addNotificationResponseListener = (
  callback: (response: NotificationResponse) => void
): Subscription | { remove: () => void } => {
  if (!notificationsAvailable) {
    logNotificationsUnavailableOnce();
    return noopSubscription;
  }

  return Notifications.addNotificationResponseReceivedListener(callback);
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!notificationsAvailable) {
    logNotificationsUnavailableOnce();
    return false;
  }

  try {
    const currentPermissions = await Notifications.getPermissionsAsync();
    if (currentPermissions.granted || currentPermissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }

    if (Platform.OS === 'android' && Number(Platform.Version) >= 33) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    }

    const requestedPermissions = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });

    return (
      requestedPermissions.granted ||
      requestedPermissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    logError('Permission request error:', error);
    return false;
  }
};

export const ensureTaskNotificationChannel = async (): Promise<void> => {
  if (Platform.OS !== 'android' || !notificationsAvailable || channelInitialized) {
    return;
  }

  try {
    await Notifications.setNotificationChannelAsync('tasks', {
      name: 'Tasks',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
    });

    channelInitialized = true;
  } catch (error) {
    logError('Channel error:', error);
  }
};

export const hasNotificationPermission = async (): Promise<boolean> => {
  if (!notificationsAvailable) {
    return false;
  }

  try {
    const permissions = await Notifications.getPermissionsAsync();
    return (
      permissions.granted ||
      permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch (error) {
    return false;
  }
};

export const cancelTaskNotifications = async (taskId: string): Promise<void> => {
  if (!notificationsAvailable) {
    return;
  }

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const matching = scheduled.filter((notification) => getTaskIdFromNotification(notification) === taskId);

    await Promise.all(
      matching.map((notification) =>
        Notifications.cancelScheduledNotificationAsync(notification.identifier)
      )
    );
  } catch (error) {
    logError('Cancel error:', error);
  }
};

export const cancelTaskNotificationsForced = cancelTaskNotifications;

export const scheduleTaskNotifications = async (task: Task): Promise<string[]> => {
  if (!task?.id) {
    return [];
  }

  const previousQueue = schedulingQueues.get(task.id) ?? Promise.resolve([]);
  const nextQueue = previousQueue
    .catch(() => [])
    .then(() => scheduleTaskNotificationsInternal(task));

  schedulingQueues.set(task.id, nextQueue);

  try {
    return await nextQueue;
  } finally {
    if (schedulingQueues.get(task.id) === nextQueue) {
      schedulingQueues.delete(task.id);
    }
  }
};

export const rescheduleTaskNotifications = async (task: Task): Promise<string[]> => {
  return scheduleTaskNotifications(task);
};

export const getScheduledNotifications = async (): Promise<Notifications.NotificationRequest[]> => {
  if (!notificationsAvailable) {
    return [];
  }

  try {
    return await Notifications.getAllScheduledNotificationsAsync();
  } catch (error) {
    logError('[NOTIF] Error fetching scheduled notifications:', error);
    return [];
  }
};

export const areNotificationsAvailable = (): boolean => notificationsAvailable;

export const setupNotificationHistoryListeners = (
  addNotificationOverride?: (payload: {
    id: string;
    title: string;
    body: string;
    taskId?: string | null;
    receivedAt?: number;
    read?: number;
  }) => Promise<void> | void
): { remove: () => void } => {
  if (!notificationsAvailable) {
    return noopSubscription;
  }

  const addNotification =
    addNotificationOverride ?? useNotificationsStore.getState().addNotification;

  const receivedSub = Notifications.addNotificationReceivedListener((notification: Notification) => {
    const content = notification.request.content;

    void addNotification({
      id: getNotificationIdentifier(notification),
      title: content.title ?? 'Notification',
      body: content.body ?? '',
      taskId: typeof content.data?.taskId === 'string' ? content.data.taskId : null,
      receivedAt: Date.now(),
      read: 0,
    });
  });

  const responseSub = Notifications.addNotificationResponseReceivedListener(
    (response: NotificationResponse) => {
      const identifier = getNotificationIdentifier(response.notification);
      void useNotificationsStore.getState().markAsRead(identifier);
    }
  );

  return {
    remove: () => {
      receivedSub.remove();
      responseSub.remove();
    },
  };
};

export const sendPomodoroModeSwitchNotification = async (
  enteredMode: 'focus' | 'break'
): Promise<void> => {
  if (!notificationsAvailable) {
    return;
  }

  try {
    await ensureTaskNotificationChannel();

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Pomodoro',
        body:
          enteredMode === 'break'
            ? 'Focus time ended. Time for a break!'
            : 'Break finished. Back to focus!',
        data: { type: 'pomodoro-mode-switch' },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: null,
    });
  } catch (error) {
    logError('[NOTIF] Error sending pomodoro notification:', error);
  }
};

export const getLastNotificationResponse = async (): Promise<NotificationResponse | null> => {
  if (!notificationsAvailable) {
    return null;
  }

  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    return response ?? null;
  } catch (error) {
    logError('[NOTIF] Error fetching last notification response:', error);
    return null;
  }
};

export const scheduleTestNotification = async (): Promise<string | null> => {
  if (!notificationsAvailable) {
    return null;
  }

  try {
    await ensureTaskNotificationChannel();

    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
      const granted = await requestNotificationPermission();
      if (!granted) {
        return null;
      }
    }

    return await Notifications.scheduleNotificationAsync({
      content: {
        title: '[DEV] Test Notification',
        body: 'This is a test notification from TasksScreen',
        data: { type: 'test' },
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
      },
      trigger: buildTimeIntervalTrigger(2),
    });
  } catch (error) {
    logError('[NOTIF] Error scheduling test notification:', error);
    return null;
  }
};

export const logScheduledNotificationsDetailed = async (): Promise<void> => {
  if (!notificationsAvailable) {
    return;
  }

  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    if (shouldLogDev) {
      log(`[NOTIF][LOG] Total scheduled notifications: ${scheduled.length}`);

      scheduled.forEach((notification, index) => {
        const taskId = getTaskIdFromNotification(notification);
        log(
          `[NOTIF][LOG] [${index}] id=${notification.identifier} taskId=${taskId || 'none'} trigger=${JSON.stringify(notification.trigger)}`
        );
      });
    }
  } catch (error) {
    logError('[NOTIF][LOG] Error logging scheduled notifications:', error);
  }
};

const notificationService = {
  addNotificationResponseListener,
  requestNotificationPermission,
  ensureTaskNotificationChannel,
  hasNotificationPermission,
  cancelTaskNotifications,
  cancelTaskNotificationsForced,
  scheduleTaskNotifications,
  rescheduleTaskNotifications,
  getScheduledNotifications,
  areNotificationsAvailable,
  setupNotificationHistoryListeners,
  sendPomodoroModeSwitchNotification,
  getLastNotificationResponse,
  scheduleTestNotification,
  logScheduledNotificationsDetailed,
};

export default notificationService;
