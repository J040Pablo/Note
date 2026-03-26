import React from "react";
import { Filter, Search } from "lucide-react";
import type { TaskFilters } from "../types";
import styles from "./TaskFilters.module.css";

type TaskFiltersProps = {
  value: TaskFilters;
  selectedDate: string;
  onSelectedDateChange: (nextDate: string) => void;
  onChange: (next: TaskFilters) => void;
};

const TaskFiltersPanel: React.FC<TaskFiltersProps> = ({
  value,
  selectedDate,
  onSelectedDateChange,
  onChange,
}) => {
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
        <div className={styles.panel} role="dialog" aria-label="Task filters">
          <label className={styles.field}>
            <span className={styles.label}>Search</span>
            <div className={styles.searchWrap}>
              <Search size={14} />
              <input
                value={value.query}
                onChange={(event) => onChange({ ...value, query: event.target.value })}
                placeholder="Task name"
              />
            </div>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Date</span>
            <select
              value={value.date}
              onChange={(event) =>
                onChange({ ...value, date: event.target.value as TaskFilters["date"] })
              }
            >
              <option value="all">All dates</option>
              <option value="selected">Selected date only</option>
              <option value="no-date">No date</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Selected date</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => onSelectedDateChange(event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Priority</span>
            <select
              value={value.priority}
              onChange={(event) =>
                onChange({ ...value, priority: event.target.value as TaskFilters["priority"] })
              }
            >
              <option value="all">All priorities</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Status</span>
            <select
              value={value.status}
              onChange={(event) =>
                onChange({ ...value, status: event.target.value as TaskFilters["status"] })
              }
            >
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
          </label>

          <button
            type="button"
            className={styles.resetButton}
            onClick={() =>
              onChange({
                date: "all",
                priority: "all",
                status: "all",
                query: "",
              })
            }
          >
            Reset filters
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default TaskFiltersPanel;
