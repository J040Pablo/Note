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
};

type FolderItem = {
  id: string;
  name: string;
  subfolders: number;
  notes: number;
  files: number;
};

const initialTasks: TaskItem[] = [
  { id: "t-1", text: "Review roadmap for web migration", completed: true, recurringDays: 5 },
  { id: "t-2", text: "Finalize Home desktop layout", completed: false },
  { id: "t-3", text: "Sync folder metadata with API", completed: false, recurringDays: 3 },
  { id: "t-4", text: "Refine quick note UX", completed: false },
];

const initialNotes: NoteItem[] = [
  { id: "n-1", title: "Untitled", preview: '{"version":1,"type":"canvas","pageWidth":900,"pageHeight":1200,...}' },
  { id: "n-2", title: "Untitled", preview: '{"version":1,"type":"canvas","pageWidth":900,"pageHeight":1200,...}' },
  { id: "n-3", title: "Untitled", preview: '{"version":1,"type":"canvas","pageWidth":900,"pageHeight":1200,...}' },
  { id: "n-4", title: "Linux teste dnv dnv dnv", preview: "Linux" },
];

const initialFolders: FolderItem[] = [
  { id: "f-1", name: "Linux", subfolders: 2, notes: 2, files: 1 },
  { id: "f-2", name: "C", subfolders: 1, notes: 4, files: 3 },
  { id: "f-3", name: "Design", subfolders: 0, notes: 5, files: 2 },
  { id: "f-4", name: "Work", subfolders: 3, notes: 8, files: 6 },
];

const HomeFeed: React.FC = () => {
  const [tasks, setTasks] = React.useState<TaskItem[]>(initialTasks);
  const [notes, setNotes] = React.useState<NoteItem[]>(initialNotes);
  const [folders] = React.useState<FolderItem[]>(initialFolders);
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
      if (exists) {
        return prev.filter((item) => !(item.type === type && item.id === id));
      }
      return [{ type, id }, ...prev];
    });
  }, []);

  const addRecent = React.useCallback((entry: Omit<RecentItem, "openedAt">) => {
    setRecentItems((prev) => {
      const next = [{ ...entry, openedAt: Date.now() }, ...prev.filter((x) => !(x.type === entry.type && x.id === entry.id))];
      return next.slice(0, 10);
    });
  }, []);

  const toggleTask = React.useCallback((taskId: string) => {
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, completed: !task.completed } : task)));
  }, []);

  const handleCreateQuickNote = React.useCallback(() => {
    const content = quickNote.trim();
    if (!content) return;

    const id = `qn-${Date.now()}`;
    const created: NoteItem = {
      id,
      title: content.length > 32 ? `${content.slice(0, 32)}…` : content,
      preview: content,
    };

    setNotes((prev) => [created, ...prev]);
    setQuickNote("");
  }, [quickNote]);

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
          {notes.slice(0, 5).map((note) => (
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