import React from "react";
import { X } from "lucide-react";
import type { TaskDraft } from "../types";
import styles from "./TaskModal.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

type TaskModalProps = {
  open: boolean;
  mode: "create" | "edit";
  selectedDate: string;
  initialDraft: TaskDraft;
  parentTaskTitle?: string;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
};

const TaskModal: React.FC<TaskModalProps> = ({
  open,
  mode,
  selectedDate,
  initialDraft,
  parentTaskTitle,
  onClose,
  onSave,
}) => {
  const [draft, setDraft] = React.useState<TaskDraft>(initialDraft);

  React.useEffect(() => {
    if (!open) return;
    setDraft(initialDraft);
  }, [initialDraft, open]);

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.card} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <header className={styles.header}>
          <h3>{mode === "edit" ? "Edit task" : "New task"}</h3>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close task modal">
            <X size={16} />
          </button>
        </header>

        <div className={styles.body}>
          <label className={styles.field}>
            <span>Task name</span>
            <input
              autoFocus
              value={draft.title}
              onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="New task..."
            />
          </label>

          <div className={styles.dateTimeRow}>
            <label className={styles.field}>
              <span>Date</span>
              <input
                type="date"
                disabled={draft.scheduleMode === "none" || draft.scheduleMode === "selected"}
                value={draft.scheduleMode === "none" ? "" : draft.dueDate}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    dueDate: event.target.value,
                    scheduleMode: "custom",
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Time</span>
              <input
                type="time"
                disabled={draft.scheduleMode === "none"}
                value={draft.dueTime}
                onChange={(event) => setDraft((prev) => ({ ...prev, dueTime: event.target.value }))}
              />
            </label>
          </div>

          <span className={styles.sectionTitle}>Priority</span>
          <div className={styles.priorityGroup}>
            {([
              { label: "Low", value: "low" },
              { label: "Medium", value: "medium" },
              { label: "High", value: "high" },
            ] as const).map((priority) => {
              const active = draft.priority === priority.value;
              return (
                <button
                  key={priority.value}
                  type="button"
                  className={`${styles.chip} ${active ? styles.chipActive : ""}`}
                  onClick={() => setDraft((prev) => ({ ...prev, priority: priority.value }))}
                >
                  {priority.label}
                </button>
              );
            })}
          </div>

          <span className={styles.sectionTitle}>Repeat on</span>
          <div className={styles.repeatWrap}>
            {WEEKDAYS.map((day, index) => {
              const active = draft.repeatDays.includes(index);
              return (
                <button
                  key={day}
                  type="button"
                  className={`${styles.dayChip} ${active ? styles.dayChipActive : ""}`}
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      repeatDays: prev.repeatDays.includes(index)
                        ? prev.repeatDays.filter((entry) => entry !== index)
                        : [...prev.repeatDays, index],
                    }))
                  }
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className={styles.scheduleActions}>
            <button
              type="button"
              className={styles.subtleButton}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  dueDate: selectedDate,
                  scheduleMode: "selected",
                }))
              }
            >
              Selected date
            </button>
            <button
              type="button"
              className={styles.subtleButton}
              onClick={() =>
                setDraft((prev) => ({
                  ...prev,
                  dueDate: "",
                  dueTime: "08:00",
                  scheduleMode: "none",
                }))
              }
            >
              No date
            </button>
          </div>
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveButton}
            onClick={() => {
              if (!draft.title.trim()) return;
              onSave(draft);
            }}
          >
            {mode === "edit" ? "Save" : "Create Task"}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default TaskModal;
