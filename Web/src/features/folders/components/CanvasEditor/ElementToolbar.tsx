import React from "react";
import { Copy, Trash, Lock, Unlock, ArrowUp, ArrowDown } from "lucide-react";
import styles from "./ElementToolbar.module.css";

interface ElementToolbarProps {
  isLocked: boolean;
  onDuplicate: () => void;
  onDelete: () => void;
  onLockToggle: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
}

const ElementToolbar: React.FC<ElementToolbarProps> = ({
  isLocked,
  onDuplicate,
  onDelete,
  onLockToggle,
  onBringForward,
  onSendBackward
}) => {
  return (
    <div className={styles.toolbarContainer} onClick={(e) => e.stopPropagation()}>
      <button className={styles.toolbarBtn} onClick={onDuplicate} title="Duplicar">
        <Copy size={16} />
      </button>

      <button className={styles.toolbarBtn} onClick={onLockToggle} title={isLocked ? "Desbloquear" : "Bloquear"}>
        {isLocked ? <Lock size={16} className={styles.lockedIcon} /> : <Unlock size={16} />}
      </button>

      {!isLocked && (
        <>
          <div className={styles.divider} />
          
          <button className={styles.toolbarBtn} onClick={onBringForward} title="Trazer para frente">
            <ArrowUp size={16} />
          </button>
          
          <button className={styles.toolbarBtn} onClick={onSendBackward} title="Enviar para trás">
            <ArrowDown size={16} />
          </button>
        </>
      )}

      <div className={styles.divider} />

      <button className={`${styles.toolbarBtn} ${styles.deleteBtn}`} onClick={onDelete} title="Excluir">
        <Trash size={16} />
      </button>
    </div>
  );
};

export default ElementToolbar;
