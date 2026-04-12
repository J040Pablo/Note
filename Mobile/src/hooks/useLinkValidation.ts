import type { Link } from "@utils/linkUtils";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";

export const useLinkValidation = () => {
  const notes = useNotesStore((state) => state.notes);
  const quickNotes = useQuickNotesStore((state) => state.quickNotes);
  const tasks = useTasksStore((state) => state.tasks);
  const folders = useAppStore((state) => state.folders);

  const isLinkValid = (link: Link): boolean => {
    if (link.type === "external") {
      return link.url?.startsWith("http") ?? false;
    }

    const { entity, id } = link;

    switch (entity) {
      case "note":
        return !!notes[id];
      case "quick_note":
        return !!quickNotes[id];
      case "folder":
        return !!folders[id];
      case "task":
        return !!tasks[id];
      default:
        return false;
    }
  };

  const getLinkLabel = (link: Link): string => {
    if (link.type === "external") {
      return link.url;
    }

    const { entity, id } = link;

    try {
      switch (entity) {
        case "note":
          return notes[id]?.title || "Note (not found)";
        case "quick_note":
          return quickNotes[id]?.title || "Quick Note (not found)";
        case "folder":
          return folders[id]?.name || "Folder (not found)";
        case "task":
          return tasks[id]?.text || "Task (not found)";
        default:
          return "Unknown";
      }
    } catch {
      return "Invalid link";
    }
  };

  return { isLinkValid, getLinkLabel };
};
