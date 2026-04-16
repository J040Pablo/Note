import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Notification } from "@models/types";
import { getDb, runDbWrite } from "@database/db";

interface NotificationsState {
  notifications: Notification[];
  unreadCount: number;
  initialized: boolean;
}

interface NotificationsActions {
  loadNotifications: () => Promise<void>;
  addNotification: (payload: Omit<Notification, "read" | "receivedAt"> & { read?: number; receivedAt?: number }) => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationsStore = create<NotificationsState & NotificationsActions>()(
  immer((set, get) => ({
    notifications: [],
    unreadCount: 0,
    initialized: false,

    loadNotifications: async () => {
      try {
        const db = await getDb();
        const rows = await db.getAllAsync<Notification>(
          "SELECT * FROM notifications ORDER BY receivedAt DESC LIMIT 100"
        );
        
        // Align unreadCount with what is visible in memory
        const unreadCount = rows.filter((n) => n.read === 0).length;
        
        set((state) => {
          state.notifications = rows;
          state.unreadCount = unreadCount;
          state.initialized = true;
        });

        // Cleanup: Remove extra notifications from DB to avoid bloat
        await runDbWrite(
          "DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY receivedAt DESC LIMIT 200)"
        );
      } catch (error) {
        console.error("[NotificationsStore] load failed", error);
      }
    },

    addNotification: async (payload) => {
      if (!payload?.id || typeof payload.id !== "string") return;
      if (!payload.title && !payload.body) return;

      const id = payload.id;
      const newNotif: Notification = {
        id,
        title: payload.title,
        body: payload.body,
        taskId: payload.taskId ?? null,
        read: payload.read ?? 0,
        receivedAt: payload.receivedAt ?? Date.now(),
      };

      try {
        // Smart Merge Logic: Check if it already exists in memory (as a hint)
        const existingHint = get().notifications.find((n) => n.id === id);

        if (existingHint) {
          // 1. Already read, arriving unread (race condition) -> Preserve read state
          if (existingHint.read === 1 && newNotif.read === 0) {
            return;
          }

          // 2. Decide on DB update based on state transition
          if (existingHint.read === 0 && newNotif.read === 1) {
            // Unread -> Read merge (tap upgrade)
            await runDbWrite(
              "UPDATE notifications SET read = 1, receivedAt = ? WHERE id = ?",
              newNotif.receivedAt,
              id
            );
          } else if (
            (existingHint.read === 0 && newNotif.read === 0) ||
            (existingHint.read === 1 && newNotif.read === 1)
          ) {
            // Unread -> Unread or Read -> Read (timestamp update)
            await runDbWrite(
              "UPDATE notifications SET receivedAt = ? WHERE id = ?",
              newNotif.receivedAt,
              id
            );
          }

          set((state) => {
            const idx = state.notifications.findIndex((n) => n.id === id);
            if (idx === -1) return;
            const current = state.notifications[idx];

            // Final state transition logic inside set()
            if (current.read === 0 && newNotif.read === 1) {
              // Mark as read and update timestamp to bring to top
              current.read = 1;
              current.receivedAt = newNotif.receivedAt;
              state.unreadCount = Math.max(0, state.unreadCount - 1);
            } else if (
              (current.read === 0 && newNotif.read === 0) ||
              (current.read === 1 && newNotif.read === 1)
            ) {
              // Just update timestamp
              current.receivedAt = newNotif.receivedAt;
            }

            // Full Safe Sort Trigger: Ensure chronological order after timestamp update
            const isOutOfOrder =
              state.notifications.length > 1 &&
              state.notifications.some((n, i, arr) => i > 0 && arr[i - 1].receivedAt < n.receivedAt);

            if (isOutOfOrder) {
              state.notifications.sort((a, b) => b.receivedAt - a.receivedAt);
            }
          });

          return;
        }

        // Standard flow: New notification
        await runDbWrite(
          "INSERT OR IGNORE INTO notifications (id, title, body, taskId, read, receivedAt) VALUES (?, ?, ?, ?, ?, ?)",
          newNotif.id,
          newNotif.title,
          newNotif.body,
          newNotif.taskId,
          newNotif.read,
          newNotif.receivedAt
        );
        
        // 🛡️ Post-Insert Duplicate Guard (CRITICAL for concurrency)
        // Check if another event (e.g. rapid multi-listener) added it while we were writing to DB
        if (get().notifications.find((n) => n.id === id)) return;

        set((state) => {
          // Final atomic check inside set()
          if (state.notifications.some((n) => n.id === id)) return;

          state.notifications.unshift(newNotif);
          // Keep only last 100 in memory
          if (state.notifications.length > 100) {
            state.notifications = state.notifications.slice(0, 100);
          }
          if (newNotif.read === 0) {
            state.unreadCount += 1;
          }

          // Full Safe Sort Trigger: Ensure chronological order under burst updates
          const isOutOfOrder = state.notifications.length > 1 && 
            state.notifications.some((n, i, arr) => i > 0 && arr[i - 1].receivedAt < n.receivedAt);
          
          if (isOutOfOrder) {
            state.notifications.sort((a, b) => b.receivedAt - a.receivedAt);
          }
        });
      } catch (error) {
        console.error("[NotificationsStore] add failed", error);
      } finally {
        // Guaranteed Cleanup: Limit database to last 200 entries to prevent bloat
        try {
          await runDbWrite(
            "DELETE FROM notifications WHERE id NOT IN (SELECT id FROM notifications ORDER BY receivedAt DESC LIMIT 200)"
          );
        } catch (e) {
          console.error("[NotificationsStore] cleanup failed", e);
        }

        if (__DEV__) {
          const state = get();
          console.log("[NOTIF DEBUG]", {
            total: state.notifications.length,
            unread: state.unreadCount
          });
        }
      }
    },

    markAsRead: async (id) => {
      if (typeof id !== "string" || id.length === 0) return;
      
      const notif = get().notifications.find((n) => n.id === id);
      if (!notif || notif.read === 1) return;

      try {
        await runDbWrite("UPDATE notifications SET read = 1 WHERE id = ?", id);
        set((state) => {
          const index = state.notifications.findIndex((n) => n.id === id);
          if (index === -1) return;
          
          const current = state.notifications[index];
          // Final guard: only decrement if still unread
          if (current.read === 0) {
            current.read = 1;
            state.unreadCount = Math.max(0, state.unreadCount - 1);
          }
        });
      } catch (error) {
        console.error("[NotificationsStore] markAsRead failed", error);
      }
    },

    markAllAsRead: async () => {
      if (get().unreadCount === 0) return;

      try {
        await runDbWrite("UPDATE notifications SET read = 1 WHERE read = 0");
        set((state) => {
          state.notifications.forEach((n) => {
            n.read = 1;
          });
          state.unreadCount = 0;
        });
      } catch (error) {
        console.error("[NotificationsStore] markAllAsRead failed", error);
      }
    },
  }))
);
