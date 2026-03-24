import React from "react";
import {
  FileText,
  Folder as FolderIcon,
  MoreHorizontal,
  StickyNote,
} from "lucide-react";
import type { FolderEntry } from "../types";
import styles from "./FolderCard.module.css";

type FolderCardProps = {
  item: FolderEntry;
  onActivate: (itemId: string) => void;
  onOpenMenu: (itemId: string, anchor: DOMRect) => void;
};

const FolderCard: React.FC<FolderCardProps> = ({ item, onActivate, onOpenMenu }) => {
  const typeIcon =
    item.type === "folder" ? (
      <FolderIcon size={18} color={item.color} />
    ) : item.type === "note" ? (
      <StickyNote size={18} color={item.color} />
    ) : (
      <FileText size={18} color={item.color} />
    );

  return (
    <article className={styles.card}>
      <button type="button" className={styles.openButton} onClick={() => onActivate(item.id)}>
        <div className={styles.banner}>
          {item.bannerUrl ? <img src={item.bannerUrl} alt="" /> : <div className={styles.bannerFallback} />}
        </div>

        <div className={styles.content}>
          <div className={styles.avatar} style={{ backgroundColor: `${item.color}22` }}>
            {item.imageUrl ? (
              <img src={item.imageUrl} alt="" />
            ) : (
              typeIcon
            )}
          </div>

          <div className={styles.textContent}>
            <h3>{item.name}</h3>
            {item.description ? <p>{item.description}</p> : null}
            <small className={styles.itemType}>{item.type}</small>
          </div>

          <button
            type="button"
            className={styles.menuButton}
            aria-label={`Open menu for ${item.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onOpenMenu(item.id, event.currentTarget.getBoundingClientRect());
            }}
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
      </button>
    </article>
  );
};

export default FolderCard;
