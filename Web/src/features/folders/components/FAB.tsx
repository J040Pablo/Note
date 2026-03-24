import React from "react";
import { Plus, X } from "lucide-react";
import ActionMenu, { type FabAction } from "./ActionMenu";
import styles from "./FAB.module.css";

type FABProps = {
  open: boolean;
  actions: FabAction[];
  onToggle: () => void;
  onAction: (actionId: FabAction["id"]) => void;
};

const FAB: React.FC<FABProps> = ({ open, actions, onToggle, onAction }) => {
  const handleAction = React.useCallback(
    (actionId: FabAction["id"]) => {
      onAction(actionId);
      onToggle();
    },
    [onAction, onToggle]
  );

  return (
    <>
      <button
        type="button"
        className={`${styles.backdrop} ${open ? styles.backdropVisible : ""}`}
        onClick={onToggle}
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
      />

      <div className={styles.root}>
        <ActionMenu open={open} actions={actions} onAction={handleAction} />

        <button
          type="button"
          className={`${styles.trigger} ${open ? styles.triggerOpen : ""}`}
          onClick={onToggle}
          aria-label={open ? "Close actions" : "Open actions"}
          aria-expanded={open}
        >
          <span className={styles.iconWrap}>{open ? <X size={20} /> : <Plus size={22} />}</span>
        </button>
      </div>
    </>
  );
};

export default FAB;
