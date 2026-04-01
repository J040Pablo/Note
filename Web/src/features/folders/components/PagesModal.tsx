import React from "react";
import { X, Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import type { CanvasPage, CanvasElement } from "../../../utils/noteContent";
import styles from "./PagesModal.module.css";

type Props = {
  open: boolean;
  pages: CanvasPage[];
  elements: CanvasElement[];
  currentPageIndex: number;
  onClose: () => void;
  onSelectPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: (index: number) => void;
  onMovePage: (index: number, direction: "up" | "down") => void;
};

const PagesModal: React.FC<Props> = ({
  open,
  pages,
  elements,
  currentPageIndex,
  onClose,
  onSelectPage,
  onAddPage,
  onDeletePage,
  onMovePage,
}) => {
  if (!open) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Pages</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.pagesList}>
          {pages.map((page, index) => (
            <div 
              key={page.id} 
              className={`${styles.pageCard} ${index === currentPageIndex ? styles.pageCardActive : ""}`}
              onClick={() => onSelectPage(index)}
            >
              <div className={styles.pagePreview}>
                <svg
                  viewBox={`0 0 ${page.width} ${page.height}`}
                  className={styles.miniMap}
                >
                  <rect width={page.width} height={page.height} fill="#ffffff" />
                    {/* Render per-page drawings */}
                    {page.drawings?.map(s => (
                      <polyline
                        key={s.id}
                        points={s.points.map(p => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={s.size * 2}
                      />
                    ))}

                    {elements
                      .filter(el => el.id && el.pageId === page.id)
                      .map(el => {
                        if (el.type === "image") {
                          return <rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height} fill="#e2e8f0" />;
                        }
                        return <rect key={el.id} x={el.x} y={el.y} width={el.width} height={el.height} fill="#cbd5e1" rx={4} />;
                      })}
                </svg>
                <div className={styles.pageNumberBadge}>{index + 1}</div>
              </div>
              <div className={styles.pageActions}>
                <span className={styles.pageCounter}>Page {index + 1}</span>
                <div className={styles.actionBtns}>
                  <button 
                    className={styles.actionBtn} 
                    disabled={index === 0}
                    onClick={(e) => { e.stopPropagation(); onMovePage(index, "up"); }}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button 
                    className={styles.actionBtn}
                    disabled={index === pages.length - 1}
                    onClick={(e) => { e.stopPropagation(); onMovePage(index, "down"); }}
                  >
                    <ChevronDown size={16} />
                  </button>
                  {pages.length > 1 && (
                    <button 
                      className={`${styles.actionBtn} ${styles.deleteBtn}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm("Delete this page?")) onDeletePage(index);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={styles.modalFooter}>
          <button className={styles.addPageBtn} onClick={onAddPage}>
            <Plus size={18} /> Add Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default PagesModal;
