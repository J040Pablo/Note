import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  FilePlus,
  FileText,
  FolderPlus,
  PenSquare,
  StickyNote,
  X,
  Upload,
} from "lucide-react";
import { PageContainer, AppLogo } from "../../../components/ui";
import Breadcrumb from "../components/Breadcrumb";
import FAB from "../components/FAB";
import FilterDropdown from "../components/FilterDropdown";
import FolderCard from "../components/FolderCard";
import FolderListItem from "../components/FolderListItem";
import FolderModal from "../components/FolderModal";
import ViewToggle from "../components/ViewToggle";
import ItemActionsMenu, { type ItemActionId } from "../components/ItemActionsMenu";
import type {
  FolderDraft,
  FolderEntry,
  FolderFilters,
  FolderViewMode,
} from "../types";
import { useAppMode } from "../../../app/mode";
import { createFolder, deleteFolder, updateFolder } from "../../../services/foldersService.web";
import { createNote, deleteNote, updateNote, deleteQuickNote, updateQuickNote } from "../../../services/notesService.web";
import { deleteTask, updateTask, getAllTasks } from "../../../services/tasksService.web";
import { subscribeTaskSyncMessages, type SyncFolder, type SyncNote, type SyncQuickNote } from "../../tasks/sync";
import { subscribeSyncBridge } from "../../../services/syncBridge";
import { exportFolderPackage, importFolderPackage, exportNotePackage, exportQuickNotePackage } from "../../../services/folderPackageService";
import { getFolders, getNotes, getQuickNotes } from "../../../services/webData";
import { useTranslation } from "react-i18next";
import styles from "./FoldersPage.module.css";

const VIEW_MODE_STORAGE_KEY = "folders:view-mode";
const NAVIGATION_ANIMATION_MS = 190;

const loadFolderEntries = (): FolderEntry[] => {
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

  const quickNotes: FolderEntry[] = (getQuickNotes?.() || [])
    .filter((note: any) => typeof note.id === "string")
    .map((note: any) => {
      let description = "";
      if (typeof note.content === "string" && note.content.startsWith("{")) {
        try {
          const parsed = JSON.parse(note.content);
          description = (parsed.blocks?.[0]?.html || "")
            .replace(/<[^>]*>?/gm, "")
            .slice(0, 120);
        } catch {
          description = typeof note.text === "string" ? note.text.slice(0, 120) : "";
        }
      } else {
        description = typeof note.text === "string" ? note.text.slice(0, 120) : "";
      }

      return {
        id: note.id as string,
        parentId: typeof note.folderId === "string" ? note.folderId : null,
        type: "quickNote" as any,
        name: typeof note.title === "string" ? note.title : "Untitled quick note",
        description,
        color: note.color || "#71717A",
        content: typeof note.content === "string" ? note.content : "",
        createdAt: typeof note.createdAt === "number" ? note.createdAt : Date.now(),
        imageUrl: note.imageUrl,
        bannerUrl: note.bannerUrl,
      };
    });

  const tasks: FolderEntry[] = (getAllTasks() || [])
    .map((task: any) => ({
      id: task.id as string,
      parentId: typeof task.parentId === "string" ? task.parentId : null,
      type: "task" as any,
      name: typeof task.title === "string" ? task.title : "Untitled task",
      description: task.priority ? `Priority: ${task.priority}` : "",
      color: task.color || "#f59e0b", // Task color
      createdAt: typeof task.createdAt === "number" ? task.createdAt : Date.now(),
      imageUrl: task.imageUrl,
      bannerUrl: task.bannerUrl,
    }));

  return [...folders, ...notes, ...quickNotes, ...tasks];
};

const defaultFilters: FolderFilters = {
  nameQuery: "",
  color: "all",
  sortBy: "custom",
};

type NavigationDirection = "forward" | "backward";

type ModalState =
  | {
      mode: "none";
    }
  | {
      mode: "rename" | "color";
      itemId: string;
    }
  | {
      mode: "edit";
      itemId: string;
    }
  | {
      mode: "move";
      itemId: string;
    }
  | {
      mode: "media";
      itemId: string;
    }
  | {
      mode: "create-note";
    };

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e4)}`;

const toParentId = (value: string | null | undefined): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value : null;

const mapEntryToFolder = (entry: FolderEntry) => ({
  id: String(entry.id),
  parentId: toParentId(entry.parentId),
  name: entry.name.trim() || "Untitled folder",
  description: entry.description,
  color: entry.color,
  createdAt: entry.createdAt,
  updatedAt: entry.createdAt,
  imageUrl: entry.imageUrl,
  bannerUrl: entry.bannerUrl,
});

const mapEntryToNote = (entry: FolderEntry) => ({
  id: String(entry.id),
  parentId: toParentId(entry.parentId),
  title: entry.name.trim() || "Untitled note",
  content: entry.content ?? "",
  color: entry.color,
  createdAt: entry.createdAt,
  updatedAt: entry.createdAt,
  imageUrl: entry.imageUrl,
  bannerUrl: entry.bannerUrl,
});

const mapEntryToTask = (entry: FolderEntry) => ({
  id: String(entry.id),
  title: entry.name.trim() || "Untitled task",
  parentId: toParentId(entry.parentId),
  color: entry.color,
  updatedAt: Date.now(),
  imageUrl: entry.imageUrl,
  bannerUrl: entry.bannerUrl,
});

const mapSyncFolderToEntry = (folder: SyncFolder): FolderEntry => ({
  id: folder.id,
  parentId: folder.parentId,
  type: "folder",
  name: folder.name,
  description: folder.description ?? "",
  color: folder.color ?? "#111111",
  createdAt: folder.createdAt,
  imageUrl: folder.imageUrl,
  bannerUrl: folder.bannerUrl,
});

const mapSyncNoteToEntry = (note: SyncNote): FolderEntry => ({
  id: note.id,
  parentId: note.parentId,
  type: "note",
  name: note.title || "Untitled note",
  description: note.content.slice(0, 120),
  color: note.color || "#71717A",
  content: note.content,
  createdAt: note.createdAt,
});

const getDescendantIds = (sourceId: string, entries: FolderEntry[]) => {
  const descendants = new Set<string>();
  const stack = [sourceId];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    entries
      .filter((entry) => entry.parentId === current)
      .forEach((child) => {
        descendants.add(child.id);
        if (child.type === "folder") {
          stack.push(child.id);
        }
      });
  }

  return descendants;
};

const persistFolderEntry = (entry: FolderEntry): void => {
  if (entry.type === "folder") {
    updateFolder({
      ...mapEntryToFolder(entry),
      updatedAt: Date.now(),
    });
    return;
  }

  if (entry.type === "note") {
    updateNote({
      ...mapEntryToNote(entry),
      updatedAt: Date.now(),
    });
    return;
  }

  if (entry.type === "quickNote") {
    updateQuickNote(entry.id, {
      title: entry.name,
      content: entry.content ?? "",
      text: entry.content ?? "",
      folderId: entry.parentId,
      color: entry.color,
    });
    return;
  }

  if (entry.type === "task") {
    const allTasks = getAllTasks();
    const existing = allTasks.find((t) => t.id === entry.id);
    if (existing) {
      updateTask({
        ...existing,
        title: entry.name,
        parentId: toParentId(entry.parentId),
        color: entry.color,
        updatedAt: Date.now(),
      });
    }
  }
};

const deleteFolderEntry = (entry: FolderEntry): void => {
  if (entry.type === "folder") {
    deleteFolder(entry.id);
    return;
  }

  if (entry.type === "note" || entry.type === "canvas") {
    deleteNote(entry.id);
    return;
  }

  if (entry.type === "quickNote") {
    deleteQuickNote(entry.id);
    return;
  }

  if (entry.type === "task") {
    deleteTask(entry.id);
  }
};

const FoldersPage: React.FC = () => {
  const { t } = useTranslation();
  const { mode } = useAppMode();
  const navigate = useNavigate();
  const isMobileSync = mode === "mobile-sync";
  // Data source moved from hardcoded array to persistent webData layer.
  const [entries, setEntries] = React.useState<FolderEntry[]>(() => loadFolderEntries());
  const [viewMode, setViewMode] = React.useState<FolderViewMode>(() => {
    const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return stored === "grid" || stored === "list" ? stored : "list";
  });
  const [filters, setFilters] = React.useState<FolderFilters>(defaultFilters);
  const [showModal, setShowModal] = React.useState(false);
  const [path, setPath] = React.useState<string[]>([]);
  const [fabOpen, setFabOpen] = React.useState(false);
  const [transitionState, setTransitionState] = React.useState<"idle" | "leaving" | "entering">("idle");
  const [navigationDirection, setNavigationDirection] = React.useState<NavigationDirection>("forward");
  const [contextMenuState, setContextMenuState] = React.useState<{
    open: boolean;
    itemId: string | null;
    x: number;
    y: number;
  }>({
    open: false,
    itemId: null,
    x: 0,
    y: 0,
  });
  const [modalState, setModalState] = React.useState<ModalState>({ mode: "none" });
  const [editorTitle, setEditorTitle] = React.useState("");
  const [editorBody, setEditorBody] = React.useState("");
  const [renameValue, setRenameValue] = React.useState("");
  const [selectedColor, setSelectedColor] = React.useState("#111111");
  const [moveTarget, setMoveTarget] = React.useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = React.useState<string | undefined>(undefined);
  const [uploadedBanner, setUploadedBanner] = React.useState<string | undefined>(undefined);
  const importInputRef = React.useRef<HTMLInputElement>(null);

  const leaveTimerRef = React.useRef<number | null>(null);
  const enterTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isMobileSync) return;
    const unsub = subscribeTaskSyncMessages((message) => {
      if (message.type !== "INIT") return;
      // received from mobile
      const syncedFolders = (message.payload.folders ?? []).map((folder) =>
        mapSyncFolderToEntry(folder as SyncFolder)
      );
      const syncedNotes = (message.payload.notes ?? []).map((note) =>
        mapSyncNoteToEntry(note as SyncNote)
      );
      setEntries([...syncedFolders, ...syncedNotes]);
    });
    return () => unsub();
  }, [isMobileSync]);

  React.useEffect(() => {
    if (!isMobileSync) return;
    const unsub = subscribeSyncBridge(() => {
      setEntries(loadFolderEntries());
    });
    return () => unsub();
  }, [isMobileSync]);

  React.useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  }, [viewMode]);

  React.useEffect(
    () => () => {
      if (leaveTimerRef.current) {
        window.clearTimeout(leaveTimerRef.current);
      }
      if (enterTimerRef.current) {
        window.clearTimeout(enterTimerRef.current);
      }
    },
    []
  );

  React.useEffect(() => {
    // Keep navigation path valid after folder delete/move operations.
    setPath((prevPath) => {
      if (prevPath.length === 0) return prevPath;
      const folderIds = new Set(
        entries.filter((entry) => entry.type === "folder").map((folder) => folder.id)
      );
      const nextPath = prevPath.filter((folderId) => folderIds.has(folderId));
      return nextPath.length === prevPath.length ? prevPath : nextPath;
    });
  }, [entries]);

  const foldersById = React.useMemo(() => {
    return new Map(
      entries
        .filter((entry) => entry.type === "folder")
        .map((folder) => [folder.id, folder] as const)
    );
  }, [entries]);

  const currentFolderId = path.length > 0 ? path[path.length - 1] : null;

  const visibleEntries = React.useMemo(() => {
    return entries.filter((entry) => entry.parentId === currentFolderId);
  }, [currentFolderId, entries]);

  const filteredEntries = React.useMemo(() => {
    const byName = visibleEntries.filter((entry) =>
      entry.name.toLowerCase().includes(filters.nameQuery.toLowerCase().trim())
    );

    const byColor =
      filters.color === "all"
        ? byName
        : byName.filter((entry) => entry.color.toLowerCase() === filters.color.toLowerCase());

    const sorted = [...byColor];

    if (filters.sortBy === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (filters.sortBy === "date") {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    }

    if (filters.sortBy === "color") {
      sorted.sort((a, b) => a.color.localeCompare(b.color));
    }

    return sorted;
  }, [filters, visibleEntries]);

  const breadcrumbSegments = React.useMemo(() => {
    const root = [{ id: null, label: t("home") }];
    const nested = path
      .map((folderId) => foldersById.get(folderId))
      .filter(Boolean)
      .map((folder) => ({ id: folder!.id, label: folder!.name }));

    return [...root, ...nested];
  }, [foldersById, path, t]);

  const currentFolderLabel = path.length === 0 ? t("rootFolders") : breadcrumbSegments[breadcrumbSegments.length - 1].label;

  const navigateWithTransition = React.useCallback((nextPath: string[], direction: NavigationDirection) => {
    const samePath =
      nextPath.length === path.length && nextPath.every((folderId, index) => folderId === path[index]);

    if (samePath) return;

    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
    }
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
    }

    setNavigationDirection(direction);
    setTransitionState("leaving");

    leaveTimerRef.current = window.setTimeout(() => {
      setPath(nextPath);
      setTransitionState("entering");

      enterTimerRef.current = window.setTimeout(() => {
        setTransitionState("idle");
      }, NAVIGATION_ANIMATION_MS);
    }, NAVIGATION_ANIMATION_MS);
  }, [path]);

  const handleActivateItem = React.useCallback(
    (itemId: string) => {
      const item = entries.find((entry) => entry.id === itemId);
      if (!item) return;

      switch (item.type as string) {
        case "folder":
          navigateWithTransition([...path, item.id], "forward");
          break;
        case "note":
        case "canvas":
          navigate(`/notes/${item.id}`);
          break;
        case "quickNote":
        case "quick-note": // Legacy fallback
          navigate(`/quicknotes/${item.id}`);
          break;
        case "task":
        case "file": // Legacy fallback
          navigate(`/tasks`);
          break;
        default:
          // For any other type, show the metadata edit modal
          setModalState({ mode: "edit", itemId: item.id });
          setEditorTitle(item.name);
          setEditorBody(item.content ?? "");
          break;
      }
    },
    [entries, navigateWithTransition, path, navigate]
  );

  const handleCreateFolder = React.useCallback(
    (payload: FolderDraft) => {
      const safeName = payload.name.trim();
      if (!safeName) return;

      const created = createFolder({
        parentId: currentFolderId ?? null,
        name: safeName,
        description: payload.description,
        color: payload.color,
        imageUrl: payload.imageUrl,
        bannerUrl: payload.bannerUrl,
      });

      setEntries((prev) => [mapSyncFolderToEntry(created), ...prev]);
      setShowModal(false);
    },
    [currentFolderId]
  );

  const handleFabAction = React.useCallback(
    (actionId: "add-file" | "create-folder" | "quick-note" | "create-note") => {
      if (actionId === "create-folder") {
        setShowModal(true);
        return;
      }

      if (actionId === "add-file") {
        const file: FolderEntry = {
          id: makeId("task"),
          parentId: currentFolderId,
          type: "task",
          name: `New Task ${visibleEntries.filter((item) => item.type === "task").length + 1}`,
          description: "Created from quick action",
          content: "",
          color: "#22c55e",
          createdAt: Date.now(),
        };

        setEntries((prev) => [file, ...prev]);
        return;
      }

      if (actionId === "quick-note") {
        navigate(`/quicknotes/new${currentFolderId ? `?folderId=${currentFolderId}` : ""}`);
        return;
      }

      if (actionId === "create-note") {
        navigate(`/notes/new${currentFolderId ? `?folderId=${currentFolderId}` : ""}`);
        return;
      }

      if (actionId === "import-folder" as any) {
        importInputRef.current?.click();
        return;
      }
    },
    [currentFolderId, navigate, visibleEntries]
  );

  const handleOpenMenu = React.useCallback((itemId: string, anchor: DOMRect) => {
    setContextMenuState({
      open: true,
      itemId,
      x: anchor.right - 10,
      y: anchor.bottom + 4,
    });
  }, []);

  const closeContextMenu = React.useCallback(() => {
    setContextMenuState((current) => ({ ...current, open: false, itemId: null }));
  }, []);

  const selectedContextItem = React.useMemo(
    () => entries.find((entry) => entry.id === contextMenuState.itemId) ?? null,
    [contextMenuState.itemId, entries]
  );

  const handleContextAction = React.useCallback(
    (action: ItemActionId) => {
      if (!selectedContextItem) return;

      closeContextMenu();

      if (action === "delete") {
        const confirmMsg = 
          selectedContextItem.type === "folder" ? t("deleteFolderConfirm") :
          selectedContextItem.type === "note" ? t("deleteNoteConfirm") :
          selectedContextItem.type === "quickNote" ? t("deleteQuickNoteConfirm") :
          t("deleteConfirm");

        if (!window.confirm(confirmMsg)) return;

        setEntries((prev) => {
          const descendants =
            selectedContextItem.type === "folder"
              ? getDescendantIds(selectedContextItem.id, prev)
              : new Set<string>();

          prev.forEach((entry) => {
            if (entry.id === selectedContextItem.id || descendants.has(entry.id)) {
              deleteFolderEntry(entry);
            }
          });

          return prev.filter(
            (entry) => entry.id !== selectedContextItem.id && !descendants.has(entry.id)
          );
        });
        return;
      }

      if (action === "rename") {
        setRenameValue(selectedContextItem.name);
        setModalState({ mode: "rename", itemId: selectedContextItem.id });
        return;
      }

      if (action === "move") {
        setMoveTarget(currentFolderId);
        setModalState({ mode: "move", itemId: selectedContextItem.id });
        return;
      }

      if (action === "edit") {
        switch (selectedContextItem.type as string) {
          case "note":
          case "canvas":
            navigate(`/notes/${selectedContextItem.id}`);
            return;
          case "quickNote":
          case "quick-note":
            navigate(`/quicknotes/${selectedContextItem.id}`);
            return;
          case "task":
          case "file":
            navigate(`/tasks`);
            return;
          default:
            setEditorTitle(selectedContextItem.name);
            setEditorBody(selectedContextItem.content ?? selectedContextItem.description ?? "");
            setModalState({ mode: "edit", itemId: selectedContextItem.id });
            return;
        }
      }

      if (action === "change-color") {
        setSelectedColor(selectedContextItem.color);
        setModalState({ mode: "color", itemId: selectedContextItem.id });
        return;
      }

      if (action === "export") {
        if (selectedContextItem.type === "quickNote") {
          exportQuickNotePackage(selectedContextItem.id);
        } else if (selectedContextItem.type === "note" || selectedContextItem.type === "canvas") {
          exportNotePackage(selectedContextItem.id);
        } else {
          exportFolderPackage(selectedContextItem.id);
        }
        return;
      }

      setUploadedImage(selectedContextItem.imageUrl);
      setUploadedBanner(selectedContextItem.bannerUrl);
      setModalState({ mode: "media", itemId: selectedContextItem.id });
    },
    [closeContextMenu, currentFolderId, selectedContextItem, t, navigate]
  );

  const closeModalState = React.useCallback(() => {
    setModalState({ mode: "none" });
    setEditorBody("");
    setEditorTitle("");
    setRenameValue("");
    setMoveTarget(currentFolderId);
    setUploadedImage(undefined);
    setUploadedBanner(undefined);
  }, [currentFolderId]);

  const handleNavigateBreadcrumb = React.useCallback(
    (segmentIndex: number) => {
      const nextPath = segmentIndex === 0 ? [] : path.slice(0, segmentIndex);
      const direction: NavigationDirection = nextPath.length < path.length ? "backward" : "forward";
      navigateWithTransition(nextPath, direction);
    },
    [navigateWithTransition, path]
  );

  const handleGoBack = React.useCallback(() => {
    if (path.length === 0) return;
    navigateWithTransition(path.slice(0, -1), "backward");
  }, [navigateWithTransition, path]);

  const animationClass =
    transitionState === "idle"
      ? ""
      : transitionState === "leaving"
      ? navigationDirection === "forward"
        ? styles.leavingForward
        : styles.leavingBackward
      : navigationDirection === "forward"
      ? styles.enteringForward
      : styles.enteringBackward;

  const rootMoveOptions = React.useMemo(
    () => [{ id: null, label: t("home") }, ...entries.filter((entry) => entry.type === "folder").map((folder) => ({ id: folder.id, label: folder.name }))],
    [entries, t]
  );

  const blockedMoveTargets = React.useMemo(() => {
    if (modalState.mode !== "move") return new Set<string>();

    const selectedItem = entries.find((entry) => entry.id === modalState.itemId);
    if (!selectedItem || selectedItem.type !== "folder") {
      return new Set<string>();
    }

    const descendants = getDescendantIds(selectedItem.id, entries);
    descendants.add(selectedItem.id);
    return descendants;
  }, [entries, modalState]);

  const fabActions = React.useMemo(
    () => [
      { id: "add-file" as const, label: t("addFile"), icon: <FilePlus size={16} /> },
      { id: "create-folder" as const, label: t("createFolder"), icon: <FolderPlus size={16} /> },
      { id: "import-folder" as const, label: t("importFolder"), icon: <Upload size={16} /> },
      { id: "quick-note" as const, label: t("quickNote"), icon: <StickyNote size={16} /> },
      { id: "create-note" as const, label: t("createNote"), icon: <PenSquare size={16} /> },
    ] as any[],
    [t]
  );

  const pickFileAsDataUrl =
    (setter: React.Dispatch<React.SetStateAction<string | undefined>>) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => setter(typeof reader.result === "string" ? reader.result : undefined);
      reader.readAsDataURL(file);
    };

  return (
    <PageContainer
      title={t("folders")}
      subtitle={currentFolderLabel}
      action={
        <button
          type="button"
          className={styles.createButton}
          onClick={() => setShowModal(true)}
        >
          <FolderPlus size={17} />
          <span>{t("folder")}</span>
        </button>
      }
    >
      <input 
        type="file" 
        accept=".zip" 
        ref={importInputRef} 
        style={{ display: "none" }} 
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            await importFolderPackage(file);
            setEntries(loadFolderEntries()); // Refresh breadcrumbs and list
            alert(t("importSuccess"));
          } catch (err) {
            alert(t("importError"));
          }
          e.target.value = "";
        }}
      />
      {path.length > 0 ? (
        <button
          type="button"
          className={styles.backButton}
          onClick={handleGoBack}
        >
          <ArrowLeft size={16} />
          <span>{t("back")}</span>
        </button>
      ) : null}

      <Breadcrumb segments={breadcrumbSegments} onNavigate={handleNavigateBreadcrumb} />

      <div className={styles.controls}>
        <div className={styles.meta}>
          <span>{filteredEntries.length} {t("items")}</span>
        </div>
        <div className={styles.actions}>
          <FilterDropdown
            value={filters}
            onChange={setFilters}
            folders={visibleEntries}
          />
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div
        className={`${styles.content} ${
          viewMode === "grid" ? styles.contentGrid : styles.contentList
        } ${animationClass}`}
        style={{
          animationDuration: `${NAVIGATION_ANIMATION_MS}ms`,
        }}
      >
        {filteredEntries.map((item) =>
          viewMode === "grid" ? (
            <FolderCard
              key={item.id}
              item={item}
              onActivate={handleActivateItem}
              onOpenMenu={handleOpenMenu}
            />
          ) : (
            <FolderListItem
              key={item.id}
              item={item}
              onActivate={handleActivateItem}
              onOpenMenu={handleOpenMenu}
            />
          )
        )}

        {filteredEntries.length === 0 ? (
          <div className={styles.emptyState}>
            <AppLogo size={64} className={styles.emptyLogo} />
            <p>{t("noItemsFolder")}</p>
            <span>{t("usePlusToAdd")}</span>
          </div>
        ) : null}
      </div>

      <FolderModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onCreate={handleCreateFolder}
      />

      <FAB
        open={fabOpen}
        actions={fabActions}
        onToggle={() => setFabOpen((current) => !current)}
        onAction={handleFabAction}
      />

      <ItemActionsMenu
        item={selectedContextItem}
        open={contextMenuState.open}
        x={contextMenuState.x}
        y={contextMenuState.y}
        onClose={closeContextMenu}
        onAction={handleContextAction}
      />

      {modalState.mode !== "none" ? (
        <div className={styles.modalBackdrop} onClick={closeModalState}>
          <div className={styles.inlineModal} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <header className={styles.inlineHeader}>
              <h3>
                {modalState.mode === "rename" && t("renameItem")}
                {modalState.mode === "edit" && t("editItem")}
                {modalState.mode === "move" && t("moveItem")}
                {modalState.mode === "color" && t("changeColor")}
                {modalState.mode === "media" && t("addMedia")}
                {modalState.mode === "create-note" && t("createNote")}
              </h3>
              <button type="button" className={styles.iconButton} onClick={closeModalState} aria-label="Close">
                <X size={16} />
              </button>
            </header>

            {(modalState.mode === "rename" || modalState.mode === "edit" || modalState.mode === "create-note") ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>{t("title")}</span>
                  <input
                    value={modalState.mode === "rename" ? renameValue : editorTitle}
                    onChange={(event) =>
                      modalState.mode === "rename"
                        ? setRenameValue(event.target.value)
                        : setEditorTitle(event.target.value)
                    }
                  />
                </label>

                {modalState.mode !== "rename" ? (
                  <label className={styles.modalField}>
                    <span>{t("content")}</span>
                    <textarea
                      rows={8}
                      value={editorBody}
                      onChange={(event) => setEditorBody(event.target.value)}
                      placeholder={t("writeNotePlaceholder")}
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {modalState.mode === "move" ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>{t("destinationFolder")}</span>
                  <select value={moveTarget ?? "root"} onChange={(event) => setMoveTarget(event.target.value === "root" ? null : event.target.value)}>
                    {rootMoveOptions
                      .filter((option) => (option.id ? !blockedMoveTargets.has(option.id) : true))
                      .map((option) => (
                         <option key={option.id ?? "root"} value={option.id ?? "root"}>
                           {option.id === null ? t("home") : option.label}
                         </option>
                      ))}
                  </select>
                </label>
              </div>
            ) : null}

            {modalState.mode === "color" ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>{t("changeColor")}</span>
                  <input type="color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)} />
                </label>
              </div>
            ) : null}

            {modalState.mode === "media" ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>{t("image")}</span>
                  <input type="file" accept="image/*" onChange={pickFileAsDataUrl(setUploadedImage)} />
                </label>
                <label className={styles.modalField}>
                  <span>{t("banner")}</span>
                  <input type="file" accept="image/*" onChange={pickFileAsDataUrl(setUploadedBanner)} />
                </label>
                <div className={styles.previewGrid}>
                  {uploadedImage ? <img src={uploadedImage} alt="Preview" /> : null}
                  {uploadedBanner ? <img src={uploadedBanner} alt="Preview" /> : null}
                </div>
              </div>
            ) : null}

            <footer className={styles.inlineFooter}>
              <button type="button" className={styles.cancelInline} onClick={closeModalState}>
                {t("cancel")}
              </button>
              <button
                type="button"
                className={styles.saveInline}
                onClick={() => {
                  if (modalState.mode === "rename") {
                    const safeName = renameValue.trim();
                    if (!safeName) return;

                    setEntries((prev) =>
                      prev.map((entry) => {
                        if (entry.id !== modalState.itemId) return entry;
                        const next = { ...entry, name: safeName };
                        persistFolderEntry(next);
                        return next;
                      })
                    );
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "edit") {
                    const safeName = editorTitle.trim();
                    if (!safeName) return;

                    setEntries((prev) =>
                      prev.map((entry) => {
                        if (entry.id !== modalState.itemId) return entry;
                        const next = {
                          ...entry,
                          name: safeName,
                          content: editorBody,
                          description:
                            entry.type === "folder"
                              ? editorBody.slice(0, 120)
                              : entry.description,
                        };
                        persistFolderEntry(next);
                        return next;
                      })
                    );
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "create-note") {
                    const safeName = editorTitle.trim();
                    if (!safeName) return;

                    const created = createNote({
                      title: safeName,
                      content: editorBody,
                      folderId: toParentId(currentFolderId),
                    });

                    setEntries((prev) => [mapSyncNoteToEntry(created), ...prev]);
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "move") {
                    setEntries((prev) => {
                      const targetParentId = toParentId(moveTarget);
                      const selectedItem = prev.find((entry) => entry.id === modalState.itemId);
                      if (!selectedItem) return prev;

                      if (selectedItem.type === "folder" && targetParentId) {
                        const blockedTargets = getDescendantIds(selectedItem.id, prev);
                        blockedTargets.add(selectedItem.id);
                        if (blockedTargets.has(targetParentId)) {
                          return prev;
                        }
                      }

                      return prev.map((entry) => {
                        if (entry.id !== modalState.itemId) return entry;
                        const next = {
                          ...entry,
                          parentId: targetParentId,
                        };
                        persistFolderEntry(next);
                        return next;
                      });
                    });
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "color") {
                    setEntries((prev) =>
                      prev.map((entry) => {
                        if (entry.id !== modalState.itemId) return entry;
                        const next = { ...entry, color: selectedColor };
                        persistFolderEntry(next);
                        return next;
                      })
                    );
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "media") {
                    setEntries((prev) =>
                      prev.map((entry) => {
                        if (entry.id !== modalState.itemId) return entry;
                        const next = {
                          ...entry,
                          imageUrl: uploadedImage,
                          bannerUrl: uploadedBanner,
                        };
                        persistFolderEntry(next);
                        return next;
                      })
                    );
                    closeModalState();
                  }
                }}
              >
                <Check size={15} />
                <span>{t("save")}</span>
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
};

export default FoldersPage;
