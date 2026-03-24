import React from "react";
import styles from "./ActionMenu.module.css";

type FabAction = {
  id: "add-file" | "create-folder" | "quick-note" | "create-note";
  label: string;
  icon: React.ReactNode;
};

type ActionMenuProps = {
  open: boolean;
  actions: FabAction[];
  onAction: (actionId: FabAction["id"]) => void;
};

const ActionMenu: React.FC<ActionMenuProps> = ({ open, actions, onAction }) => {
  return (
    <ul
      className={`${styles.root} ${open ? styles.open : ""}`}
      aria-hidden={!open}
      aria-label="Quick create actions"
    >
      {actions.map((action, index) => (
        <li
          key={action.id}
          className={styles.item}
          style={{ ["--action-index" as string]: index } as React.CSSProperties}
        >
          <button type="button" className={styles.actionButton} onClick={() => onAction(action.id)}>
            <span className={styles.icon}>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};

export type { FabAction };
export default ActionMenu;
