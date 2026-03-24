import { Platform } from 'react-native';
import type { Task } from '@models/types';

// Dynamically import expo-notifications with error handling
let Notifications: any = null;
let notificationsAvailable = false;

try {
  Notifications = require('expo-notifications');
  
  // Try to configure - will fail in Expo Go
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
  console.warn('[Notifications] Module not available. Notifications will not work in Expo Go.');
  notificationsAvailable = false;
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

/**
 * Calculate night before date at 20:00
 */
const getNightBeforeNotificationTime = (dueDate: string): number => {
  const [year, month, day] = dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() - 1); // Night before
  date.setHours(20, 0, 0, 0);
  return Math.floor(date.getTime() / 1000); // Return seconds since epoch
};

/**
 * Calculate morning of date at 08:00
 */
const getMorningNotificationTime = (dueDate: string): number => {
  const [year, month, day] = dueDate.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(8, 0, 0, 0);
  return Math.floor(date.getTime() / 1000); // Return seconds since epoch
};

/**
 * Check if date is today (same day as task creation)
 */
const isToday = (dateStr: string): boolean => {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return dateStr === todayKey;
};

/**
 * Schedule task notifications (night before + morning of)
 * Returns array of notification IDs
 * 
 * Note: Only works with development build or physical device with Expo app.
 * Expo Go on SDK 53+ does not support notifications.
 */
export const scheduleTaskNotifications = async (task: Task): Promise<string[]> => {
  // If notifications not available, return empty array
  if (!notificationsAvailable || !Notifications) {
    if (task.scheduledDate) {
      console.log(`[Notifications] Would schedule reminders for: ${task.text}`);
      console.log('[Notifications] To enable notifications:');
      console.log('  1. Run: eas build --platform android --profile preview');
      console.log('  2. Install the development build on your device');
      console.log('  3. Notifications will work automatically');
    }
    return [];
  }

  try {
    const hasPermission = await hasNotificationPermission();
    if (!hasPermission) {
      console.warn('[Notifications] Permission not granted');
      return [];
    }

    if (!task.scheduledDate || task.completed) {
      return [];
    }

    const notificationIds: string[] = [];
    const now = new Date();
    const currentTimeSeconds = Math.floor(now.getTime() / 1000);

    // Schedule morning notification (always)
    const morningTimeSeconds = getMorningNotificationTime(task.scheduledDate);
    
    // Only schedule if time is in the future
    if (morningTimeSeconds > currentTimeSeconds) {
      const morningId = await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Hoje: Tarefas Pendentes 📋',
          body: `Hoje: ${task.text}`,
          sound: true,
          vibrate: [0, 250, 250, 250],
        },
        trigger: {
          seconds: morningTimeSeconds - currentTimeSeconds,
        } as any,
      });
      notificationIds.push(String(morningId));
    }

    // Schedule night before notification (skip if task is created same day)
    if (!isToday(task.scheduledDate)) {
      const nightBeforeTimeSeconds = getNightBeforeNotificationTime(task.scheduledDate);
      
      // Only schedule if time is in the future
      if (nightBeforeTimeSeconds > currentTimeSeconds) {
        const nightId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Você tem tarefas amanhã 👀',
            body: `Amanhã: ${task.text}`,
            sound: true,
            vibrate: [0, 250, 250, 250],
          },
          trigger: {
            seconds: nightBeforeTimeSeconds - currentTimeSeconds,
          } as any,
        });
        notificationIds.push(String(nightId));
      }
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
