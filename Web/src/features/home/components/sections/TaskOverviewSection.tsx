import React from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import styles from "../HomeFeed.module.css";

type Props = {
  total: number;
  completed: number;
  todayCount: number;
};

const TaskOverviewSection: React.FC<Props> = ({ total, completed, todayCount }) => {
  const { t } = useTranslation();
  const pending = total - completed;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("taskOverview")}</h2>
        <Link to="/tasks" className={styles.viewAll}>{t("viewAll")}</Link>
      </div>
      <div className={styles.taskStatsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t("pending")}</span>
          <div className={styles.statValueRow}>
            <span className={styles.statValue}>{pending}</span>
            <span className={styles.statTotal}>/{total}</span>
          </div>
          <div className={styles.miniProgress}>
            <div className={styles.miniProgressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t("today")}</span>
          <span className={styles.statValue}>{todayCount}</span>
          <p className={styles.statSubtitle}>{t("tasksDueToday")}</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>{t("completed")}</span>
          <span className={styles.statValue}>{completed}</span>
          <p className={styles.statSubtitle}>{t("allTime")}</p>
        </div>
      </div>
    </section>
  );
};

export default TaskOverviewSection;
