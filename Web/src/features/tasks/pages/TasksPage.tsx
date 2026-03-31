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
  dispatchTaskSyncEvent,
  getTaskSyncStatus,
  subscribeTaskSyncMessages,
  subscribeTaskSyncStatus,
  type SyncTask,
} from "../sync";
import type { TaskDraft, TaskFilters, TaskItem } from "../types";
import { useAppMode } from "../../../app/mode";
import {
  getAllTasks,
  createTask,
  updateTask,
  deleteTask,
  toggleTask as serviceToggleTask,
  reorderTasks as serviceReorderTasks
} from "../../../services/tasksService.web";
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

const weekdayFromDateKey = (dateKey: string) => parseDateKey(dateKey).getDay();

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
  if (task.repeatDays.length > 0) {
    return task.repeatDays.includes(weekdayFromDateKey(dateKey));
  }

  return task.dueDate === dateKey;
};

const defaultFilters: TaskFilters = {
  date: "all",
  priority: "all",
  status: "all",
  query: "",
};

const makeTaskId = () => `task-${Date.now()}-${Math.round(Math.random() * 1e4)}`;

const createDraftFromTask = (task: TaskItem, fallbackSelectedDate: string): TaskDraft => {
  const dueDate = task.dueDate ?? fallbackSelectedDate;

  return {
    title: task.title,
    priority: task.priority,
    dueDate,
    dueTime: task.dueTime ?? "08:00",
    repeatDays: task.repeatDays,
    scheduleMode: task.dueDate ? "custom" : "none",
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

const mapSyncTaskToTaskItem = (task: SyncTask, fallbackOrder = 0): TaskItem => ({
  id: task.id,
  title: task.title,
  completed: !!task.completed,
  priority: task.priority,
  dueDate: typeof task.dueDate === "string" ? task.dueDate : typeof task.date === "string" ? task.date : null,
  dueTime: typeof task.dueTime === "string" ? task.dueTime : null,
  repeatDays: Array.isArray(task.repeatDays) ? task.repeatDays : [],
  order: typeof task.order === "number" ? task.order : fallbackOrder,
  createdAt: typeof task.createdAt === "number" ? task.createdAt : task.updatedAt,
  updatedAt: task.updatedAt,
});

const TasksPage: React.FC = () => {
  const { mode } = useAppMode();
  const isMobileSync = mode === "mobile-sync";

  // Data is loaded from the single shared data layer at initialization.
  const [tasks, setTasks] = React.useState<TaskItem[]>(() => getAllTasks());
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

  // Removed bulk persistStandaloneTasks hook. Let operations use tasksService inline to modify persistent store.

  React.useEffect(() => {
    if (isMobileSync) {
      setTasks([]);
      return;
    }

    disconnectTaskSync();
    setSyncStatus("disconnected");
    setTasks(getAllTasks());
  }, [isMobileSync]);

  React.useEffect(() => {
    if (!isMobileSync) return;

    const unsubStatus = subscribeTaskSyncStatus(setSyncStatus);
    const unsubMessages = subscribeTaskSyncMessages((message) => {
      if (message.type === "INIT" || message.type === "INIT_DATA") {
        // received from mobile
        const syncedTasks = message.payload.tasks.map((task, index) => mapSyncTaskToTaskItem(task, index));
        setTasks(syncedTasks);
        return;
      }

      if (
        message.type === "UPSERT_TASK" ||
        message.type === "TASK_CREATED" ||
        message.type === "TASK_UPDATED"
      ) {
        setTasks((prev) => {
          // received from mobile
          const incoming = mapSyncTaskToTaskItem(message.payload, prev.length + 1);
          if (prev.some((entry) => entry.id === incoming.id)) {
            return prev.map((entry) => (entry.id === incoming.id ? { ...entry, ...incoming } : entry));
          }
          return [incoming, ...prev];
        });
        return;
      }

      if (message.type === "DELETE_TASK" || message.type === "TASK_DELETED") {
        // received from mobile
        setTasks((prev) => prev.filter((entry) => entry.id !== message.payload.id));
      }
    });

    return () => {
      unsubStatus();
      unsubMessages();
    };
  }, [isMobileSync]);

  React.useEffect(() => {
    if (!isMobileSync) return;
    if (!pairingUrl) return;
    connectTaskSync(pairingUrl);
  }, [isMobileSync, pairingUrl]);

  const sendSyncEvent = React.useCallback(
    (event: Parameters<typeof dispatchTaskSyncEvent>[0]) => {
      if (!isMobileSync) return;
      dispatchTaskSyncEvent(event);
    },
    [isMobileSync]
  );

  const monthCells = React.useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  const tasksForSelectedDate = React.useMemo(
    () => tasks.filter((task) => shouldAppearOnDate(task, selectedDate)),
    [selectedDate, tasks]
  );

  const completedForSelectedDate = React.useMemo(
    () => tasksForSelectedDate.filter((task) => task.completed).length,
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
    let next = [...tasks];

    if (filters.query.trim()) {
      const query = filters.query.trim().toLowerCase();
      next = next.filter((task) => task.title.toLowerCase().includes(query));
    }

    if (filters.priority !== "all") {
      next = next.filter((task) => task.priority === filters.priority);
    }

    if (filters.status === "completed") {
      next = next.filter((task) => task.completed);
    }

    if (filters.status === "pending") {
      next = next.filter((task) => !task.completed);
    }

    if (filters.date === "selected") {
      next = next.filter((task) => shouldAppearOnDate(task, selectedDate));
    }

    if (filters.date === "no-date") {
      next = next.filter((task) => !task.dueDate && task.repeatDays.length === 0);
    }

    return next.sort((a, b) => a.order - b.order);
  }, [filters, selectedDate, tasks]);

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

      let sourceOrder = 0;
      let targetOrder = 0;

      tasks.forEach((task) => {
        if (task.id === taskId) sourceOrder = task.order;
        if (task.id === targetTaskId) targetOrder = task.order;
      });

      setTasks((prev) => {
        const next = [...prev];
        const t1 = next.find(t => t.id === taskId);
        const t2 = next.find(t => t.id === targetTaskId);
        if (t1 && t2) {
          t1.order = targetOrder;
          t1.updatedAt = Date.now();
          t2.order = sourceOrder;
          t2.updatedAt = Date.now();
          
          if (!isMobileSync) {
             serviceReorderTasks(next.sort((a,b) => a.order - b.order).map(t => t.id));
          } else {
             sendSyncEvent({ type: "TASK_UPDATE", taskId: t1.id, payload: t1 as any });
             sendSyncEvent({ type: "TASK_UPDATE", taskId: t2.id, payload: t2 as any });
          }
        }
        return next;
      });
    },
    [filteredTaskIds, isMobileSync, sendSyncEvent, tasks]
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
        setTasks((prev) =>
          prev.map((task) => {
            if (task.id !== selectedContextTask.id) return task;
            const completed = !task.completed;
            const updatedTask = { ...task, completed, updatedAt: Date.now() };
            if (!isMobileSync) {
               serviceToggleTask(task.id);
            } else {
               sendSyncEvent({
                 type: "TASK_TOGGLE",
                 taskId: task.id,
                 payload: updatedTask as any,
               });
            }
            return updatedTask;
          })
        );
        return;
      }

      if (action === "move") {
        setMoveModeTaskId(selectedContextTask.id);
        return;
      }

      if (!isMobileSync) deleteTask(selectedContextTask.id);
      
      setTasks((prev) => prev.filter((task) => task.id !== selectedContextTask.id));
      if (isMobileSync) {
        sendSyncEvent({
          type: "TASK_DELETE",
          taskId: selectedContextTask.id,
        });
      }
      
      if (moveModeTaskId === selectedContextTask.id) {
        setMoveModeTaskId(null);
      }
    },
    [closeContextMenu, isMobileSync, moveModeTaskId, openEditModal, selectedContextTask, sendSyncEvent]
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
            const detailLine = task.repeatDays.length
              ? `Repeats: ${task.repeatDays.map((entry) => WEEKDAYS[entry]).join(", ")}`
              : task.dueDate
              ? `Date: ${formatUiDate(task.dueDate)}${task.dueTime ? ` • ${task.dueTime}` : ""}`
              : "No date";

            return (
              <article
                key={task.id}
                className={`${styles.taskRow} ${task.completed ? styles.taskRowCompleted : ""}`}
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
                  className={`${styles.checkbox} ${task.completed ? styles.checkboxDone : ""}`}
                  onClick={() => {
                    setTasks((prev) =>
                      prev.map((entry) => {
                        if (entry.id !== task.id) return entry;
                        const completed = !entry.completed;
                        sendSyncEvent({
                          type: "TASK_TOGGLE",
                          taskId: entry.id,
                          payload: { ...entry, completed, updatedAt: Date.now() } as unknown as Record<string, unknown>,
                        });
                        return { ...entry, completed, updatedAt: Date.now() };
                      })
                    );
                  }}
                  aria-label={task.completed ? "Mark as pending" : "Mark as complete"}
                >
                  {task.completed ? <Check size={14} /> : null}
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
        isCompleted={!!selectedContextTask?.completed}
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
            setTasks((prev) =>
              prev.map((task) => {
                if (task.id !== editingTaskId) return task;
                const updated: TaskItem = {
                  ...task,
                  title: safeTitle,
                  priority: draft.priority,
                  dueDate: normalizedDate,
                  dueTime: normalizedTime,
                  repeatDays: draft.repeatDays,
                  updatedAt: Date.now(),
                };

                if (!isMobileSync) {
                  updateTask(updated);
                } else {
                  sendSyncEvent({
                    type: "TASK_UPDATE",
                    taskId: task.id,
                    payload: updated as unknown as Record<string, unknown>,
                  });
                }

                return updated;
              })
            );
            setModalOpen(false);
            return;
          }

          if (!isMobileSync) {
             const createdDataTask = createTask({
                title: safeTitle,
                priority: draft.priority,
                dueDate: normalizedDate,
                dueTime: normalizedTime,
                repeatDays: draft.repeatDays,
             });
             setTasks((prev) => [createdDataTask, ...prev]);
             setModalOpen(false);
             return;
          }

          const nextOrder = tasks.length > 0 ? Math.max(...tasks.map((task) => typeof task.order === 'number' ? task.order : 0)) + 1 : 0;

          const createdTask: TaskItem = {
            id: makeTaskId(),
            title: safeTitle,
            completed: false,
            priority: draft.priority,
            dueDate: normalizedDate,
            dueTime: normalizedTime,
            repeatDays: draft.repeatDays,
            order: nextOrder,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          setTasks((prev) => [createdTask, ...prev]);
          sendSyncEvent({
            type: "TASK_CREATE",
            taskId: createdTask.id,
            payload: createdTask as unknown as Record<string, unknown>,
          });
          setModalOpen(false);
        }}
      />
    </PageContainer>
  );
};

export default TasksPage;
