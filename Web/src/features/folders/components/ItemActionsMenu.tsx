import React from "react";
import { 
  Palette, 
  Pencil, 
  Trash2, 
  MoveRight, 
  ImagePlus, 
  FilePenLine, 
  Download 
} from "lucide-react";
import type { FolderEntry } from "../types";
import { useTranslation } from "react-i18next";
import styles from "./ItemActionsMenu.module.css";

export type ItemActionId = 
  | "rename" 
  | "delete" 
  | "move" 
  | "edit" 
  | "change-color" 
  | "add-media" 
  | "export";

type ItemActionsMenuProps = {
  item: FolderEntry | null;
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: ItemActionId) => void;
};

const MENU_WIDTH = 220;

const ItemActionsMenu: React.FC<ItemActionsMenuProps> = ({ 
  item, 
  open, 
  x, 
  y, 
  onClose, 
  onAction 
}) => {
  const { t } = useTranslation();
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

  if (!open || !item) return null;

  // Approximate heights based on number of items
  // folder: 7 items (~252px)
  // note: 7 items
  // quick-note: 6 items (no media)
  // task: 4 items (rename, move, color?, delete)
  const getItemCount = () => {
    if (item.type === "folder") return 7;
    if (item.type === "note") return 7;
    if (item.type === "quickNote") return 6;
    if (item.type === "task") return 4;
    return 7;
  };
  
  const estimatedHeight = getItemCount() * 36 + 12;
  const safeX = Math.max(12, Math.min(x, window.innerWidth - MENU_WIDTH - 12));
  const safeY = Math.max(12, Math.min(y, window.innerHeight - estimatedHeight - 12));

  // Rules per type:
  // Folder: All
  // Note/Canvas: Rename, Edit, Move, Change color, Add image/banner, Export, Delete.
  // Quick-note: Rename, Edit, Move, Change color, Export, Delete. (No banner)
  // Task: Rename/Edit, Move, Change color (if supported), Delete.
  
  const isFolder = item.type === "folder";
  const isNote = item.type === "note" || item.type === "canvas";
  const isQuickNote = item.type === "quickNote";
  const isTask = item.type === "task";

  const showEdit = true;
  const showRename = true;
  const showMove = true;
  const showColor = isFolder || isNote || isQuickNote || isTask; 
  const showMedia = isFolder || isNote; 
  const showExport = isFolder || isNote || isQuickNote;

  return (
    <div className={styles.viewport}>
      <div 
        className={styles.menu} 
        style={{ left: safeX, top: safeY }} 
        ref={menuRef} 
        role="menu" 
        aria-label="Item actions"
      >
        {showRename && (
          <button type="button" className={styles.item} onClick={() => onAction("rename")} role="menuitem">
            <Pencil size={15} />
            <span>{t("rename")}</span>
          </button>
        )}
        
        {showEdit && (
          <button type="button" className={styles.item} onClick={() => onAction("edit")} role="menuitem">
            <FilePenLine size={15} />
            <span>{t("edit")}</span>
          </button>
        )}

        {showMove && (
          <button type="button" className={styles.item} onClick={() => onAction("move")} role="menuitem">
            <MoveRight size={15} />
            <span>{t("moveItem")}</span>
          </button>
        )}

        {showColor && (
          <button type="button" className={styles.item} onClick={() => onAction("change-color")} role="menuitem">
            <Palette size={15} />
            <span>{t("changeColor")}</span>
          </button>
        )}

        {showMedia && (
          <button type="button" className={styles.item} onClick={() => onAction("add-media")} role="menuitem">
            <ImagePlus size={15} />
            <span>{t("addMedia")}</span>
          </button>
        )}

        {showExport && (
          <button type="button" className={styles.item} onClick={() => onAction("export")} role="menuitem">
            <Download size={15} />
            <span>{item.type === "folder" ? t("exportFolder") : t("export")}</span>
          </button>
        )}

        <button 
          type="button" 
          className={`${styles.item} ${styles.danger}`} 
          onClick={() => onAction("delete")} 
          role="menuitem"
        >
          <Trash2 size={15} />
          <span>{t("delete")}</span>
        </button>
      </div>
    </div>
  );
};

export default ItemActionsMenu;
