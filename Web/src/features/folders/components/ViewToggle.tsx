import React from "react";
import { Grid2x2, List } from "lucide-react";
import type { FolderViewMode } from "../types";
import styles from "./ViewToggle.module.css";

type ViewToggleProps = {
  value: FolderViewMode;
  onChange: (value: FolderViewMode) => void;
};

const ViewToggle: React.FC<ViewToggleProps> = ({ value, onChange }) => {
  return (
    <div className={styles.root} role="tablist" aria-label="Folder view mode">
      <button
        type="button"
        className={`${styles.button} ${value === "list" ? styles.active : ""}`}
        onClick={() => onChange("list")}
        aria-pressed={value === "list"}
        title="List view"
      >
        <List size={16} />
        <span>List</span>
      </button>

      <button
        type="button"
        className={`${styles.button} ${value === "grid" ? styles.active : ""}`}
        onClick={() => onChange("grid")}
        aria-pressed={value === "grid"}
        title="Grid view"
      >
        <Grid2x2 size={16} />
        <span>Grid</span>
      </button>
    </div>
  );
};

export default ViewToggle;
