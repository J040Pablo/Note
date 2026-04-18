import React from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import PageContainer from "../../../components/ui/PageContainer";
import TaskContextMenu, { type TaskContextAction } from "../components/TaskContextMenu";
import TaskFiltersPanel from "../components/TaskFilters";
import TaskModal from "../components/TaskModal";
import {
  connectTaskSync,
  disconnectTaskSync,
  getTaskSyncStatus,
  requestTaskSync,
  subscribeTaskSyncStatus,
} from "../sync";
import type { TaskDraft, TaskFilters, TaskItem } from "../types";
import { useAppMode } from "../../../app/mode";
import {
  createTask,
  updateTask,
  deleteTask,
  toggleTaskForDate as serviceToggleTaskForDate,
  reorderTasks as serviceReorderTasks
} from "../../../services/tasksService.web";
import { useSyncDataStore } from "../../../store/syncDataStore";
import styles from "./TasksPage.module.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const formatUiDate = (dateKey: string) =>
  parseDateKey(dateKey).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

const buildMonthCells = (monthDate: Date): Date[] => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
};

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

const getPriorityLabel = (priority: TaskItem["priority"]) => {
  if (priority === "low") return "LOW";
  if (priority === "high") return "HIGH";
  return "MED";
};

const getPriorityClass = (priority: TaskItem["priority"]) => {
  if (priority === "low") return styles.priorityLow;
  if (priority === "high") return styles.priorityHigh;
  return styles.priorityMedium;
};

const shouldAppearOnDate = (task: TaskItem, dateKey: string) => {
  return task.scheduledDate === dateKey;
};

const isTaskCompletedOnDate = (task: TaskItem, dateKey: string) => {
  const completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];
  return completedDates.includes(dateKey);
};

const defaultFilters: TaskFilters = {
  date: "selected",
  priority: "all",
  status: "all",
  query: "",
};

const createDraftFromTask = (task: TaskItem, fallbackSelectedDate: string): TaskDraft => {
  const dueDate = task.scheduledDate ?? fallbackSelectedDate;

  return {
    title: task.title,
    priority: task.priority,
    dueDate,
    dueTime: task.dueTime ?? "08:00",
    repeatDays: task.repeatDays,
    scheduleMode: task.scheduledDate ? "custom" : "none",
  };
};

const createDefaultDraft = (selectedDate: string): TaskDraft => ({
  title: "",
  priority: "medium",
  dueDate: selectedDate,
  dueTime: "08:00",
  repeatDays: [],
  scheduleMode: "selected",
});

const TasksPage: React.FC = () => {
  const { mode } = useAppMode();
  const isMobileSync = mode === "mobile-sync";

  const tasks = useSyncDataStore((state) => state.tasks);
  const [mobileIp, setMobileIp] = React.useState<string>(() => localStorage.getItem("tasks.sync.ip") ?? "192.168.1.107");
  const [mobilePort, setMobilePort] = React.useState<string>(() => localStorage.getItem("tasks.sync.port") ?? "8787");
  const [syncStatus, setSyncStatus] = React.useState(getTaskSyncStatus());
  const [selectedDate, setSelectedDate] = React.useState<string>(toDateKey(new Date()));
  const [monthCursor, setMonthCursor] = React.useState<Date>(new Date());
  const [filters, setFilters] = React.useState<TaskFilters>(defaultFilters);

  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<"create" | "edit">("create");
  const [editingTaskId, setEditingTaskId] = React.useState<string | null>(null);

  const [contextMenuState, setContextMenuState] = React.useState<{
    open: boolean;
    taskId: string | null;
    x: number;
    y: number;
  }>({
    open: false,
    taskId: null,
    x: 0,
    y: 0,
  });

  const [moveModeTaskId, setMoveModeTaskId] = React.useState<string | null>(null);

  const longPressTimerRef = React.useRef<number | null>(null);

  const pairingUrl = React.useMemo(() => {
    const ip = mobileIp.trim();
    if (!ip) return "";

    const normalizedPort = mobilePort.replace(/\D+/g, "") || "8787";
    return `ws://${ip}:${normalizedPort}`;
  }, [mobileIp, mobilePort]);

  React.useEffect(() => {
    if (isMobileSync) return;

    disconnectTaskSync();
    setSyncStatus("disconnected");
  }, [isMobileSync]);

  React.useEffect(() => {
    return subscribeTaskSyncStatus(setSyncStatus);
  }, []);

  React.useEffect(() => {
    if (!isMobileSync) return;
    if (!pairingUrl) return;
    connectTaskSync(pairingUrl);
    const timer = window.setTimeout(() => {
      requestTaskSync();
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isMobileSync, pairingUrl]);

  const monthCells = React.useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  const tasksForSelectedDate = React.useMemo(
    () => tasks.filter((task) => shouldAppearOnDate(task, selectedDate)),
    [selectedDate, tasks]
  );

  const completedForSelectedDate = React.useMemo(
    () => tasksForSelectedDate.filter((task) => isTaskCompletedOnDate(task, selectedDate)).length,
    [tasksForSelectedDate]
  );

  const progressPercentage =
    tasksForSelectedDate.length === 0
      ? 0
      : Math.round((completedForSelectedDate / tasksForSelectedDate.length) * 100);

  const daysWithTasks = React.useMemo(() => {
    const set = new Set<string>();

    monthCells.forEach((day) => {
      const key = toDateKey(day);
      if (tasks.some((task) => shouldAppearOnDate(task, key))) {
        set.add(key);
      }
    });

    return set;
  }, [monthCells, tasks]);

  const filteredTasks = React.useMemo(() => {
    let next = [...tasksForSelectedDate];

    if (filters.query.trim()) {
      const query = filters.query.trim().toLowerCase();
      next = next.filter((task) => task.title.toLowerCase().includes(query));
    }

    if (filters.priority !== "all") {
      next = next.filter((task) => task.priority === filters.priority);
    }

    if (filters.status === "completed") {
      next = next.filter((task) => isTaskCompletedOnDate(task, selectedDate));
    }

    if (filters.status === "pending") {
      next = next.filter((task) => !isTaskCompletedOnDate(task, selectedDate));
    }

    return next.sort((a, b) => a.order - b.order);
  }, [filters, tasksForSelectedDate, selectedDate]);

  const filteredTaskIds = React.useMemo(
    () => filteredTasks.map((task) => task.id),
    [filteredTasks]
  );

  const selectedContextTask = React.useMemo(
    () => tasks.find((task) => task.id === contextMenuState.taskId) ?? null,
    [contextMenuState.taskId, tasks]
  );

  const currentDraft = React.useMemo(() => {
    if (modalMode === "create") {
      return createDefaultDraft(selectedDate);
    }

    const editingTask = tasks.find((task) => task.id === editingTaskId);
    if (!editingTask) {
      return createDefaultDraft(selectedDate);
    }

    return createDraftFromTask(editingTask, selectedDate);
  }, [editingTaskId, modalMode, selectedDate, tasks]);

  const openContextMenu = React.useCallback((taskId: string, x: number, y: number) => {
    setContextMenuState({ open: true, taskId, x, y });
  }, []);

  const closeContextMenu = React.useCallback(() => {
    setContextMenuState((current) => ({ ...current, open: false, taskId: null }));
  }, []);

  const openCreateModal = React.useCallback(() => {
    setModalMode("create");
    setEditingTaskId(null);
    setModalOpen(true);
  }, []);

  const openEditModal = React.useCallback((taskId: string) => {
    setModalMode("edit");
    setEditingTaskId(taskId);
    setModalOpen(true);
  }, []);

  const reorderTask = React.useCallback(
    (taskId: string, direction: "up" | "down") => {
      const currentIndex = filteredTaskIds.indexOf(taskId);
      if (currentIndex === -1) return;

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= filteredTaskIds.length) return;

      const targetTaskId = filteredTaskIds[targetIndex];

      const before = [...tasks].sort((a, b) => a.order - b.order).map((task) => task.id);
      const sourceIndex = before.indexOf(taskId);
      const targetInsertIndex = before.indexOf(targetTaskId);
      if (sourceIndex === -1 || targetInsertIndex === -1) return;

      const withoutSource = before.filter((id) => id !== taskId);
      withoutSource.splice(targetInsertIndex, 0, taskId);
      serviceReorderTasks(withoutSource);
    },
    [filteredTaskIds, tasks]
  );

  const handleContextAction = React.useCallback(
    (action: TaskContextAction) => {
      if (!selectedContextTask) return;

      closeContextMenu();

      if (action === "edit") {
        openEditModal(selectedContextTask.id);
        return;
      }

      if (action === "toggle") {
        serviceToggleTaskForDate(selectedContextTask.id, selectedDate);
        return;
      }

      if (action === "move") {
        setMoveModeTaskId(selectedContextTask.id);
        return;
      }

      deleteTask(selectedContextTask.id);

      if (moveModeTaskId === selectedContextTask.id) {
        setMoveModeTaskId(null);
      }
    },
    [closeContextMenu, moveModeTaskId, openEditModal, selectedContextTask, selectedDate]
  );

  return (
    <PageContainer
      title="Tasks"
      subtitle="Daily productivity"
      action={
        <div className={styles.headerActions}>
          {isMobileSync ? (
            <div className={styles.syncControls}>
              <input
                className={styles.syncInput}
                value={mobileIp}
                onChange={(event) => setMobileIp(event.target.value)}
                placeholder="Mobile IP (192.168.x.x)"
              />
              <input
                className={styles.syncPortInput}
                value={mobilePort}
                onChange={(event) => setMobilePort(event.target.value.replace(/\D+/g, ""))}
                placeholder="Port"
              />
              <button
                type="button"
                className={styles.syncButton}
                onClick={() => {
                  if (!pairingUrl) return;
                  localStorage.setItem("tasks.sync.ip", mobileIp.trim());
                  localStorage.setItem("tasks.sync.port", mobilePort.replace(/\D+/g, "") || "8787");
                  connectTaskSync(pairingUrl);
                  window.setTimeout(() => {
                    requestTaskSync();
                  }, 200);
                }}
              >
                {syncStatus === "connected" ? "Connected" : syncStatus === "connecting" ? "Connecting..." : "Connect"}
              </button>
            </div>
          ) : (
            <div className={styles.standaloneBadge}>Standalone mode</div>
          )}
          <TaskFiltersPanel
            value={filters}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            onChange={setFilters}
          />
          <button type="button" className={styles.createButton} onClick={openCreateModal}>
            <Plus size={17} />
            <span>Task</span>
          </button>
        </div>
      }
    >
      <section className={styles.progressCard}>
        {isMobileSync ? (
          <div className={styles.qrPairingWrap}>
            <div>
              <h3 className={styles.qrTitle}>Pair with Mobile (QR)</h3>
              <p className={styles.qrText}>Scan this QR on Mobile settings to connect automatically.</p>
              <p className={styles.qrUrl}>{pairingUrl || "ws://<mobile-ip>:8787"}</p>
            </div>
            <div className={styles.qrBox}>
              {pairingUrl ? <QRCodeSVG value={pairingUrl} size={132} /> : <span>Enter mobile IP</span>}
            </div>
          </div>
        ) : null}

        <div className={styles.progressHeader}>
          <h3>Today&apos;s progress</h3>
          <span>
            {completedForSelectedDate} / {tasksForSelectedDate.length}
          </span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${progressPercentage}%` }} />
        </div>
        <p>{progressPercentage}% completed</p>
      </section>

      <section className={styles.calendarCard}>
        <header className={styles.calendarHeader}>
          <button
            type="button"
            className={styles.monthButton}
            onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>

          <h3>
            {monthCursor.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h3>

          <button
            type="button"
            className={styles.monthButton}
            onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </header>

        <div className={styles.weekHeaderRow}>
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>

        <div className={styles.grid}>
          {monthCells.map((day) => {
            const key = toDateKey(day);
            const selected = key === selectedDate;
            const inMonth = sameMonth(day, monthCursor);
            const hasTasks = daysWithTasks.has(key);

            return (
              <button
                key={key}
                type="button"
                className={`${styles.dayCell} ${selected ? styles.dayCellSelected : ""}`}
                onClick={() => setSelectedDate(key)}
              >
                <span className={!inMonth ? styles.outsideMonth : ""}>{day.getDate()}</span>
                {hasTasks ? <i className={styles.dayDot} /> : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.listSection}>
        <header className={styles.listHeader}>
          <h3>Tasks</h3>
          <span>{filteredTasks.length} items</span>
        </header>

        <div className={styles.taskList}>
          {filteredTasks.map((task) => {
            const isDone = isTaskCompletedOnDate(task, selectedDate);
            const detailLine = task.repeatDays.length
              ? `Repeats: ${task.repeatDays.map((entry) => WEEKDAYS[entry]).join(", ")}`
              : task.scheduledDate
              ? `Date: ${formatUiDate(task.scheduledDate)}${task.dueTime ? ` • ${task.dueTime}` : ""}`
              : "No date";

            return (
              <article
                key={task.id}
                className={`${styles.taskRow} ${isDone ? styles.taskRowCompleted : ""}`}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openContextMenu(task.id, event.clientX, event.clientY);
                }}
                onPointerDown={(event) => {
                  if (longPressTimerRef.current) {
                    window.clearTimeout(longPressTimerRef.current);
                  }

                  longPressTimerRef.current = window.setTimeout(() => {
                    openContextMenu(task.id, event.clientX, event.clientY);
                  }, 520);
                }}
                onPointerUp={() => {
                  if (longPressTimerRef.current) {
                    window.clearTimeout(longPressTimerRef.current);
                  }
                }}
                onPointerLeave={() => {
                  if (longPressTimerRef.current) {
                    window.clearTimeout(longPressTimerRef.current);
                  }
                }}
              >
                <button
                  type="button"
                  className={`${styles.checkbox} ${isDone ? styles.checkboxDone : ""}`}
                  onClick={() => {
                    serviceToggleTaskForDate(task.id, selectedDate);
                  }}
                  aria-label={isDone ? "Mark as pending" : "Mark as complete"}
                >
                  {isDone ? <Check size={14} /> : null}
                </button>

                <div className={styles.taskBody}>
                  <strong>{task.title}</strong>
                  <p>{detailLine}</p>
                </div>

                <span className={`${styles.priorityBadge} ${getPriorityClass(task.priority)}`}>
                  {getPriorityLabel(task.priority)}
                </span>

                {moveModeTaskId === task.id ? (
                  <div className={styles.moveActions}>
                    <button
                      type="button"
                      className={styles.moveButton}
                      onClick={() => reorderTask(task.id, "up")}
                      aria-label="Move up"
                    >
                      <ArrowUp size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.moveButton}
                      onClick={() => reorderTask(task.id, "down")}
                      aria-label="Move down"
                    >
                      <ArrowDown size={15} />
                    </button>
                    <button
                      type="button"
                      className={styles.moveDoneButton}
                      onClick={() => setMoveModeTaskId(null)}
                    >
                      Done
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          {filteredTasks.length === 0 ? (
            <div className={styles.emptyState}>
              <CalendarDays size={18} />
              <p>No tasks found for current filters.</p>
            </div>
          ) : null}
        </div>
      </section>

      <TaskContextMenu
        open={contextMenuState.open}
        x={contextMenuState.x}
        y={contextMenuState.y}
        title={selectedContextTask?.title ?? "Task"}
        isCompleted={selectedContextTask ? isTaskCompletedOnDate(selectedContextTask, selectedDate) : false}
        onClose={closeContextMenu}
        onAction={handleContextAction}
      />

      <TaskModal
        open={modalOpen}
        mode={modalMode}
        selectedDate={selectedDate}
        initialDraft={currentDraft}
        onClose={() => setModalOpen(false)}
        onSave={(draft) => {
          const safeTitle = draft.title.trim() || "Untitled task";
          const nextDate =
            draft.scheduleMode === "none"
              ? null
              : draft.scheduleMode === "selected"
              ? selectedDate
              : draft.dueDate || selectedDate;

          const normalizedDate = draft.repeatDays.length > 0 ? null : nextDate;
          const normalizedTime = normalizedDate ? draft.dueTime || "08:00" : null;

          if (modalMode === "edit" && editingTaskId) {
            const currentTask = tasks.find((task) => task.id === editingTaskId);
            if (!currentTask) {
              setModalOpen(false);
              return;
            }

            updateTask({
              ...currentTask,
              title: safeTitle,
              priority: draft.priority,
              dueDate: normalizedDate,
              dueTime: normalizedTime,
              repeatDays: draft.repeatDays,
              updatedAt: Date.now(),
            });
            setModalOpen(false);
            return;
          }

          createTask({
            title: safeTitle,
            priority: draft.priority,
            dueDate: normalizedDate,
            dueTime: normalizedTime,
            repeatDays: draft.repeatDays,
          });
          setModalOpen(false);
        }}
      />
    </PageContainer>
  );
};

export default TasksPage;
