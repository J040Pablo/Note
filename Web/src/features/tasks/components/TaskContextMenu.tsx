import React from "react";
import { CheckCircle2, Pencil, Trash2, ArrowUpDown } from "lucide-react";
import styles from "./TaskContextMenu.module.css";

export type TaskContextAction = "edit" | "toggle" | "move" | "delete";

type TaskContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  title: string;
  isCompleted: boolean;
  onClose: () => void;
  onAction: (action: TaskContextAction) => void;
};

const MENU_WIDTH = 220;
const MENU_HEIGHT = 208;

const TaskContextMenu: React.FC<TaskContextMenuProps> = ({
  open,
  x,
  y,
  title,
  isCompleted,
  onClose,
  onAction,
}) => {
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [onClose, open]);

  if (!open) return null;

  const safeX = Math.max(12, Math.min(x, window.innerWidth - MENU_WIDTH - 12));
  const safeY = Math.max(12, Math.min(y, window.innerHeight - MENU_HEIGHT - 12));

  return (
    <div className={styles.viewport}>
      <div
        className={styles.menu}
        style={{ left: safeX, top: safeY }}
        ref={menuRef}
        role="menu"
        aria-label={`${title} actions`}
      >
        <button type="button" className={styles.item} onClick={() => onAction("edit")} role="menuitem">
          <Pencil size={15} />
          <span>Edit</span>
        </button>

        <button type="button" className={styles.item} onClick={() => onAction("toggle")} role="menuitem">
          <CheckCircle2 size={15} />
          <span>{isCompleted ? "Mark as pending" : "Mark as complete"}</span>
        </button>

        <button type="button" className={styles.item} onClick={() => onAction("move")} role="menuitem">
          <ArrowUpDown size={15} />
          <span>Move</span>
        </button>

        <button
          type="button"
          className={`${styles.item} ${styles.danger}`}
          onClick={() => onAction("delete")}
          role="menuitem"
        >
          <Trash2 size={15} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
};

export default TaskContextMenu;
