import { useEffect } from 'react';
import {
  areNotificationsAvailable,
  ensureTaskNotificationChannel,
  hasNotificationPermission,
  requestNotificationPermission,
} from '@services/notificationService';
import Constants from 'expo-constants';
import { isExpoGo, shouldLogDev } from '@utils/runtimeEnv';

/**
 * Hook to request notification permissions on app startup
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const initializeNotifications = async () => {
      if (isExpoGo || Constants.appOwnership === 'expo') {
        console.warn('[NOTIF] Notifications may not work in Expo Go. Use Dev Build or APK/IPA');
      }

      try {
        if (!areNotificationsAvailable()) {
          if (shouldLogDev) console.info('[NOTIF] Notifications not available in this environment.');
          return;
        }

        const granted = await hasNotificationPermission();
        if (!granted) {
          const result = await requestNotificationPermission();
          console.log('[NOTIF] Permission status:', result);
        } else {
          console.log('[NOTIF] Permission already granted');
        }

        await ensureTaskNotificationChannel();
      } catch (error) {
        console.error('[NOTIF] Error setting up notifications:', error);
      }
    };

    initializeNotifications();
  }, []);
};
