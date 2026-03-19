import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, Modal, ScrollView, LayoutAnimation, ActivityIndicator, Vibration } from "react-native";
import { useFeedback } from "@components/FeedbackProvider";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { useTheme } from "@hooks/useTheme";
import { useTasksStore } from "@store/useTasksStore";
import {
  createTask,
  deleteTask,
  getAllTasks,
  isTaskCompletedForDate,
  reorderTasks,
  shouldAppearOnDate,
  toDateKey,
  toggleTaskForDate,
  updateTask,
  updateTaskPriority,
  weekdayFromDateKey,
  TaskPriority
} from "@services/tasksService";
import {
  getSortPreference,
  saveSortPreference
} from "@services/appMetaService";
import { Ionicons } from "@expo/vector-icons";
import type { Task } from "@models/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { TabsParamList } from "@navigation/RootNavigator";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";

type TasksRoute = RouteProp<TabsParamList, "Tasks">;
type TasksNav = BottomTabNavigationProp<TabsParamList, "Tasks">;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const buildMonthCells = (monthDate: Date): Date[] => {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
};

const sameMonth = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

type TaskSortMode = "custom" | "recent" | "name_asc" | "name_desc";
const TASK_SORT_SCOPE = "tasks.sort";

const TasksScreen: React.FC = () => {
  const { theme } = useTheme();
  const route = useRoute<TasksRoute>();
  const navigation = useNavigation<TasksNav>();
  const { showToast } = useFeedback();
  const tasksMap = useTasksStore((s) => s.tasks);
  const setTasks = useTasksStore((s) => s.setTasks);
  const upsertTask = useTasksStore((s) => s.upsertTask);
  const removeTask = useTasksStore((s) => s.removeTask);

  const [newText, setNewText] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(1);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [scheduledDate, setScheduledDate] = useState<string>(toDateKey(new Date()));
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(toDateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSortMode>("custom");
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskDeleting, setTaskDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const [all, savedSort] = await Promise.all([
        getAllTasks(),
        getSortPreference<TaskSortMode>(TASK_SORT_SCOPE, "custom")
      ]);
      setTasks(all);
      setSortMode(savedSort);
    })();
  }, [setTasks]);

  useEffect(() => {
    const focusTaskId = route.params?.focusTaskId;
    const targetDate = route.params?.dateKey;
    if (route.params?.openCreate) {
      openCreateModal();
      navigation.setParams({ openCreate: undefined });
      return;
    }
    if (targetDate) {
      setSelectedDate(targetDate);
      return;
    }
    if (!focusTaskId) return;
    const task = tasksMap[focusTaskId];
    if (!task) return;
    if (task.scheduledDate) {
      setSelectedDate(task.scheduledDate);
    } else {
      setSelectedDate(toDateKey(new Date()));
    }
  }, [navigation, route.params?.dateKey, route.params?.focusTaskId, route.params?.openCreate, tasksMap]);

  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

  const monthCells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  const tasksForSelectedDate = useMemo(
    () => tasks.filter((task) => shouldAppearOnDate(task, selectedDate)),
    [selectedDate, tasks]
  );

  const sortedTasksForSelectedDate = useMemo(() => {
    if (sortMode === "name_asc") return [...tasksForSelectedDate].sort((a, b) => a.text.localeCompare(b.text));
    if (sortMode === "name_desc") return [...tasksForSelectedDate].sort((a, b) => b.text.localeCompare(a.text));
    if (sortMode === "recent") {
      return [...tasksForSelectedDate].sort((a, b) => {
        const ad = a.scheduledDate ? Number(a.scheduledDate.replace(/-/g, "")) : 0;
        const bd = b.scheduledDate ? Number(b.scheduledDate.replace(/-/g, "")) : 0;
        if (bd !== ad) return bd - ad;
        return Number(b.id) - Number(a.id);
      });
    }
    return [...tasksForSelectedDate].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
  }, [sortMode, tasksForSelectedDate]);

  const completedToday = useMemo(
    () => tasksForSelectedDate.filter((task) => isTaskCompletedForDate(task, selectedDate)).length,
    [selectedDate, tasksForSelectedDate]
  );

  const progressPct =
    tasksForSelectedDate.length === 0 ? 0 : Math.round((completedToday / tasksForSelectedDate.length) * 100);

  const dayHasTasks = useMemo(() => {
    const map = new Set<string>();
    monthCells.forEach((d) => {
      const key = toDateKey(d);
      if (tasks.some((task) => shouldAppearOnDate(task, key))) {
        map.add(key);
      }
    });
    return map;
  }, [monthCells, tasks]);

  const openCreateModal = () => {
    setEditingTask(null);
    setNewText("");
    setPriority(1);
    setRepeatDays([]);
    setScheduledDate(selectedDate);
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setNewText(task.text);
    setPriority((task.priority as TaskPriority) ?? 1);
    setRepeatDays(task.repeatDays ?? []);
    setScheduledDate(task.scheduledDate ?? selectedDate);
    setShowModal(true);
  };

  const handleTaskLongPress = useCallback((task: Task) => {
    Vibration.vibrate(10);
    setSelectedTask(task);
  }, []);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title">Tasks</Text>
          <Text muted>Daily productivity</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowSortMenu(true)}
            style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
          >
            <Ionicons name="funnel-outline" size={16} color={theme.colors.textPrimary} />
          </Pressable>
          <PrimaryButton
            label="+ Task"
            onPress={openCreateModal}
          />
        </View>
      </View>

      <View style={[styles.progressCard, { backgroundColor: theme.colors.card }]}> 
        <View style={styles.progressHeader}>
          <Text variant="subtitle">Today&apos;s progress</Text>
          <Text muted>
            {completedToday} / {tasksForSelectedDate.length}
          </Text>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}> 
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressPct}%`,
                backgroundColor: theme.colors.primary
              }
            ]}
          />
        </View>
        <Text muted style={styles.progressMeta}>{progressPct}% completed</Text>
      </View>

      <View style={[styles.calendarCard, { backgroundColor: theme.colors.card }]}> 
        <View style={styles.calendarHeader}>
          <Pressable
            onPress={() =>
              setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
            }
            style={styles.monthArrow}
          >
            <Ionicons name="chevron-back" size={18} color={theme.colors.textPrimary} />
          </Pressable>
          <Text variant="subtitle">
            {monthCursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </Text>
          <Pressable
            onPress={() =>
              setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
            }
            style={styles.monthArrow}
          >
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.weekHeaderRow}>
          {WEEKDAYS.map((day) => (
            <Text key={day} muted style={styles.weekHeaderLabel}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {monthCells.map((day) => {
            const key = toDateKey(day);
            const isSelected = key === selectedDate;
            const inMonth = sameMonth(day, monthCursor);
            const hasTasks = dayHasTasks.has(key);

            return (
              <Pressable
                key={key}
                onPress={() => setSelectedDate(key)}
                style={[
                  styles.dayCell,
                  isSelected && { backgroundColor: theme.colors.primaryAlpha20 }
                ]}
              >
                <Text
                  style={{
                    color: isSelected
                      ? theme.colors.primary
                      : inMonth
                      ? theme.colors.textPrimary
                      : theme.colors.textSecondary,
                    fontWeight: isSelected ? "700" : "400"
                  }}
                >
                  {day.getDate()}
                </Text>
                {hasTasks && (
                  <View style={[styles.dayDot, { backgroundColor: theme.colors.primary }]} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.dayTitleRow}>
        <Text variant="subtitle">{selectedDate === toDateKey(new Date()) ? "Today’s Tasks" : `Tasks • ${selectedDate}`}</Text>
      </View>

      <DraggableFlatList
        data={sortedTasksForSelectedDate}
        keyExtractor={(item) => item.id}
        activationDistance={12}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews
        onDragEnd={async ({ data }) => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setSortMode("custom");
          await saveSortPreference(TASK_SORT_SCOPE, "custom");
          await reorderTasks(data.map((x) => x.id));
          const refreshed = await getAllTasks();
          setTasks(refreshed);
        }}
        ItemSeparatorComponent={() => (
          <View
            style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }}
          />
        )}
        renderItem={({ item, drag, isActive }: RenderItemParams<Task>) => (
          <Pressable
            style={[
              styles.taskRow,
              selectedTask?.id === item.id && {
                borderWidth: 2,
                borderColor: theme.colors.secondary,
                borderRadius: 10,
                paddingHorizontal: 8
              },
              isActive && {
                backgroundColor: theme.colors.card,
                elevation: 6,
                shadowColor: theme.colors.textPrimary,
                shadowOpacity: 0.2,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 }
              }
            ]}
            onLongPress={() => handleTaskLongPress(item)}
            delayLongPress={300}
          >
            <Pressable
              onPress={async () => {
                const updated = await toggleTaskForDate(item, selectedDate);
                upsertTask(updated);
              }}
              style={[
                styles.checkbox,
                {
                  borderColor: theme.colors.primary,
                  backgroundColor:
                    isTaskCompletedForDate(item, selectedDate) ? theme.colors.primary : "transparent"
                }
              ]}
            />
            <View style={styles.taskTextWrapper}>
              <Text
                style={[
                  styles.taskText,
                  isTaskCompletedForDate(item, selectedDate) && {
                    textDecorationLine: "line-through",
                    opacity: 0.6
                  }
                ]}
              >
                {item.text}
              </Text>
              {!!item.repeatDays?.length && (
                <Text muted variant="caption">Repeats: {item.repeatDays.map((d) => WEEKDAYS[d]).join(", ")}</Text>
              )}
              {!item.repeatDays?.length && !!item.scheduledDate && (
                <Text muted variant="caption">Date: {item.scheduledDate}</Text>
              )}
            </View>
            <Pressable
              onPress={async () => {
                const nextPriority = ((item.priority + 1) % 3) as TaskPriority;
                const updated = await updateTaskPriority(item, nextPriority);
                upsertTask(updated);
              }}
              style={styles.priorityPill}
            >
              <View
                style={[
                  styles.priorityBadge,
                  {
                    backgroundColor:
                      item.priority === 0
                        ? theme.colors.priorityLow
                        : item.priority === 1
                        ? theme.colors.priorityMedium
                        : theme.colors.priorityHigh
                  }
                ]}
              >
                <Text style={{ color: theme.colors.onPrimary, fontSize: 10 }}>
                  {item.priority === 0 ? "LOW" : item.priority === 1 ? "MED" : "HIGH"}
                </Text>
              </View>
            </Pressable>
            <Pressable
              onPressIn={(event) => event.stopPropagation()}
              onLongPress={(event) => {
                event.stopPropagation();
                drag();
              }}
              delayLongPress={220}
              hitSlop={8}
              style={styles.dragHandle}
            >
              <Ionicons name="reorder-three-outline" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text muted style={styles.emptyText}>
            No tasks for this day.
          </Text>
        }
      />

      <ContextActionMenu
        visible={showSortMenu}
        title="Sort tasks"
        onClose={() => setShowSortMenu(false)}
        actions={[
          { key: "custom", label: "Custom order", icon: "reorder-three-outline", onPress: async () => {
            setSortMode("custom");
            await saveSortPreference(TASK_SORT_SCOPE, "custom");
          } },
          { key: "recent", label: "Most recent", icon: "time-outline", onPress: async () => {
            setSortMode("recent");
            await saveSortPreference(TASK_SORT_SCOPE, "recent");
          } },
          { key: "az", label: "Name (A-Z)", icon: "text-outline", onPress: async () => {
            setSortMode("name_asc");
            await saveSortPreference(TASK_SORT_SCOPE, "name_asc");
          } },
          { key: "za", label: "Name (Z-A)", icon: "text-outline", onPress: async () => {
            setSortMode("name_desc");
            await saveSortPreference(TASK_SORT_SCOPE, "name_desc");
          } }
        ]}
      />

      <ContextActionMenu
        visible={!!selectedTask}
        title={selectedTask?.text}
        onClose={() => setSelectedTask(null)}
        actions={[
          {
            key: "edit",
            label: "Edit",
            icon: "pencil",
            onPress: () => {
              if (!selectedTask) return;
              openEditModal(selectedTask);
            }
          },
          {
            key: "complete",
            label:
              selectedTask && isTaskCompletedForDate(selectedTask, selectedDate)
                ? "Mark as pending"
                : "Mark as completed",
            icon:
              selectedTask && isTaskCompletedForDate(selectedTask, selectedDate)
                ? "refresh-outline"
                : "checkmark-circle-outline",
            onPress: async () => {
              if (!selectedTask) return;
              const updated = await toggleTaskForDate(selectedTask, selectedDate);
              upsertTask(updated);
            }
          },
          {
            key: "move",
            label: "Move position",
            icon: "swap-vertical-outline",
            onPress: async () => {
              setSortMode("custom");
              await saveSortPreference(TASK_SORT_SCOPE, "custom");
              showToast("Long press reorder icon to move task");
            }
          },
          {
            key: "delete",
            label: "Delete",
            icon: "trash-outline",
            destructive: true,
            onPress: () => {
              if (!selectedTask) return;
              setPendingDeleteTask(selectedTask);
            }
          }
        ]}
      />

      <DeleteConfirmModal
        visible={!!pendingDeleteTask}
        itemLabel="task"
        loading={taskDeleting}
        onCancel={() => {
          if (taskDeleting) return;
          setPendingDeleteTask(null);
        }}
        onConfirm={async () => {
          if (!pendingDeleteTask || taskDeleting) return;
          setTaskDeleting(true);
          try {
            await deleteTask(pendingDeleteTask.id);
            removeTask(pendingDeleteTask.id);
            setPendingDeleteTask(null);
            showToast("Deleted ✓");
          } catch (error) {
            console.error("[task] delete failed", error);
            showToast("Could not delete task", "error");
          } finally {
            setTaskDeleting(false);
          }
        }}
      />

      <Modal transparent visible={showModal} animationType="fade">
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
            <Text variant="subtitle">{editingTask ? "Edit task" : "New task"}</Text>
            <TextInput
              placeholder="Task description"
              placeholderTextColor={theme.colors.textSecondary}
              value={newText}
              onChangeText={setNewText}
              style={[
                styles.newTaskInput,
                {
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary
                }
              ]}
            />
            <Text style={styles.priorityLabel}>Priority</Text>
            <View style={styles.priorityGroup}>
              {([
                { label: "Low", value: 0 },
                { label: "Medium", value: 1 },
                { label: "High", value: 2 }
              ] as const).map((p) => (
                <Pressable
                  key={p.value}
                  onPress={() => setPriority(p.value)}
                  style={[
                    styles.priorityChip,
                    {
                      backgroundColor:
                        priority === p.value ? theme.colors.primary : theme.colors.card,
                      borderColor: theme.colors.border
                    }
                  ]}
                >
                  <Text
                    style={{
                      color: priority === p.value ? theme.colors.onPrimary : theme.colors.textPrimary
                    }}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.priorityLabel}>Schedule date (YYYY-MM-DD)</Text>
            <TextInput
              value={scheduledDate}
              onChangeText={setScheduledDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textSecondary}
              style={[
                styles.newTaskInput,
                {
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary
                }
              ]}
            />

            <View style={styles.scheduleActions}>
              <Pressable
                onPress={() => setScheduledDate(selectedDate)}
                style={[styles.smallAction, { borderColor: theme.colors.border }]}
              >
                <Text muted>Use selected day</Text>
              </Pressable>
              <Pressable
                onPress={() => setScheduledDate("")}
                style={[styles.smallAction, { borderColor: theme.colors.border }]}
              >
                <Text muted>No date</Text>
              </Pressable>
            </View>

            <Text style={styles.priorityLabel}>Repeat on weekdays</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.repeatRow}>
              {WEEKDAYS.map((label, idx) => {
                const active = repeatDays.includes(idx);
                return (
                  <Pressable
                    key={label}
                    onPress={() => {
                      setRepeatDays((prev) =>
                        prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
                      );
                    }}
                    style={[
                      styles.repeatChip,
                      {
                        backgroundColor: active ? theme.colors.primary : theme.colors.card,
                        borderColor: theme.colors.border
                      }
                    ]}
                  >
                    <Text
                      style={{ color: active ? theme.colors.onPrimary : theme.colors.textPrimary }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.actions}>
              <Pressable
                disabled={taskSubmitting}
                onPress={() => {
                  if (taskSubmitting) return;
                  setShowModal(false);
                }}
                style={[styles.secondaryButton, taskSubmitting && styles.disabledButton]}
              >
                <Text muted>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!newText.trim() || taskSubmitting) return;
                  setTaskSubmitting(true);
                  try {
                    if (editingTask) {
                      const updated = await updateTask({
                        ...editingTask,
                        text: newText.trim(),
                        priority,
                        scheduledDate: repeatDays.length ? null : scheduledDate || null,
                        repeatDays
                      });
                      upsertTask(updated);
                      setEditingTask(null);
                    } else {
                      const created = await createTask({
                        text: newText.trim(),
                        priority,
                        scheduledDate: repeatDays.length ? null : scheduledDate || null,
                        repeatDays
                      });
                      upsertTask(created);
                    }
                    setShowModal(false);
                    showToast("Task saved ✓");
                  } catch (error) {
                    console.error("[task] save failed", error);
                    showToast("Could not save task", "error");
                  } finally {
                    setTaskSubmitting(false);
                  }
                }}
                disabled={taskSubmitting}
                style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, taskSubmitting && styles.disabledButton]}
              >
                {taskSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                    <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Saving...</Text>
                  </>
                ) : (
                  <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>
                    {editingTask ? "Save" : "Add"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  sortButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  progressCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 10
  },
  progressFill: {
    height: "100%",
    borderRadius: 999
  },
  progressMeta: {
    marginTop: 6
  },
  calendarCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 10
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  monthArrow: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center"
  },
  weekHeaderRow: {
    flexDirection: "row",
    marginBottom: 4
  },
  weekHeaderLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: 11
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap"
  },
  dayCell: {
    width: "14.285%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 8
  },
  dayDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    marginTop: 4
  },
  dayTitleRow: {
    marginBottom: 8
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    marginRight: 10
  },
  taskTextWrapper: {
    flex: 1
  },
  taskText: {
    fontSize: 14
  },
  priorityPill: {
    paddingHorizontal: 4,
    paddingVertical: 2
  },
  dragHandle: {
    marginLeft: 6,
    paddingHorizontal: 2,
    paddingVertical: 4
  },
  priorityBadge: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2
  },
  emptyText: {
    marginTop: 24,
    textAlign: "center"
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16
  },
  card: {
    width: "100%",
    borderRadius: 16,
    padding: 16
  },
  newTaskInput: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth
  },
  priorityGroup: {
    flexDirection: "row",
    marginTop: 12,
    justifyContent: "space-between"
  },
  priorityChip: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center"
  },
  priorityLabel: {
    marginTop: 12,
    fontSize: 13
  },
  scheduleActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8
  },
  smallAction: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  repeatRow: {
    marginTop: 8,
    gap: 8
  },
  repeatChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  actions: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  secondaryButton: {
    paddingHorizontal: 8,
    paddingVertical: 8
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  disabledButton: {
    opacity: 0.7
  }
});

export default TasksScreen;

