import React from "react";
import { Filter, Search } from "lucide-react";
import type { FolderEntry, FolderFilters } from "../types";
import styles from "./FilterDropdown.module.css";

type FilterDropdownProps = {
  value: FolderFilters;
  folders: FolderEntry[];
  onChange: (next: FolderFilters) => void;
};

const FilterDropdown: React.FC<FilterDropdownProps> = ({ value, folders, onChange }) => {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const colorOptions = React.useMemo(() => {
    const unique = Array.from(new Set(folders.map((folder) => folder.color)));
    return unique;
  }, [folders]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Filter size={16} />
        <span>Filter</span>
      </button>

      {open ? (
        <div className={styles.panel} role="dialog" aria-label="Filter folders">
          <label className={styles.field}>
            <span className={styles.label}>By name</span>
            <div className={styles.searchWrap}>
              <Search size={14} />
              <input
                value={value.nameQuery}
                onChange={(event) => onChange({ ...value, nameQuery: event.target.value })}
                placeholder="Search folders"
              />
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Sort</span>
            <select
              value={value.sortBy}
              onChange={(event) => onChange({ ...value, sortBy: event.target.value as FolderFilters["sortBy"] })}
            >
              <option value="custom">Custom order</option>
              <option value="date">Most recent</option>
              <option value="name">Name (A-Z)</option>
              <option value="color">Color</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Color</span>
            <select
              value={value.color}
              onChange={(event) => onChange({ ...value, color: event.target.value })}
            >
              <option value="all">All colors</option>
              {colorOptions.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={styles.resetButton}
            onClick={() => onChange({ nameQuery: "", color: "all", sortBy: "custom" })}
          >
            Reset filters
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default FilterDropdown;
