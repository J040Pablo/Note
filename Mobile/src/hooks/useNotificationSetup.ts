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
import { log, warn, error as logError } from '@utils/logger';

/**
 * Hook to request notification permissions on app startup
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const { addNotification, loadNotifications } = useNotificationsStore.getState();

    // Initial load from SQLite
    loadNotifications();

    const initializeNotifications = async () => {

      try {

        const granted = await hasNotificationPermission();
        if (!granted) {
          await requestNotificationPermission();
        } else {
        }

        await ensureTaskNotificationChannel();
      } catch (error) {
        logError('[NOTIF] Error setting up notifications:', error);
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
