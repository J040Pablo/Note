import { useEffect } from 'react';
import { areNotificationsAvailable, ensureTaskNotificationChannel } from '@services/notificationService';
import { isExpoGo, shouldLogDev } from '@utils/runtimeEnv';

/**
 * Hook to request notification permissions on app startup
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const initializeNotifications = async () => {
      if (isExpoGo) {
        if (shouldLogDev) {
          console.info('[Notifications] Skipping setup in Expo Go.');
        }
        return;
      }

      try {
        if (!areNotificationsAvailable()) {
          return;
        }

        await ensureTaskNotificationChannel();
      } catch (error) {
        console.error('Error setting up notifications:', error);
      }
    };

    initializeNotifications();
  }, []);
};
