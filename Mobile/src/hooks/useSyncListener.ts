import { useEffect } from "react";
import { useTasksStore } from "@store/useTasksStore";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { useAppStore } from "@store/useAppStore";
import { subscribeTaskServerEvents, type TaskServerEvent } from "@services/sync/taskSyncEvents";
import { subscribeEntityServerEvents, type EntityServerEvent } from "@services/sync/entitySyncEvents";
import type { Task, Note, QuickNote, Folder } from "@models/types";

/**
 * Global sync listener hook
 * Subscribes to sync events and immediately updates Zustand stores
 * This ensures real-time UI updates without screen reload
 */
export const useSyncListener = () => {
  useEffect(() => {
    // Handle task sync events
    const unsubscribeTaskEvents = subscribeTaskServerEvents((event: TaskServerEvent) => {

      if (event.type === "TASK_CREATED" || event.type === "TASK_UPDATED") {
        const { payload } = event;
        const prev = useTasksStore.getState().tasks[payload.id];
        const incomingUpdatedAt = Number(payload.updatedAt ?? 0);
        const currentUpdatedAt = Number(prev?.updatedAt ?? 0);

        // Never overwrite newer local state with older incoming data.
        if (currentUpdatedAt > 0 && incomingUpdatedAt > 0 && currentUpdatedAt > incomingUpdatedAt) {
          return;
        }

        const incomingReminders = (payload as any).reminders;
        const incomingNotificationIds = (payload as any).notificationIds;
        const incomingDate = (payload as any).date;
        const incomingDueDate = (payload as any).dueDate;
        const incomingDueTime = (payload as any).dueTime;

        const scheduledDate =
          (typeof payload.scheduledDate === "string" ? payload.scheduledDate : null) ??
          (typeof incomingDate === "string" ? incomingDate : null) ??
          (typeof incomingDueDate === "string" ? incomingDueDate : null) ??
          prev?.scheduledDate ??
          null;

        const scheduledTime =
          (typeof payload.scheduledTime === "string" ? payload.scheduledTime : null) ??
          (typeof incomingDueTime === "string" ? incomingDueTime : null) ??
          prev?.scheduledTime ??
          null;

        // Map priority from string to number (0 | 1 | 2)
        let priority = 1;
        if (payload.priority === "low") priority = 0;
        else if (payload.priority === "high") priority = 2;

        const task: Task = {
          id: payload.id,
          text: payload.text || payload.title || "Untitled task",
          completed: Boolean(payload.completed),
          priority,
          scheduledDate,
          scheduledTime,
          repeatDays: Array.isArray(payload.repeatDays) ? payload.repeatDays : prev?.repeatDays ?? [],
          completedDates: Array.isArray(payload.completedDates) ? payload.completedDates : prev?.completedDates ?? [],
          orderIndex: payload.order ?? prev?.orderIndex ?? 0,
          updatedAt: incomingUpdatedAt > 0 ? incomingUpdatedAt : prev?.updatedAt ?? Date.now(),
          parentId: payload.parentId ?? prev?.parentId ?? null,
          noteId: payload.noteId ?? prev?.noteId ?? null,
          reminders: Array.isArray(incomingReminders) && incomingReminders.length > 0
            ? incomingReminders
            : prev?.reminders ?? ["AT_TIME"],
          notificationIds: Array.isArray(incomingNotificationIds) && incomingNotificationIds.length > 0
            ? incomingNotificationIds
            : prev?.notificationIds ?? [],
        };
        useTasksStore.getState().upsertTask(task);
      }

      if (event.type === "TASK_DELETED") {
        useTasksStore.getState().removeTask(event.payload.id);
      }
    });

    // Handle entity sync events (notes, quickNotes, folders)
    const unsubscribeEntityEvents = subscribeEntityServerEvents((event: EntityServerEvent) => {

      if (event.type === "UPSERT_NOTE") {
        const note: Note = {
          id: event.payload.id,
          title: event.payload.title || "Untitled note",
          content: event.payload.content ?? "",
          folderId: event.payload.folderId ?? event.payload.parentId ?? null,
          createdAt: event.payload.createdAt,
          updatedAt: event.payload.updatedAt,
        };
        useNotesStore.getState().upsertNote(note);
      }

      if (event.type === "DELETE_NOTE") {
        useNotesStore.getState().removeNote(event.payload.id);
      }

      if (event.type === "UPSERT_QUICK_NOTE") {
        const quickNote: QuickNote = {
          id: event.payload.id,
          title: event.payload.title || "Quick Note",
          content: event.payload.content ?? "",
          folderId: event.payload.folderId ?? null,
          createdAt: event.payload.createdAt,
          updatedAt: event.payload.updatedAt,
        };
        useQuickNotesStore.getState().upsertQuickNote(quickNote);
      }

      if (event.type === "DELETE_QUICK_NOTE") {
        useQuickNotesStore.getState().removeQuickNote(event.payload.id);
      }

      if (event.type === "UPSERT_FOLDER") {
        const folder: Folder = {
          id: event.payload.id,
          name: event.payload.name,
          parentId: event.payload.parentId ?? null,
          description: event.payload.description,
          color: event.payload.color,
          createdAt: event.payload.createdAt,
          updatedAt: event.payload.updatedAt,
          orderIndex: 0,
        };
        useAppStore.getState().upsertFolder(folder);
      }

      if (event.type === "DELETE_FOLDER") {
        useAppStore.getState().removeFolder(event.payload.id);
      }
    });

    return () => {
      unsubscribeTaskEvents();
      unsubscribeEntityEvents();
    };
  }, []);
};
