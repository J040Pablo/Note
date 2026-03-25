import { useEffect } from 'react';
import { areNotificationsAvailable, ensureTaskNotificationChannel } from '@services/notificationService';

/**
 * Hook to request notification permissions on app startup
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        if (!areNotificationsAvailable()) {
          console.log('Notifications unavailable in Expo Go; skipping permission setup');
          return;
        }

        await ensureTaskNotificationChannel();
        console.log('Notification channel initialized');
      } catch (error) {
        console.error('Error setting up notifications:', error);
      }
    };

    initializeNotifications();
  }, []);
};
