import React from "react";
import {
  CheckCheck,
  FileText,
  Folder,
  Search as SearchIcon,
} from "lucide-react";
import PageContainer from "../../../components/ui/PageContainer";
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

const sampleIndex: SearchItem[] = [
  {
    id: "s-1",
    title: "Linux",
    description: "Kernel, shell and distro notes",
    type: "folder",
    path: "Home / Linux",
    updatedAt: "Today",
  },
  {
    id: "s-2",
    title: "Docker",
    description: "Containers and compose",
    type: "folder",
    path: "Home / Linux / Docker",
    updatedAt: "Today",
  },
  {
    id: "s-3",
    title: "Desktop spacing tokens",
    description: "Use spacing scale 8 / 12 / 16 / 24",
    type: "note",
    path: "Home / Design",
    updatedAt: "Yesterday",
  },
  {
    id: "s-4",
    title: "Review sidebar UX",
    description: "Polish edge toggle and collapse behavior",
    type: "task",
    path: "Tasks / Sprint",
    updatedAt: "2 days ago",
  },
  {
    id: "s-5",
    title: "Quick Linux commands",
    description: "sudo apt update, ls -la, cat /etc/os-release",
    type: "note",
    path: "Home / Linux",
    updatedAt: "2 days ago",
  },
];

const scopes: Array<{ value: SearchScope; label: string; icon: React.ReactNode }> = [
  { value: "all", label: "All", icon: <SearchIcon size={15} /> },
  { value: "folder", label: "Folders", icon: <Folder size={15} /> },
  { value: "note", label: "Notes", icon: <FileText size={15} /> },
  { value: "task", label: "Tasks", icon: <CheckCheck size={15} /> },
];

const SearchPage: React.FC = () => {
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<SearchScope>("all");

  const filtered = React.useMemo(() => {
    const safe = query.toLowerCase().trim();

    return sampleIndex
      .filter((item) => (scope === "all" ? true : item.type === scope))
      .filter((item) => {
        if (!safe) return true;
        return (
          item.title.toLowerCase().includes(safe) ||
          item.description.toLowerCase().includes(safe) ||
          item.path.toLowerCase().includes(safe)
        );
      });
  }, [query, scope]);

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
