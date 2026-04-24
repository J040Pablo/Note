import React from "react";
import { Folder, FileText, Pin, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "../HomeFeed.module.css";
import { PinnedItemType } from "../../../../types";

type QuickItem = {
  id: string;
  type: PinnedItemType;
  label: string;
  subtitle?: string;
  icon: any;
  isPinned: boolean;
};

type Props = {
  items: QuickItem[];
  onItemClick: (item: any) => void;
  onTogglePin: (type: PinnedItemType, id: string) => void;
};

const QuickAccessSection: React.FC<Props> = ({ items, onItemClick, onTogglePin }) => {
  const { t } = useTranslation();

  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("quickAccess")}</h2>
      </header>
      {items.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTasks}>{t("emptyQuickAccess")}</p>
        </div>
      ) : (
        <div className={styles.quickGrid}>
          {items.map((item) => (
            <div
              key={`${item.type}-${item.id}`}
              className={styles.quickCard}
              onClick={() => onItemClick(item)}
            >
              <div className={styles.quickCardTop}>
                <div className={styles.quickIcon}>
                  <item.icon size={20} />
                </div>
                <button
                  type="button"
                  className={`${styles.pinButton} ${item.isPinned ? styles.pinActive : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(item.type, item.id);
                  }}
                >
                  {item.isPinned ? <Pin size={14} fill="currentColor" /> : <MapPin size={14} />}
                </button>
              </div>
              <div className={styles.quickCardContent}>
                <h3 className={styles.quickCardTitle}>{item.label}</h3>
                {item.subtitle && <p className={styles.quickCardSubtitle}>{item.subtitle}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};

export default QuickAccessSection;
