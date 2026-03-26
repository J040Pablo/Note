import React from "react";
import {
  ArrowLeft,
  Check,
  FilePlus,
  FileText,
  FolderPlus,
  PenSquare,
  StickyNote,
  X,
} from "lucide-react";
import PageContainer from "../../../components/ui/PageContainer";
import Breadcrumb from "../components/Breadcrumb";
import type { ContextActionId } from "../components/ContextMenu";
import ContextMenu from "../components/ContextMenu";
import FAB from "../components/FAB";
import FilterDropdown from "../components/FilterDropdown";
import FolderCard from "../components/FolderCard";
import FolderListItem from "../components/FolderListItem";
import FolderModal from "../components/FolderModal";
import ViewToggle from "../components/ViewToggle";
import type {
  FolderDraft,
  FolderEntry,
  FolderFilters,
  FolderViewMode,
} from "../types";
import styles from "./FoldersPage.module.css";

const VIEW_MODE_STORAGE_KEY = "folders:view-mode";
const NAVIGATION_ANIMATION_MS = 190;

const initialEntries: FolderEntry[] = [
  {
    id: "f-1",
    parentId: null,
    type: "folder",
    name: "Linux",
    description: "Kernel, shell and distro notes",
    color: "#3b82f6",
    createdAt: Date.now() - 1000 * 60 * 60 * 8,
    imageUrl:
      "https://images.unsplash.com/photo-1629654297299-c8506221ca97?auto=format&fit=crop&w=200&q=80",
    bannerUrl:
      "https://images.unsplash.com/photo-1545239351-1141bd82e8a6?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "f-2",
    parentId: null,
    type: "folder",
    name: "C Language",
    description: "Low-level references",
    color: "#38bdf8",
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
    imageUrl:
      "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=200&q=80",
    bannerUrl:
      "https://images.unsplash.com/photo-1516110833967-0b5716ca1387?auto=format&fit=crop&w=1200&q=80",
  },
  {
    id: "f-3",
    parentId: null,
    type: "folder",
    name: "Java amarelo",
    description: "JVM notes",
    color: "#facc15",
    createdAt: Date.now() - 1000 * 60 * 60 * 3,
  },
  {
    id: "f-4",
    parentId: null,
    type: "folder",
    name: "Design",
    description: "UI references and assets",
    color: "#8b5cf6",
    createdAt: Date.now() - 1000 * 60 * 60,
  },
  {
    id: "f-1-1",
    parentId: "f-1",
    type: "folder",
    name: "Shell",
    description: "Terminal snippets",
    color: "#22c55e",
    createdAt: Date.now() - 1000 * 60 * 30,
  },
  {
    id: "f-1-2",
    parentId: "f-1",
    type: "folder",
    name: "Docker",
    description: "Containers and compose",
    color: "#06b6d4",
    createdAt: Date.now() - 1000 * 60 * 26,
  },
  {
    id: "n-1",
    parentId: "f-1",
    type: "note",
    name: "Linux quick commands",
    description: "Quick note",
    color: "#22c55e",
    content: "sudo apt update\nls -la\ncat /etc/os-release",
    createdAt: Date.now() - 1000 * 60 * 22,
  },
  {
    id: "file-1",
    parentId: "f-1-1",
    type: "file",
    name: "bash-cheatsheet.txt",
    description: "Useful aliases and shortcuts",
    color: "#22c55e",
    content: "alias gs='git status'\nalias ll='ls -lah'",
    createdAt: Date.now() - 1000 * 60 * 12,
  },
  {
    id: "note-2",
    parentId: "f-4",
    type: "note",
    name: "Desktop spacing tokens",
    description: "Create Note",
    color: "#8b5cf6",
    content: "Use spacing scale 8 / 12 / 16 / 24",
    createdAt: Date.now() - 1000 * 60 * 18,
  },
];

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

const FoldersPage: React.FC = () => {
  const [entries, setEntries] = React.useState<FolderEntry[]>(initialEntries);
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
  const [selectedColor, setSelectedColor] = React.useState("#3b82f6");
  const [moveTarget, setMoveTarget] = React.useState<string | null>(null);
  const [uploadedImage, setUploadedImage] = React.useState<string | undefined>(undefined);
  const [uploadedBanner, setUploadedBanner] = React.useState<string | undefined>(undefined);

  const leaveTimerRef = React.useRef<number | null>(null);
  const enterTimerRef = React.useRef<number | null>(null);

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
    const root = [{ id: null, label: "Home" }];
    const nested = path
      .map((folderId) => foldersById.get(folderId))
      .filter(Boolean)
      .map((folder) => ({ id: folder!.id, label: folder!.name }));

    return [...root, ...nested];
  }, [foldersById, path]);

  const currentFolderLabel = path.length === 0 ? "Root folders" : breadcrumbSegments[breadcrumbSegments.length - 1].label;

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

      if (item.type === "folder") {
        navigateWithTransition([...path, item.id], "forward");
        return;
      }

      setModalState({ mode: "edit", itemId: item.id });
      setEditorTitle(item.name);
      setEditorBody(item.content ?? "");
    },
    [entries, navigateWithTransition, path]
  );

  const handleCreateFolder = React.useCallback(
    (payload: FolderDraft) => {
      const created: FolderEntry = {
        id: makeId("folder"),
        parentId: currentFolderId,
        type: "folder",
        createdAt: Date.now(),
        ...payload,
      };

      setEntries((prev) => [created, ...prev]);
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
          id: makeId("file"),
          parentId: currentFolderId,
          type: "file",
          name: `New File ${visibleEntries.filter((item) => item.type === "file").length + 1}.txt`,
          description: "Created from quick action",
          content: "",
          color: "#22c55e",
          createdAt: Date.now(),
        };

        setEntries((prev) => [file, ...prev]);
        return;
      }

      if (actionId === "quick-note") {
        const note: FolderEntry = {
          id: makeId("note"),
          parentId: currentFolderId,
          type: "note",
          name: `Quick Note ${visibleEntries.filter((item) => item.type === "note").length + 1}`,
          description: "Quick Note",
          content: "",
          color: "#f59e0b",
          createdAt: Date.now(),
        };

        setEntries((prev) => [note, ...prev]);
        return;
      }

      setEditorTitle("New Note");
      setEditorBody("");
      setModalState({ mode: "create-note" });
    },
    [currentFolderId, visibleEntries]
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
    (action: ContextActionId) => {
      if (!selectedContextItem) return;

      closeContextMenu();

      if (action === "delete") {
        const descendants =
          selectedContextItem.type === "folder"
            ? getDescendantIds(selectedContextItem.id, entries)
            : new Set<string>();

        setEntries((prev) =>
          prev.filter(
            (entry) =>
              entry.id !== selectedContextItem.id && !descendants.has(entry.id)
          )
        );
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
        setEditorTitle(selectedContextItem.name);
        setEditorBody(selectedContextItem.content ?? selectedContextItem.description ?? "");
        setModalState({ mode: "edit", itemId: selectedContextItem.id });
        return;
      }

      if (action === "change-color") {
        setSelectedColor(selectedContextItem.color);
        setModalState({ mode: "color", itemId: selectedContextItem.id });
        return;
      }

      setUploadedImage(selectedContextItem.imageUrl);
      setUploadedBanner(selectedContextItem.bannerUrl);
      setModalState({ mode: "media", itemId: selectedContextItem.id });
    },
    [closeContextMenu, currentFolderId, entries, selectedContextItem]
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
    () => [{ id: null, label: "Home" }, ...entries.filter((entry) => entry.type === "folder").map((folder) => ({ id: folder.id, label: folder.name }))],
    [entries]
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
      { id: "add-file" as const, label: "Add File", icon: <FilePlus size={16} /> },
      { id: "create-folder" as const, label: "Create Folder", icon: <FolderPlus size={16} /> },
      { id: "quick-note" as const, label: "Quick Note", icon: <StickyNote size={16} /> },
      { id: "create-note" as const, label: "Create Note", icon: <PenSquare size={16} /> },
    ],
    []
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
      title="Folders"
      subtitle={currentFolderLabel}
      action={
        <button
          type="button"
          className={styles.createButton}
          onClick={() => setShowModal(true)}
        >
          <FolderPlus size={17} />
          <span>Folder</span>
        </button>
      }
    >
      {path.length > 0 ? (
        <button
          type="button"
          className={styles.backButton}
          onClick={handleGoBack}
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
      ) : null}

      <Breadcrumb segments={breadcrumbSegments} onNavigate={handleNavigateBreadcrumb} />

      <div className={styles.controls}>
        <div className={styles.meta}>
          <span>{filteredEntries.length} items</span>
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
            <p>No items yet in this folder.</p>
            <span>Use + to add a file, folder or note.</span>
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

      <ContextMenu
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
                {modalState.mode === "rename" && "Rename item"}
                {modalState.mode === "edit" && "Edit item"}
                {modalState.mode === "move" && "Move item"}
                {modalState.mode === "color" && "Change color"}
                {modalState.mode === "media" && "Add image/banner"}
                {modalState.mode === "create-note" && "Create note"}
              </h3>
              <button type="button" className={styles.iconButton} onClick={closeModalState} aria-label="Close">
                <X size={16} />
              </button>
            </header>

            {(modalState.mode === "rename" || modalState.mode === "edit" || modalState.mode === "create-note") ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>Title</span>
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
                    <span>Content</span>
                    <textarea
                      rows={8}
                      value={editorBody}
                      onChange={(event) => setEditorBody(event.target.value)}
                      placeholder="Write your note..."
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {modalState.mode === "move" ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>Destination folder</span>
                  <select value={moveTarget ?? "root"} onChange={(event) => setMoveTarget(event.target.value === "root" ? null : event.target.value)}>
                    {rootMoveOptions
                      .filter((option) => (option.id ? !blockedMoveTargets.has(option.id) : true))
                      .map((option) => (
                        <option key={option.id ?? "root"} value={option.id ?? "root"}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            ) : null}

            {modalState.mode === "color" ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>Color</span>
                  <input type="color" value={selectedColor} onChange={(event) => setSelectedColor(event.target.value)} />
                </label>
              </div>
            ) : null}

            {modalState.mode === "media" ? (
              <div className={styles.modalBody}>
                <label className={styles.modalField}>
                  <span>Image</span>
                  <input type="file" accept="image/*" onChange={pickFileAsDataUrl(setUploadedImage)} />
                </label>
                <label className={styles.modalField}>
                  <span>Banner</span>
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
                Cancel
              </button>
              <button
                type="button"
                className={styles.saveInline}
                onClick={() => {
                  if (modalState.mode === "rename") {
                    const safeName = renameValue.trim();
                    if (!safeName) return;

                    setEntries((prev) =>
                      prev.map((entry) =>
                        entry.id === modalState.itemId ? { ...entry, name: safeName } : entry
                      )
                    );
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "edit") {
                    const safeName = editorTitle.trim();
                    if (!safeName) return;

                    setEntries((prev) =>
                      prev.map((entry) =>
                        entry.id === modalState.itemId
                          ? {
                              ...entry,
                              name: safeName,
                              content: editorBody,
                              description:
                                entry.type === "folder"
                                  ? editorBody.slice(0, 120)
                                  : entry.description,
                            }
                          : entry
                      )
                    );
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "create-note") {
                    const safeName = editorTitle.trim();
                    if (!safeName) return;

                    const newNote: FolderEntry = {
                      id: makeId("note"),
                      parentId: currentFolderId,
                      type: "note",
                      name: safeName,
                      description: "Create Note",
                      content: editorBody,
                      color: "#f59e0b",
                      createdAt: Date.now(),
                    };

                    setEntries((prev) => [newNote, ...prev]);
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "move") {
                    if (moveTarget && blockedMoveTargets.has(moveTarget)) {
                      return;
                    }

                    setEntries((prev) =>
                      prev.map((entry) =>
                        entry.id === modalState.itemId
                          ? {
                              ...entry,
                              parentId: moveTarget,
                            }
                          : entry
                      )
                    );
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "color") {
                    setEntries((prev) =>
                      prev.map((entry) =>
                        entry.id === modalState.itemId
                          ? {
                              ...entry,
                              color: selectedColor,
                            }
                          : entry
                      )
                    );
                    closeModalState();
                    return;
                  }

                  if (modalState.mode === "media") {
                    setEntries((prev) =>
                      prev.map((entry) =>
                        entry.id === modalState.itemId
                          ? {
                              ...entry,
                              imageUrl: uploadedImage,
                              bannerUrl: uploadedBanner,
                            }
                          : entry
                      )
                    );
                    closeModalState();
                  }
                }}
              >
                <Check size={15} />
                <span>Save</span>
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
};

export default FoldersPage;
