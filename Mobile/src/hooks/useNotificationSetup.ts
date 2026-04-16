import { useEffect } from 'react';
import {
  areNotificationsAvailable,
  ensureTaskNotificationChannel,
  hasNotificationPermission,
  requestNotificationPermission,
  setupNotificationHistoryListeners,
} from '@services/notificationService';
import { useNotificationsStore } from '@store/useNotificationsStore';
import Constants from 'expo-constants';
import { isExpoGo, shouldLogDev } from '@utils/runtimeEnv';

/**
 * Hook to request notification permissions on app startup
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const { addNotification, loadNotifications } = useNotificationsStore.getState();

    // Initial load from SQLite
    loadNotifications();

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
          console.log('[NOTIF][PERMISSION] Permission status:', result);
        } else {
          console.log('[NOTIF][PERMISSION] Permission already granted');
        }

        await ensureTaskNotificationChannel();
      } catch (error) {
        console.error('[NOTIF] Error setting up notifications:', error);
      }
    };

    initializeNotifications();

    // Setup history listeners
    const historySub = setupNotificationHistoryListeners(addNotification);

    return () => {
      if (historySub && historySub.remove) {
        historySub.remove();
      }
    };
  }, []);
};
