import React from "react";
import {
  Check,
  CheckSquare,
  ChevronRight,
  FileText,
  Folder,
  MapPin,
  Pin,
  Square,
  type LucideIcon,
} from "lucide-react";
import { getAllTasks, toggleTask as serviceToggleTask } from "../../../services/tasksService.web";
import { getAllNotes, getAllQuickNotes, createQuickNote as serviceCreateQuickNote } from "../../../services/notesService.web";
import { getFolders, type DataFolder } from "../../../services/webData";
import { useAppMode } from "../../../app/mode";
import {
  dispatchEntitySyncEvent,
  subscribeTaskSyncMessages,
  type SyncFolder,
  type SyncNote,
  type SyncQuickNote,
  type SyncTask,
} from "../../tasks/sync";
import { subscribeSyncBridge } from "../../../services/syncBridge";
import styles from "./HomeFeed.module.css";

type ItemType = "folder" | "note" | "task";

type PinnedItem = {
  type: ItemType;
  id: string;
};

type RecentItem = {
  id: string;
  type: "folder" | "note";
  label: string;
  subtitle?: string;
  openedAt: number;
};

type TaskItem = {
  id: string;
  text: string;
  completed: boolean;
  recurringDays?: number;
};

type NoteItem = {
  id: string;
  title: string;
  preview: string;
  createdAt: number;
};

type FolderItem = {
  id: string;
  name: string;
  subfolders: number;
  notes: number;
  files: number;
};

// Mapper helpers for Sync UI
const mapSyncTaskToUI = (task: SyncTask): TaskItem => ({
  id: task.id,
  text: task.title || task.text || "Untitled task",
  completed: !!task.completed,
  recurringDays: Array.isArray(task.repeatDays) ? task.repeatDays.length : undefined,
});

const mapNoteToUI = (note: { id: string | number; title: string; content: string; createdAt: number }): NoteItem => ({
  id: String(note.id),
  title: note.title.trim() || "Untitled",
  preview: note.content,
  createdAt: note.createdAt,
});

const mapQuickNoteToUI = (note: { id: string | number; text: string; createdAt: number }): NoteItem => ({
  id: String(note.id),
  title:
    note.text.trim().length > 32
      ? `${note.text.trim().slice(0, 32)}...`
      : note.text.trim() || "Untitled",
  preview: note.text,
  createdAt: note.createdAt,
});

const mapSyncQuickNoteToUI = (note: SyncQuickNote): NoteItem => {
  const content = note.content ?? note.text ?? "";
  return mapQuickNoteToUI({ id: note.id, text: content, createdAt: note.createdAt });
};

const loadHomeTasks = (): TaskItem[] =>
  getAllTasks().map((task) => ({
    id: task.id,
    text: task.title,
    completed: task.completed,
    recurringDays: Array.isArray(task.repeatDays) ? task.repeatDays.length : undefined,
  }));

const loadHomeNotes = (): NoteItem[] => getAllNotes().map((note) => ({
  id: String(note.id),
  title: note.title.trim() || "Untitled",
  preview: note.content,
  createdAt: note.createdAt,
}));

const loadHomeQuickNotes = (): NoteItem[] => getAllQuickNotes().map((note) => ({
  id: String(note.id),
  title:
    note.text.trim().length > 32
      ? `${note.text.trim().slice(0, 32)}...`
      : note.text.trim() || "Untitled",
  preview: note.text,
  createdAt: note.createdAt,
}));

const loadHomeFolders = (): FolderItem[] => {
  const folders = getFolders();
  const notes = getAllNotes();
  const folderIds = new Set(folders.map((folder) => folder.id));

  const noteCountByFolderId = notes.reduce<Record<string, number>>((acc, note) => {
    if (note.parentId && folderIds.has(note.parentId)) {
      acc[note.parentId] = (acc[note.parentId] ?? 0) + 1;
    }
    return acc;
  }, {});

  const subfolderCountByFolderId = folders.reduce<Record<string, number>>((acc, folder) => {
    if (folder.parentId && folderIds.has(folder.parentId)) {
      acc[folder.parentId] = (acc[folder.parentId] ?? 0) + 1;
    }
    return acc;
  }, {});

  return folders.map((folder: DataFolder) => ({
    id: folder.id,
    name: folder.name,
    subfolders: subfolderCountByFolderId[folder.id] ?? 0,
    notes: noteCountByFolderId[folder.id] ?? 0,
    files: 0,
  }));
};

const mapSyncFoldersToUI = (folders: SyncFolder[], notes: SyncNote[]): FolderItem[] => {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const noteCountByFolderId = notes.reduce<Record<string, number>>((acc, note) => {
    if (note.parentId && folderIds.has(note.parentId)) {
      acc[note.parentId] = (acc[note.parentId] ?? 0) + 1;
    }
    return acc;
  }, {});
  const subfolderCountByFolderId = folders.reduce<Record<string, number>>((acc, folder) => {
    if (folder.parentId && folderIds.has(folder.parentId)) {
      acc[folder.parentId] = (acc[folder.parentId] ?? 0) + 1;
    }
    return acc;
  }, {});
  return folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    subfolders: subfolderCountByFolderId[folder.id] ?? 0,
    notes: noteCountByFolderId[folder.id] ?? 0,
    files: 0,
  }));
};

const HomeFeed: React.FC = () => {
  const { mode } = useAppMode();
  const isMobileSync = mode === "mobile-sync";
  // Data source moved from hardcoded arrays to persistent webData layer.
  const [tasks, setTasks] = React.useState<TaskItem[]>(() => loadHomeTasks());
  const [notes, setNotes] = React.useState<NoteItem[]>(() => loadHomeNotes());
  const [quickNotes, setQuickNotes] = React.useState<NoteItem[]>(() => loadHomeQuickNotes());
  const [folders, setFolders] = React.useState<FolderItem[]>(() => loadHomeFolders());
  const renderedNotes = React.useMemo(
    () => [...quickNotes, ...notes].sort((a, b) => b.createdAt - a.createdAt),
    [notes, quickNotes]
  );

  React.useEffect(() => {
    if (!isMobileSync) return;
    const unsub = subscribeTaskSyncMessages((message) => {
      if (message.type !== "INIT") return;
      // received from mobile
      setTasks(message.payload.tasks.map((task) => mapSyncTaskToUI(task)));
      const syncNotes = (message.payload.notes ?? []) as SyncNote[];
      const syncQuickNotes = (message.payload.quickNotes ?? []) as SyncQuickNote[];
      const syncFolders = (message.payload.folders ?? []) as SyncFolder[];
      setNotes(syncNotes.map((note) => mapNoteToUI(note)));
      setQuickNotes(syncQuickNotes.map((note) => mapSyncQuickNoteToUI(note)));
      setFolders(mapSyncFoldersToUI(syncFolders, syncNotes));
    });
    return () => unsub();
  }, [isMobileSync]);

  React.useEffect(() => {
    if (!isMobileSync) return;
    const unsub = subscribeSyncBridge(() => {
      setTasks(loadHomeTasks());
      setNotes(loadHomeNotes());
      setQuickNotes(loadHomeQuickNotes());
      setFolders(loadHomeFolders());
    });
    return () => unsub();
  }, [isMobileSync]);

  const [pinnedItems, setPinnedItems] = React.useState<PinnedItem[]>([]);
  const [recentItems, setRecentItems] = React.useState<RecentItem[]>([]);
  const [quickNote, setQuickNote] = React.useState("");

  const todaysTasks = React.useMemo(() => tasks.slice(0, 7), [tasks]);
  const completedToday = React.useMemo(
    () => todaysTasks.filter((task) => task.completed).length,
    [todaysTasks]
  );
  const recurringCount = React.useMemo(
    () => todaysTasks.filter((task) => !!task.recurringDays).length,
    [todaysTasks]
  );
  const progress = todaysTasks.length ? (completedToday / todaysTasks.length) * 100 : 0;

  const pinSet = React.useMemo(
    () => new Set(pinnedItems.map((item) => `${item.type}:${item.id}`)),
    [pinnedItems]
  );

  const pinnedResolved = React.useMemo(() => {
    return pinnedItems
      .map((item) => {
        if (item.type === "folder") {
          const folder = folders.find((f) => f.id === item.id);
          return folder
            ? {
                ...item,
                label: folder.name,
                subtitle: `${folder.notes} notes`,
                icon: Folder as LucideIcon,
              }
            : null;
        }

        if (item.type === "note") {
          const note = notes.find((n) => n.id === item.id);
          return note
            ? {
                ...item,
                label: note.title,
                subtitle: note.preview,
                icon: FileText as LucideIcon,
              }
            : null;
        }

        const task = tasks.find((t) => t.id === item.id);
        return task
          ? {
              ...item,
              label: task.text,
              subtitle: "Today",
              icon: CheckSquare as LucideIcon,
            }
          : null;
      })
      .filter(Boolean) as Array<{
      type: ItemType;
      id: string;
      label: string;
      subtitle?: string;
      icon: LucideIcon;
    }>;
  }, [folders, notes, pinnedItems, tasks]);

  const togglePin = React.useCallback((type: ItemType, id: string) => {
    setPinnedItems((prev) => {
      const exists = prev.some((item) => item.type === type && item.id === id);
      const next = exists
        ? prev.filter((item) => !(item.type === type && item.id === id))
        : [{ type, id }, ...prev];
      if (isMobileSync) {
        dispatchEntitySyncEvent({
          type: "UPSERT_APP_META",
          payload: {
            key: "web.pinned_items",
            value: JSON.stringify(next),
            updatedAt: Date.now(),
          },
        });
      }
      return next;
    });
  }, [isMobileSync]);

  const addRecent = React.useCallback((entry: Omit<RecentItem, "openedAt">) => {
    setRecentItems((prev) => {
      const next = [{ ...entry, openedAt: Date.now() }, ...prev.filter((x) => !(x.type === entry.type && x.id === entry.id))];
      const sliced = next.slice(0, 10);
      if (isMobileSync) {
        dispatchEntitySyncEvent({
          type: "UPSERT_APP_META",
          payload: {
            key: "web.recent_items",
            value: JSON.stringify(sliced),
            updatedAt: Date.now(),
          },
        });
      }
      return sliced;
    });
  }, [isMobileSync]);

  const toggleTask = React.useCallback((taskId: string) => {
    setTasks((prev) => {
      const next = prev.map((task) => (task.id === taskId ? { ...task, completed: !task.completed } : task));
      if (!isMobileSync) {
        serviceToggleTask(taskId);
      }
      return next;
    });
  }, []);

  const handleCreateQuickNote = React.useCallback(() => {
    const content = quickNote.trim();
    if (!content) return;

    const id = `qn-${Date.now()}`;
    const created = mapQuickNoteToUI({
      id,
      text: content,
      createdAt: Date.now(),
    });

    setQuickNotes((prev) => [created, ...prev]);
    setQuickNote("");

    if (isMobileSync) {
      // sent to mobile
      dispatchEntitySyncEvent({
        type: "UPSERT_QUICK_NOTE",
        payload: {
          id: created.id,
          title: created.title,
          content,
          text: content,
          createdAt: created.createdAt,
          updatedAt: Date.now(),
        },
      });
      return;
    }

    if (!isMobileSync) {
       serviceCreateQuickNote({ text: content });
    }
  }, [isMobileSync, quickNote]);

  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>Pinned</h2>
        </header>
        {pinnedResolved.length === 0 ? (
          <p className={styles.muted}>Click pin on folders, notes or tasks to keep them here.</p>
        ) : (
          <div className={styles.pinnedGrid}>
            {pinnedResolved.map((item) => (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                className={styles.pinnedCard}
                onClick={() => {
                  if (item.type === "folder") {
                    addRecent({ id: item.id, type: "folder", label: item.label, subtitle: item.subtitle });
                  }
                  if (item.type === "note") {
                    addRecent({ id: item.id, type: "note", label: item.label, subtitle: item.subtitle });
                  }
                }}
              >
                <div className={styles.pinnedTopRow}>
                  <item.icon size={16} />
                  <span
                    className={styles.pinAction}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      togglePin(item.type, item.id);
                    }}
                  >
                    <Pin size={14} />
                  </span>
                </div>
                <p className={styles.pinnedTitle}>{item.label}</p>
                {item.subtitle ? <p className={styles.pinnedSubtitle}>{item.subtitle}</p> : null}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>Today's tasks</h2>
          {recurringCount ? <span className={styles.badge}>{recurringCount} recurring</span> : null}
        </header>

        <div className={styles.progressMeta}>
          <span>
            {completedToday}/{todaysTasks.length} completed
          </span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>

        <div className={styles.list}>
          {todaysTasks.map((task) => (
            <button key={task.id} type="button" className={styles.listItem}>
              <span
                className={styles.checkbox}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleTask(task.id);
                }}
                role="checkbox"
                aria-checked={task.completed}
              >
                  {task.completed ? <Check size={13} /> : null}
              </span>

              <span className={task.completed ? styles.taskDone : ""}>{task.text}</span>

              <span
                className={styles.pinAction}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  togglePin("task", task.id);
                }}
              >
                  {pinSet.has(`task:${task.id}`) ? <Pin size={14} /> : <MapPin size={14} />}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>Recent notes</h2>
        </header>

        <div className={styles.list}>
          {renderedNotes.slice(0, 5).map((note) => (
            <button
              key={note.id}
              type="button"
              className={`${styles.listItem} ${styles.noteItem}`}
              onClick={() => addRecent({ id: note.id, type: "note", label: note.title, subtitle: note.preview })}
            >
              <div>
                <p className={styles.noteTitle}>{note.title || "Untitled"}</p>
                <p className={styles.notePreview}>{note.preview}</p>
              </div>
              <span
                className={styles.pinAction}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  togglePin("note", note.id);
                }}
              >
                {pinSet.has(`note:${note.id}`) ? <Pin size={14} /> : <MapPin size={14} />}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>Quick note</h2>
        </header>
        <div className={styles.quickNoteWrap}>
          <textarea
            className={styles.quickNoteInput}
            placeholder="Write something quick..."
            value={quickNote}
            onChange={(event) => setQuickNote(event.target.value)}
          />
          <button type="button" className={styles.primaryButton} onClick={handleCreateQuickNote}>
            Save quick note
          </button>
        </div>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>Folders preview</h2>
        </header>

        <div className={styles.list}>
          {folders.slice(0, 6).map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={styles.listItem}
              onClick={() =>
                addRecent({
                  id: folder.id,
                  type: "folder",
                  label: folder.name,
                  subtitle: `${folder.subfolders} folders • ${folder.notes} notes • ${folder.files} files`,
                })
              }
            >
              <Folder size={16} />
              <div>
                <p className={styles.folderName}>{folder.name}</p>
                <p className={styles.folderMeta}>
                  {folder.subfolders} folders • {folder.notes} notes • {folder.files} files
                </p>
              </div>
              <span
                className={styles.pinAction}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  togglePin("folder", folder.id);
                }}
              >
                {pinSet.has(`folder:${folder.id}`) ? <Pin size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <h2>Recent</h2>
        </header>
        {recentItems.length === 0 ? (
          <p className={styles.muted}>No recently opened items.</p>
        ) : (
          <div className={styles.list}>
            {recentItems.map((item) => (
              <div key={`${item.type}-${item.id}`} className={styles.listItemStatic}>
                {item.type === "folder" ? <Folder size={16} /> : <FileText size={16} />}
                <div>
                  <p className={styles.folderName}>{item.label}</p>
                  {item.subtitle ? <p className={styles.folderMeta}>{item.subtitle}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default HomeFeed;