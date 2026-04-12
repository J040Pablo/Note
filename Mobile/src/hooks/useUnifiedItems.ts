import { useMemo } from "react";
import type { AppItem } from "@domain/items/types";
import type { ID } from "@models/types";
import { useAppStore } from "@store/useAppStore";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { useTasksStore } from "@store/useTasksStore";

type UnifiedItemsScope = "root" | "folder" | "global";

type UnifiedSelectableItem = AppItem & { label: string };

type UseUnifiedItemsArgs = {
  scope: UnifiedItemsScope;
  parentId?: ID | null;
};

export const useUnifiedItems = ({ scope, parentId = null }: UseUnifiedItemsArgs) => {
  const foldersMap = useAppStore((state) => state.folders);
  const notesMap = useNotesStore((state) => state.notes);
  const quickNotesMap = useQuickNotesStore((state) => state.quickNotes);
  const tasksMap = useTasksStore((state) => state.tasks);

  const folders = useMemo(
    () => Object.values(foldersMap).filter((folder) => {
      if (scope === "global") return true;
      return scope === "root" ? folder.parentId == null : (folder.parentId ?? null) === parentId;
    }),
    [foldersMap, parentId, scope]
  );

  const notes = useMemo(
    () => Object.values(notesMap).filter((note) => {
      if (scope === "global") return true;
      return scope === "root" ? note.folderId == null : (note.folderId ?? null) === parentId;
    }),
    [notesMap, parentId, scope]
  );

  const quickNotes = useMemo(
    () => Object.values(quickNotesMap).filter((quickNote) => {
      if (scope === "global") return true;
      return scope === "root" ? quickNote.folderId == null : (quickNote.folderId ?? null) === parentId;
    }),
    [parentId, quickNotesMap, scope]
  );

  const tasks = useMemo(
    () => Object.values(tasksMap).filter((task) => {
      if (scope === "global") return true;
      return scope === "root" ? task.parentId == null : (task.parentId ?? null) === parentId;
    }),
    [parentId, scope, tasksMap]
  );

  const items = useMemo<AppItem[]>(
    () => [
      ...folders.map((folder) => ({ kind: "folder" as const, id: folder.id, parentId: folder.parentId ?? null })),
      ...notes.map((note) => ({ kind: "note" as const, id: note.id, parentId: note.folderId ?? null })),
      ...quickNotes.map((quickNote) => ({ kind: "quick" as const, id: quickNote.id, parentId: quickNote.folderId ?? null })),
      ...tasks.map((task) => ({ kind: "task" as const, id: task.id, parentId: task.parentId ?? null }))
    ],
    [folders, notes, quickNotes, tasks]
  );

  const selectableItems = useMemo<UnifiedSelectableItem[]>(
    () => [
      ...folders.map((folder) => ({ kind: "folder" as const, id: folder.id, parentId: folder.parentId ?? null, label: folder.name })),
      ...notes.map((note) => ({ kind: "note" as const, id: note.id, parentId: note.folderId ?? null, label: note.title })),
      ...quickNotes.map((quickNote) => ({ kind: "quick" as const, id: quickNote.id, parentId: quickNote.folderId ?? null, label: quickNote.title })),
      ...tasks.map((task) => ({ kind: "task" as const, id: task.id, parentId: task.parentId ?? null, label: task.text }))
    ],
    [folders, notes, quickNotes, tasks]
  );

  return {
    items,
    selectableItems,
    folders,
    notes,
    quickNotes,
    tasks
  };
};
