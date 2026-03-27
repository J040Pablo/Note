import React from "react";
import {
  CheckCheck,
  FileText,
  Folder,
  Search as SearchIcon,
} from "lucide-react";
import PageContainer from "../../../components/ui/PageContainer";
import {
  getFolders,
  getNotes,
  getTasks,
} from "../../../services/webData";
import { useAppMode } from "../../../app/mode";
import { subscribeTaskSyncMessages, type SyncFolder, type SyncNote, type SyncTask } from "../../tasks/sync";
import styles from "./SearchPage.module.css";

type SearchType = "folder" | "note" | "task";
type SearchScope = "all" | SearchType;

type SearchItem = {
  id: string;
  title: string;
  description: string;
  type: SearchType;
  path: string;
  updatedAt: string;
};

const buildSearchIndex = (): SearchItem[] => {
  const folders: SearchItem[] = getFolders().map((folder) => ({
    id: `folder-${String(folder.id ?? Date.now())}`,
    title: String(folder.name ?? "Untitled folder"),
    description: String(folder.description ?? ""),
    type: "folder",
    path: "Home",
    updatedAt: "Recently",
  }));

  const notes: SearchItem[] = getNotes().map((note) => ({
    id: `note-${String(note.id ?? Date.now())}`,
    title: String(note.title ?? "Untitled note"),
    description: String(note.content ?? ""),
    type: "note",
    path: "Home",
    updatedAt: "Recently",
  }));

  const tasks: SearchItem[] = getTasks().map((task) => ({
    id: `task-${String(task.id ?? Date.now())}`,
    title: String(task.title ?? "Untitled task"),
    description: typeof task.priority === "string" ? `Priority: ${task.priority}` : "Task",
    type: "task",
    path: "Tasks",
    updatedAt: "Recently",
  }));

  return [...folders, ...notes, ...tasks];
};

const buildSearchIndexFromSyncPayload = (payload: {
  folders?: SyncFolder[];
  notes?: SyncNote[];
  tasks?: SyncTask[];
}): SearchItem[] => {
  const folders = (payload.folders ?? []).map((folder) => ({
    id: `folder-${folder.id}`,
    title: folder.name || "Untitled folder",
    description: folder.description ?? "",
    type: "folder" as const,
    path: "Home",
    updatedAt: "Recently",
  }));
  const notes = (payload.notes ?? []).map((note) => ({
    id: `note-${note.id}`,
    title: note.title || "Untitled note",
    description: note.content ?? "",
    type: "note" as const,
    path: "Home",
    updatedAt: "Recently",
  }));
  const tasks = (payload.tasks ?? []).map((task) => ({
    id: `task-${task.id}`,
    title: task.title || "Untitled task",
    description: typeof task.priority === "string" ? `Priority: ${task.priority}` : "Task",
    type: "task" as const,
    path: "Tasks",
    updatedAt: "Recently",
  }));
  return [...folders, ...notes, ...tasks];
};

const scopes: Array<{ value: SearchScope; label: string; icon: React.ReactNode }> = [
  { value: "all", label: "All", icon: <SearchIcon size={15} /> },
  { value: "folder", label: "Folders", icon: <Folder size={15} /> },
  { value: "note", label: "Notes", icon: <FileText size={15} /> },
  { value: "task", label: "Tasks", icon: <CheckCheck size={15} /> },
];

const SearchPage: React.FC = () => {
  const { mode } = useAppMode();
  const isMobileSync = mode === "mobile-sync";
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<SearchScope>("all");
  // search now uses real persisted data
  const [searchIndex, setSearchIndex] = React.useState<SearchItem[]>(() => buildSearchIndex());

  React.useEffect(() => {
    setSearchIndex(buildSearchIndex());
  }, []);

  React.useEffect(() => {
    if (!isMobileSync) return;
    const unsub = subscribeTaskSyncMessages((message) => {
      if (message.type !== "INIT") return;
      // received from mobile
      setSearchIndex(buildSearchIndexFromSyncPayload(message.payload));
    });
    return () => unsub();
  }, [isMobileSync]);

  const filtered = React.useMemo(() => {
    const safe = query.toLowerCase().trim();

    return searchIndex
      .filter((item) => (scope === "all" ? true : item.type === scope))
      .filter((item) => {
        if (!safe) return true;
        return (
          item.title.toLowerCase().includes(safe) ||
          item.description.toLowerCase().includes(safe) ||
          item.path.toLowerCase().includes(safe)
        );
      });
  }, [query, scope, searchIndex]);

  const showIdle = query.trim().length === 0;

  return (
    <PageContainer
      title="Search"
      subtitle="Find folders, notes and tasks"
    >
      <div className={styles.searchShell}>
        <label className={styles.searchInputWrap}>
          <SearchIcon size={20} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type to search..."
            aria-label="Global search"
          />
        </label>

        <div className={styles.chips} role="tablist" aria-label="Search category filter">
          {scopes.map((item) => {
            const active = scope === item.value;
            return (
              <button
                key={item.value}
                type="button"
                className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                onClick={() => setScope(item.value)}
                aria-pressed={active}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {showIdle ? (
          <div className={styles.emptyState}>
            <p>Start typing to search.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No results found for “{query.trim()}”.</p>
          </div>
        ) : (
          <ul className={styles.results}>
            {filtered.map((item) => (
              <li key={item.id} className={styles.resultItem}>
                <div className={styles.resultMain}>
                  <span className={styles.resultType}>{item.type}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <div className={styles.resultMeta}>
                  <span>{item.path}</span>
                  <span>{item.updatedAt}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
};

export default SearchPage;
