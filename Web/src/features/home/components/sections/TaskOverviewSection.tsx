import React from "react";
import { Link } from "react-router-dom";
import styles from "../HomeFeed.module.css";

type Props = {
  total: number;
  completed: number;
  todayCount: number;
};

const TaskOverviewSection: React.FC<Props> = ({ total, completed, todayCount }) => {
  const pending = total - completed;
  const progress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Task Overview</h2>
        <Link to="/tasks" className={styles.viewAll}>View All</Link>
      </div>
      <div className={styles.taskStatsGrid}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Pending</span>
          <div className={styles.statValueRow}>
            <span className={styles.statValue}>{pending}</span>
            <span className={styles.statTotal}>/{total}</span>
          </div>
          <div className={styles.miniProgress}>
            <div className={styles.miniProgressFill} style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Today</span>
          <span className={styles.statValue}>{todayCount}</span>
          <p className={styles.statSubtitle}>Tasks due today</p>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Completed</span>
          <span className={styles.statValue}>{completed}</span>
          <p className={styles.statSubtitle}>All time</p>
        </div>
      </div>
    </section>
  );
};

export default TaskOverviewSection;
