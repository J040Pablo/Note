import React from "react";
import { 
  Trash2, 
  Copy, 
  Bold, 
  Italic, 
  Type, 
  MoreVertical,
  ChevronDown,
  Lock,
  ArrowRightLeft
} from "lucide-react";
import type { CanvasElement, CanvasTextElement } from "../../../utils/noteContent";
import styles from "./ContextToolbar.module.css";

interface Props {
  element: CanvasElement;
  onUpdate: (id: string, updates: Partial<CanvasElement>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  zoom: number;
}

const ContextToolbar: React.FC<Props> = ({ element, onUpdate, onDelete, onDuplicate, zoom }) => {
  const isText = element.type === "text";
  
  const handleToggleBold = () => {
    if (!isText) return;
    const textEl = element as CanvasTextElement;
    onUpdate(element.id, {
      style: { ...textEl.style, bold: !textEl.style?.bold }
    });
  };

  const handleToggleItalic = () => {
    if (!isText) return;
    const textEl = element as CanvasTextElement;
    onUpdate(element.id, {
      style: { ...textEl.style, italic: !textEl.style?.italic }
    });
  };

  const handleSizeChange = (delta: number) => {
    if (!isText) return;
    const textEl = element as CanvasTextElement;
    const currentSize = textEl.style?.fontSize || 18;
    onUpdate(element.id, {
      style: { ...textEl.style, fontSize: Math.max(8, currentSize + delta) }
    });
  };

  return (
    <div 
      className={styles.toolbar}
      style={{
        top: -48, // Float above element
        left: 0,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className={styles.section}>
        <div className={styles.magicIcon}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" />
          </svg>
        </div>
        <span className={styles.magicText}>Pede pro Canva</span>
      </div>

      <div className={styles.divider} />

      {isText && (
        <>
          <div className={styles.fontSelect}>
            <span>Poppins</span>
            <ChevronDown size={14} />
          </div>
          
          <div className={styles.divider} />

          <div className={styles.sizeControl}>
            <button onClick={() => handleSizeChange(-1)}>-</button>
            <div className={styles.sizeValue}>{(element as CanvasTextElement).style?.fontSize || 18}</div>
            <button onClick={() => handleSizeChange(1)}>+</button>
          </div>

          <div className={styles.divider} />

          <div className={styles.buttonGroup}>
            <button 
              className={`${styles.toolBtn} ${(element as CanvasTextElement).style?.bold ? styles.active : ""}`}
              onClick={handleToggleBold}
            >
              <Bold size={16} />
            </button>
            <button 
              className={`${styles.toolBtn} ${(element as CanvasTextElement).style?.italic ? styles.active : ""}`}
              onClick={handleToggleItalic}
            >
              <Italic size={16} />
            </button>
            <button className={styles.toolBtn}>
              <Type size={16} />
            </button>
          </div>

          <div className={styles.divider} />
        </>
      )}

      <div className={styles.buttonGroup}>
        <button className={styles.toolBtn} onClick={() => onDuplicate(element.id)}>
          <Copy size={16} />
        </button>
        <button className={styles.toolBtn} onClick={() => onDelete(element.id)}>
          <Trash2 size={16} />
        </button>
        <button className={styles.toolBtn}>
          <Lock size={16} />
        </button>
        <button className={styles.toolBtn}>
          <MoreVertical size={16} />
        </button>
      </div>
    </div>
  );
};

export default ContextToolbar;
