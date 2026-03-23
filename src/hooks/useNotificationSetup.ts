import { useEffect } from 'react';
import { requestNotificationPermission } from '@services/notificationService';

/**
 * Hook to request notification permissions on app startup
 */
export const useNotificationSetup = () => {
  useEffect(() => {
    const initializeNotifications = async () => {
      try {
        const hasPermission = await requestNotificationPermission();
        if (hasPermission) {
          console.log('Notification permissions granted');
        } else {
          console.log('Notification permissions denied');
        }
      } catch (error) {
        console.error('Error setting up notifications:', error);
      }
    };

    initializeNotifications();
  }, []);
};
