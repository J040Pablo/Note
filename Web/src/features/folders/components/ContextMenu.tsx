import React from "react";
import { Palette, Pencil, Trash2, MoveRight, ImagePlus, FilePenLine } from "lucide-react";
import styles from "./ContextMenu.module.css";

type ContextActionId = "rename" | "delete" | "move" | "edit" | "change-color" | "add-media";

type ContextMenuProps = {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: ContextActionId) => void;
};

const MENU_WIDTH = 220;
const MENU_HEIGHT = 252;

const ContextMenu: React.FC<ContextMenuProps> = ({ open, x, y, onClose, onAction }) => {
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
      <div className={styles.menu} style={{ left: safeX, top: safeY }} ref={menuRef} role="menu" aria-label="Item actions">
        <button type="button" className={styles.item} onClick={() => onAction("rename")} role="menuitem">
          <Pencil size={15} />
          <span>Rename</span>
        </button>
        <button type="button" className={styles.item} onClick={() => onAction("edit")} role="menuitem">
          <FilePenLine size={15} />
          <span>Edit</span>
        </button>
        <button type="button" className={styles.item} onClick={() => onAction("move")} role="menuitem">
          <MoveRight size={15} />
          <span>Move</span>
        </button>
        <button type="button" className={styles.item} onClick={() => onAction("change-color")} role="menuitem">
          <Palette size={15} />
          <span>Change color</span>
        </button>
        <button type="button" className={styles.item} onClick={() => onAction("add-media")} role="menuitem">
          <ImagePlus size={15} />
          <span>Add image/banner</span>
        </button>
        <button type="button" className={`${styles.item} ${styles.danger}`} onClick={() => onAction("delete")} role="menuitem">
          <Trash2 size={15} />
          <span>Delete</span>
        </button>
      </div>
    </div>
  );
};

export type { ContextActionId };
export default ContextMenu;
