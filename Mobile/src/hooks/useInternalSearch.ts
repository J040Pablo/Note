import { useCallback } from "react";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";
import type { LinkSearchResult } from "@components/LinkModal";

export const useInternalSearch = () => {
  const notes = useNotesStore((state) => state.notes);
  const quickNotes = useQuickNotesStore((state) => state.quickNotes);
  const tasks = useTasksStore((state) => state.tasks);
  const folders = useAppStore((state) => state.folders);

  const searchInternalItems = useCallback(
    async (query: string): Promise<LinkSearchResult[]> => {
      const results: LinkSearchResult[] = [];
      const lowerQuery = query.toLowerCase();

      // Buscar notas
      Object.values(notes).forEach((note) => {
        if (
          note.title.toLowerCase().includes(lowerQuery) ||
          note.content.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            id: note.id,
            title: note.title,
            type: "note",
            description: "Note"
          });
        }
      });

      // Buscar quick notes
      Object.values(quickNotes).forEach((qn) => {
        if (
          qn.title.toLowerCase().includes(lowerQuery) ||
          qn.content.toLowerCase().includes(lowerQuery)
        ) {
          results.push({
            id: qn.id,
            title: qn.title,
            type: "quick_note",
            description: "Quick Note"
          });
        }
      });

      // Buscar pastas
      Object.values(folders).forEach((folder) => {
        if (folder.name.toLowerCase().includes(lowerQuery)) {
          results.push({
            id: folder.id,
            title: folder.name,
            type: "folder",
            description: "Folder"
          });
        }
      });

      // Buscar tarefas
      Object.values(tasks).forEach((task) => {
        if (task.text.toLowerCase().includes(lowerQuery)) {
          results.push({
            id: task.id,
            title: task.text,
            type: "task",
            description: "Task"
          });
        }
      });

      return results.slice(0, 20);
    },
    [notes, quickNotes, tasks, folders]
  );

  return { searchInternalItems };
};
