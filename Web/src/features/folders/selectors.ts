import { getFolders, getNotes, getQuickNotes } from "../../services/webData";
import { type FolderItemType, type FolderEntry } from "./types";
import { quickRichNoteDocToText } from "../../utils/quickRichNote";

// Whitelisted types that are allowed to be displayed in the Folders view
const ALLOWED_FOLDER_ITEM_TYPES = new Set<FolderItemType>(["folder", "note", "canvas", "quickNote"]);

/**
 * Centrally selects and filters folder data from the web store
 * Ensures only valid types (folders and notes) are returned for rendering.
 */
export const loadFolderEntries = (): FolderEntry[] => {
  const folders: FolderEntry[] = getFolders()
    .filter((folder) => typeof folder.id === "string")
    .map((folder) => ({
      id: folder.id as string,
      parentId: typeof folder.parentId === "string" ? folder.parentId : null,
      type: "folder",
      name: typeof folder.name === "string" ? folder.name : "Untitled folder",
      description: typeof folder.description === "string" ? folder.description : "",
      color: typeof folder.color === "string" ? folder.color : "#111111",
      createdAt: typeof folder.createdAt === "number" ? folder.createdAt : Date.now(),
      imageUrl: typeof folder.imageUrl === "string" ? folder.imageUrl : undefined,
      bannerUrl: typeof folder.bannerUrl === "string" ? folder.bannerUrl : undefined,
    }));

  const notes: FolderEntry[] = getNotes()
    .filter((note) => typeof note.id === "string")
    .map((note) => {
      const isCanvas = typeof note.content === "string" && note.content.includes('"type":"canvas"');
      let description = "";
      if (typeof note.content === "string") {
        if (isCanvas) {
          try {
            const parsed = JSON.parse(note.content);
            description = parsed.name || parsed.description || "Canvas Note";
          } catch {
            description = "Canvas Note";
          }
        } else {
          description = note.content.slice(0, 120);
        }
      }

      return {
        id: note.id as string,
        parentId: typeof note.parentId === "string" ? note.parentId : null,
        type: (isCanvas ? "canvas" : "note") as any,
        name: typeof note.title === "string" ? note.title : "Untitled note",
        description,
        color: note.color || "#71717A",
        content: typeof note.content === "string" ? note.content : "",
        createdAt: typeof note.createdAt === "number" ? note.createdAt : Date.now(),
        imageUrl: note.imageUrl,
        bannerUrl: note.bannerUrl,
      };
    });

  const quickNotes: FolderEntry[] = getQuickNotes()
    .filter((quickNote) => typeof quickNote.id === "string")
    .map((quickNote) => ({
      id: quickNote.id as string,
      parentId: typeof quickNote.folderId === "string" ? quickNote.folderId : null,
      type: "quickNote" as const,
      name: typeof quickNote.title === "string" ? quickNote.title : "Quick Note",
      description: quickRichNoteDocToText(
        typeof quickNote.content === "string" ? quickNote.content : quickNote.text ?? ""
      ).slice(0, 120),
      color: quickNote.color || "#71717A",
      content: typeof quickNote.content === "string" ? quickNote.content : quickNote.text ?? "",
      createdAt: typeof quickNote.createdAt === "number" ? quickNote.createdAt : Date.now(),
      imageUrl: quickNote.imageUrl,
      bannerUrl: quickNote.bannerUrl,
    }));

  // Safe-guard to prevent any invalid types creeping into the view
  const entries = [...folders, ...notes, ...quickNotes];
  return entries.filter(entry => ALLOWED_FOLDER_ITEM_TYPES.has(entry.type));
};
