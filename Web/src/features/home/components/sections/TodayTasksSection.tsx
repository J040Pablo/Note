import React from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "../HomeFeed.module.css";

type Task = {
  id: string;
  text: string;
  completed: boolean;
};

type Props = {
  tasks: Task[];
  onToggle: (id: string) => void;
};

const TodayTasksSection: React.FC<Props> = ({ tasks, onToggle }) => {
  const { t } = useTranslation();

  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>{t("today")}</h2>
      </header>
      <div className={styles.todayCard}>
        {tasks.length === 0 ? (
          <p className={styles.emptyTasks}>{t("noTasksToday")}</p>
        ) : (
          <div className={styles.taskList}>
            {tasks.map((task) => (
              <div key={task.id} className={styles.taskItem}>
                <button
                  className={`${styles.checkbox} ${task.completed ? styles.checked : ""}`}
                  onClick={() => onToggle(task.id)}
                >
                  {task.completed && <Check size={12} />}
                </button>
                <span className={`${styles.taskText} ${task.completed ? styles.taskDone : ""}`}>
                  {task.text}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default TodayTasksSection;
