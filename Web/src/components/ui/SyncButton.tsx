import React from "react";
import { RefreshCcw } from "lucide-react";
import styles from "./SyncButton.module.css";

type SyncButtonProps = {
  onClick?: () => void;
};

const SyncButton: React.FC<SyncButtonProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      className={styles.syncButton}
      onClick={onClick}
      title="Sync devices"
      aria-label="Sync devices"
    >
      <RefreshCcw size={16} />
      <span>Sync</span>
    </button>
  );
};

export default SyncButton;
