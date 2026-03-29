import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, Modal, ScrollView, LayoutAnimation, ActivityIndicator, TouchableOpacity, Platform, Animated, Share, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useFeedback } from "@components/FeedbackProvider";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { useTheme } from "@hooks/useTheme";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";
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
import type { Task, TaskReminderType } from "@models/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { TabsParamList } from "@navigation/RootNavigator";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { useSelection } from "@hooks/useSelection";

type TasksRoute = RouteProp<TabsParamList, "Tasks">;
type TasksNav = BottomTabNavigationProp<TabsParamList, "Tasks">;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const REMINDER_OPTIONS: Array<{ label: string; value: TaskReminderType }> = [
  { label: "At task time", value: "AT_TIME" },
  { label: "10 minutes before", value: "10_MIN_BEFORE" },
  { label: "1 hour before", value: "1_HOUR_BEFORE" },
  { label: "1 day before", value: "1_DAY_BEFORE" }
];

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

const mergeDateAndTime = (date: Date, time: Date): Date => {
  const next = new Date(date);
  next.setHours(time.getHours());
  next.setMinutes(time.getMinutes());
  next.setSeconds(0, 0);
  return next;
};

const parseDateTime = (dateKey?: string | null, time?: string | null): Date => {
  const now = new Date();
  if (!dateKey) return now;
  const [y, m, d] = dateKey.split("-").map(Number);
  const parsed = new Date(y, (m || 1) - 1, d || 1);
  if (time) {
    const [hh, mm] = time.split(":").map(Number);
    parsed.setHours(Number.isFinite(hh) ? hh : 8, Number.isFinite(mm) ? mm : 0, 0, 0);
  } else {
    parsed.setHours(8, 0, 0, 0);
  }
  return parsed;
};

const formatUiDate = (value: Date): string => {
  return value.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
};

const formatUiTime = (value: Date): string => {
  return value.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const toTimeKey = (date: Date): string => {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
};

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
  const togglePinned = useAppStore((s) => s.togglePinned);

  const [newText, setNewText] = useState("");
  const [priority, setPriority] = useState<TaskPriority>(1);
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [scheduledDate, setScheduledDate] = useState<string>(toDateKey(new Date()));
  const [scheduledAt, setScheduledAt] = useState<Date>(() => {
    const now = new Date();
    now.setHours(8, 0, 0, 0);
    return now;
  });
  const [reminders, setReminders] = useState<TaskReminderType[]>(["AT_TIME"]);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(toDateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState<Date>(new Date());
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [sortMode, setSortMode] = useState<TaskSortMode>("custom");
  const [fabOpen, setFabOpen] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskDeleting, setTaskDeleting] = useState(false);
  const taskSubmittingRef = useRef(false);
  const fabAnim = useRef(new Animated.Value(0)).current;

  // Subtasks state for modal
  const [subtasks, setSubtasks] = useState<Array<{ id: string; text: string }>>([{ id: Date.now().toString(), text: "" }]);

  const addSubtask = () => {
    setSubtasks(prev => [...prev, { id: Date.now().toString() + Math.random(), text: "" }]);
  };

  const updateSubtask = (id: string, text: string) => {
    setSubtasks(prev => prev.map(s => s.id === id ? { ...s, text } : s));
  };

  const removeSubtask = (id: string) => {
    setSubtasks(prev => prev.length > 1 ? prev.filter(s => s.id !== id) : prev);
  };

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
    setScheduledAt(parseDateTime(selectedDate, "08:00"));
    setReminders(["AT_TIME"]);
    setShowDatePicker(false);
    setShowTimePicker(false);
    setSubtasks([{ id: Date.now().toString(), text: "" }]);
    setShowModal(true);
  };

  const openEditModal = (task: Task) => {
    setEditingTask(task);
    setNewText(task.text);
    setPriority((task.priority as TaskPriority) ?? 1);
    setRepeatDays(task.repeatDays ?? []);
    setScheduledDate(task.scheduledDate ?? selectedDate);
    setScheduledAt(parseDateTime(task.scheduledDate ?? selectedDate, task.scheduledTime));
    setReminders(((task.reminders?.length ? task.reminders : ["AT_TIME"]) as TaskReminderType[]).slice(0, 4));
    setShowDatePicker(false);
    setShowTimePicker(false);
    setSubtasks([{ id: Date.now().toString(), text: "" }]); // reset subtasks on edit
    setShowModal(true);
  };

  const {
    selectedItems,
    selectionCount,
    selectionMode,
    isSelected,
    toggleSelection,
    startSelection,
    clearSelection,
    selectAllVisible
  } = useSelection(
    sortedTasksForSelectedDate.map((task) => ({ kind: "task" as const, id: task.id, label: task.text })),
    {
      getKey: (item) => `${item.kind}:${item.id}`,
      onSelectionStart: () => showToast("Modo de seleção ativado")
    }
  );

  const handleClearSelection = useCallback(() => {
    clearSelection();
    setShowSelectionMenu(false);
  }, [clearSelection]);

  const handlePinSelected = useCallback(async () => {
    for (const item of selectedItems) {
      togglePinned("task", item.id);
    }
    showToast("Pins atualizados");
  }, [selectedItems, showToast, togglePinned]);

  const handleEditSelected = useCallback(() => {
    if (selectedItems.length !== 1) return;
    const task = tasksMap[selectedItems[0].id];
    if (!task) return;
    openEditModal(task);
  }, [selectedItems, tasksMap]);

  const handleShareSelected = useCallback(async () => {
    if (!selectedItems.length) return;
    await Share.share({
      title: selectedItems.length === 1 ? selectedItems[0].label : `${selectedItems.length} tarefas`,
      message: selectedItems.map((item) => `Tarefa: ${item.label}`).join("\n")
    });
  }, [selectedItems]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedItems.length) return;
    Alert.alert(
      "Apagar tarefas",
      selectedItems.length === 1 ? "Deseja apagar a tarefa selecionada?" : `Deseja apagar ${selectedItems.length} tarefas selecionadas?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: async () => {
            for (const item of selectedItems) {
              await deleteTask(item.id);
              removeTask(item.id);
            }
            handleClearSelection();
            showToast(selectedItems.length === 1 ? "Tarefa apagada" : `${selectedItems.length} tarefas apagadas`);
          }
        }
      ]
    );
  }, [handleClearSelection, removeTask, selectedItems, showToast]);

  const openFab = useCallback(() => {
    setFabOpen(true);
    Animated.spring(fabAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 24,
      bounciness: 6
    }).start();
  }, [fabAnim]);

  const closeFab = useCallback(() => {
    Animated.timing(fabAnim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true
    }).start(({ finished }) => {
      if (finished) setFabOpen(false);
    });
  }, [fabAnim]);

  const toggleFab = useCallback(() => {
    if (fabOpen) {
      closeFab();
    } else {
      openFab();
    }
  }, [closeFab, fabOpen, openFab]);

  return (
    <Screen>
      <DraggableFlatList
        data={sortedTasksForSelectedDate}
        keyExtractor={(item) => item.id.toString()}
        activationDistance={12}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews={false}
        style={styles.taskList}
        contentContainerStyle={styles.screenScrollContent}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              {selectionMode ? (
                <View style={[styles.selectionBar, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
                  <Pressable onPress={handleClearSelection} style={styles.selectionTopAction} hitSlop={8}>
                    <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
                  </Pressable>
                  <Text style={[styles.selectionCount, { color: theme.colors.textPrimary }]}>
                    {selectionCount}
                  </Text>
                  <View style={styles.selectionActions}>
                    <Pressable onPress={handleShareSelected} style={styles.selectionActionBtn} hitSlop={8}>
                      <Ionicons name="share-social-outline" size={18} color={theme.colors.textPrimary} />
                    </Pressable>
                    <Pressable onPress={handleDeleteSelected} style={styles.selectionActionBtn} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                    </Pressable>
                    {selectionCount === 1 && (
                      <Pressable onPress={handleEditSelected} style={styles.selectionActionBtn} hitSlop={8}>
                        <Ionicons name="pencil-outline" size={18} color={theme.colors.textPrimary} />
                      </Pressable>
                    )}
                    <Pressable onPress={() => setShowSelectionMenu(true)} style={styles.selectionActionBtn} hitSlop={8}>
                      <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textPrimary} />
                    </Pressable>
                  </View>
                </View>
              ) : (
                <>
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
                  </View>
                </>
              )}
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
          </>
        }
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
              isSelected({ kind: "task", id: item.id, label: item.text }) && {
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
            onPress={() => {
              if (!selectionMode) return;
              toggleSelection({ kind: "task", id: item.id, label: item.text });
            }}
            onLongPress={() => startSelection({ kind: "task", id: item.id, label: item.text })}
            delayLongPress={300}
          >
            <Pressable
              onPress={async () => {
                if (selectionMode) {
                  toggleSelection({ kind: "task", id: item.id, label: item.text });
                  return;
                }
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
                <Text muted variant="caption">
                  Date: {item.scheduledDate}
                  {item.scheduledTime ? ` • ${item.scheduledTime}` : ""}
                </Text>
              )}
            </View>
            <Pressable
              onPress={async () => {
                if (selectionMode) {
                  toggleSelection({ kind: "task", id: item.id, label: item.text });
                  return;
                }
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
        visible={showSelectionMenu}
        title="Ações secundárias"
        onClose={() => setShowSelectionMenu(false)}
        actions={[
          {
            key: "pin",
            label: "Pinar",
            icon: "pin-outline",
            onPress: handlePinSelected
          },
          {
            key: "duplicate",
            label: "Duplicar / Copiar",
            icon: "copy-outline",
            onPress: () => showToast("Duplicação em breve")
          },
          {
            key: "move",
            label: "Mover",
            icon: "folder-open-outline",
            onPress: () => showToast("Mover em breve")
          },
          {
            key: "archive",
            label: "Arquivar / Desarquivar",
            icon: "archive-outline",
            onPress: () => showToast("Arquivo em breve")
          },
          {
            key: "tag",
            label: "Tag / Label",
            icon: "pricetag-outline",
            onPress: () => showToast("Tags em breve")
          },
          {
            key: "edit",
            label: "Editar",
            icon: "pencil-outline",
            onPress: () => {
              if (selectionCount !== 1) {
                showToast("Selecione apenas 1 tarefa para editar");
                return;
              }
              handleEditSelected();
            }
          },
          {
            key: "selectAll",
            label: "Selecionar tudo",
            icon: "checkmark-done-outline",
            onPress: selectAllVisible
          },
          {
            key: "clear",
            label: "Desmarcar tudo",
            icon: "close-circle-outline",
            onPress: handleClearSelection
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

      <Modal transparent visible={showModal} animationType="fade" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalKeyboardAvoid}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
        >
          <View style={styles.backdrop}>
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                  shadowColor: "#000"
                }
              ]}
            >
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.modalScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text variant="subtitle">{editingTask ? "Editar tarefa" : "Nova tarefa"}</Text>

            <TextInput
              autoFocus
              placeholder="Nova tarefa..."
              placeholderTextColor={theme.colors.textSecondary}
              value={newText}
              onChangeText={setNewText}
              style={[
                styles.newTaskInput,
                {
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                  backgroundColor: theme.colors.background
                }
              ]}
            />

            <View style={styles.dateTimeRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setShowTimePicker(false);
                  setShowDatePicker(true);
                }}
                style={[styles.dateTimeButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
              >
                <Text muted variant="caption">Data</Text>
                <Text>{scheduledDate ? formatUiDate(parseDateTime(scheduledDate, toTimeKey(scheduledAt))) : "Selecionar data"}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setShowDatePicker(false);
                  setShowTimePicker(true);
                }}
                style={[styles.dateTimeButton, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
              >
                <Text muted variant="caption">Hora</Text>
                <Text>{scheduledDate ? formatUiTime(scheduledAt) : "Selecionar hora"}</Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={scheduledAt}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event: DateTimePickerEvent, selected) => {
                  if (event.type === "dismissed") {
                    setShowDatePicker(false);
                    return;
                  }
                  const next = selected ?? scheduledAt;
                  setScheduledAt((prev) => mergeDateAndTime(next, prev));
                  setScheduledDate(toDateKey(next));
                  if (Platform.OS !== "ios") {
                    setShowDatePicker(false);
                  }
                }}
              />
            )}

            {showTimePicker && (
              <DateTimePicker
                value={scheduledAt}
                mode="time"
                is24Hour
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event: DateTimePickerEvent, selected) => {
                  if (event.type === "dismissed") {
                    setShowTimePicker(false);
                    return;
                  }
                  const time = selected ?? scheduledAt;
                  setScheduledAt((prev) => mergeDateAndTime(prev, time));
                  if (Platform.OS !== "ios") {
                    setShowTimePicker(false);
                  }
                }}
              />
            )}

              {/* Subtasks section — only shown when creating (not editing) */}
              {!editingTask && (
                <View style={{ marginTop: 16, marginBottom: 12, gap: 4 }}>
                  <Text muted variant="caption" style={{ marginBottom: 6 }}>Subtarefas</Text>
                  {subtasks.map((sub, index) => (
                    <View key={sub.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <TextInput
                        value={sub.text}
                        onChangeText={(text) => updateSubtask(sub.id, text)}
                        placeholder={`Subtarefa ${index + 1}`}
                        placeholderTextColor={theme.colors.textSecondary}
                        style={{
                          flex: 1,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderColor: theme.colors.border,
                          paddingVertical: 6,
                          fontSize: 14,
                          color: theme.colors.textPrimary,
                        }}
                      />
                      {subtasks.length > 1 && (
                        <Pressable hitSlop={8} onPress={() => removeSubtask(sub.id)}>
                          <Ionicons name="close-circle-outline" size={18} color={theme.colors.textSecondary} />
                        </Pressable>
                      )}
                    </View>
                  ))}
                  <Pressable
                    onPress={addSubtask}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={theme.colors.primary} />
                    <Text style={{ color: theme.colors.primary, fontSize: 14, fontWeight: "500" }}>+ Adicionar subtarefa</Text>
                  </Pressable>
                </View>
              )}

                <Text style={styles.priorityLabel}>Reminders</Text>
                <View style={styles.remindersGroup}>
                  {REMINDER_OPTIONS.map((option) => {
                    const active = reminders.includes(option.value);
                    return (
                      <Pressable
                        key={option.value}
                        onPress={() => {
                          setReminders((prev) => {
                            if (prev.includes(option.value)) {
                              return prev.filter((value) => value !== option.value);
                            }
                            if (prev.length >= 4) {
                              return prev;
                            }
                            return [...prev, option.value];
                          });
                        }}
                        style={[styles.reminderOption, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
                      >
                        <Ionicons
                          name={active ? "checkbox" : "square-outline"}
                          size={18}
                          color={active ? theme.colors.primary : theme.colors.textSecondary}
                        />
                        <Text>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>

              <View style={styles.actions}>
              <Pressable
                disabled={taskSubmitting}
                onPress={() => {
                  if (taskSubmitting) return;
                  setShowModal(false);
                }}
                style={[styles.secondaryButton, taskSubmitting && styles.disabledButton]}
              >
                <Text muted>Cancelar</Text>
              </Pressable>

                  <TouchableOpacity
                activeOpacity={0.9}
                onPress={async () => {
                  // Validate title before any action
                  const trimmedText = newText.trim();
                  if (!trimmedText) {
                    showToast("Task title cannot be empty", "error");
                    return;
                  }

                  // Prevent duplicate submissions
                  if (taskSubmittingRef.current || taskSubmitting) return;
                  
                  taskSubmittingRef.current = true;
                  setTaskSubmitting(true);
                  console.log("[task] Creating task:", trimmedText);
                  
                  try {
                    const dateForTask = repeatDays.length ? null : scheduledDate || null;
                    const timeForTask = dateForTask ? toTimeKey(scheduledAt) : null;
                    
                    if (editingTask) {
                      const updated = await updateTask({
                        ...editingTask,
                        text: trimmedText,
                        priority,
                        scheduledDate: dateForTask,
                        scheduledTime: timeForTask,
                        repeatDays,
                        reminders
                      });
                      upsertTask(updated);
                      setEditingTask(null);
                    } else {
                      const created = await createTask({
                        text: trimmedText,
                        priority,
                        scheduledDate: dateForTask,
                        scheduledTime: timeForTask,
                        repeatDays,
                        reminders
                      });
                      console.log("[task] Task created successfully:", created.id);
                      upsertTask(created);

                      // Create subtasks linked to parent
                      const validSubtasks = subtasks.filter(s => s.text.trim().length > 0);
                      for (const sub of validSubtasks) {
                        const createdSub = await createTask({
                          text: sub.text.trim(),
                          parentId: created.id,
                          scheduledDate: dateForTask,
                        });
                        upsertTask(createdSub);
                      }
                    }
                    setShowModal(false);
                    showToast("Task salva ✓");
                  } catch (error) {
                    console.error("[task] save failed", error);
                    showToast("Não foi possível salvar", "error");
                  } finally {
                    taskSubmittingRef.current = false;
                    setTaskSubmitting(false);
                  }
                }}
                disabled={taskSubmitting}
                style={[
                  styles.primaryCreateButton,
                  { backgroundColor: theme.colors.primary },
                  taskSubmitting && styles.disabledButton
                ]}
              >
                {taskSubmitting ? (
                  <>
                    <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                    <Text style={{ color: theme.colors.onPrimary, fontWeight: "700" }}>Salvando...</Text>
                  </>
                ) : (
                  <Text style={{ color: theme.colors.onPrimary, fontWeight: "700" }}>
                    {editingTask ? "Salvar" : "Criar Task"}
                  </Text>
                )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {fabOpen && <Pressable style={styles.fabBackdrop} onPress={closeFab} />}

      <View style={styles.fabRoot} pointerEvents="box-none">
        <Animated.View
          pointerEvents={fabOpen ? "auto" : "none"}
          style={[
            styles.fabMenuItemWrap,
            {
              transform: [
                {
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -58]
                  })
                },
                {
                  scale: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.84, 1]
                  })
                }
              ],
              opacity: fabAnim
            }
          ]}
        >
          <Pressable
            onPress={() => {
              closeFab();
              openCreateModal();
            }}
            style={[
              styles.fabMenuItem,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border
              }
            ]}
          >
            <Ionicons name="checkmark-done-outline" size={16} color={theme.colors.primary} />
            <Text style={[styles.fabMenuLabel, { color: theme.colors.textPrimary }]}>Create Task</Text>
          </Pressable>
        </Animated.View>

        <Pressable
          onPress={toggleFab}
          style={[
            styles.fabMain,
            {
              backgroundColor: theme.colors.primary,
              shadowColor: theme.colors.textPrimary
            }
          ]}
        >
          <Animated.View
            style={{
              transform: [
                {
                  rotate: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["0deg", "45deg"]
                  })
                }
              ]
            }}
          >
            <Ionicons name="add" size={24} color={theme.colors.onPrimary} />
          </Animated.View>
        </Pressable>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  modalKeyboardAvoid: {
    flex: 1
  },
  screenScroll: {
    flex: 1
  },
  screenScrollContent: {
    paddingBottom: 120
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  selectionBar: {
    width: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center"
  },
  selectionTopAction: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center"
  },
  selectionCount: {
    flex: 1,
    marginLeft: 4,
    fontSize: 15,
    fontWeight: "700"
  },
  selectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  selectionActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center"
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
  taskList: {
    width: "100%"
  },
  taskListContent: {
    paddingBottom: 8
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
  modalScroll: {
    width: "100%"
  },
  modalScrollContent: {
    paddingBottom: 8
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
    justifyContent: "flex-end",
    paddingHorizontal: 14,
    paddingBottom: 18
  },
  card: {
    width: "100%",
    maxHeight: "88%",
    borderRadius: 22,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10
  },
  newTaskInput: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 18
  },
  dateTimeRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 10
  },
  dateTimeButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 2
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
  remindersGroup: {
    marginTop: 8,
    gap: 8
  },
  reminderOption: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
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
  primaryCreateButton: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minWidth: 132
  },
  disabledButton: {
    opacity: 0.7
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)"
  },
  fabRoot: {
    position: "absolute",
    right: 20,
    bottom: 90,
    zIndex: 999,
    elevation: 10
  },
  fabMenuItemWrap: {
    position: "absolute",
    right: 0,
    bottom: 0
  },
  fabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 148
  },
  fabMenuLabel: {
    fontSize: 13,
    fontWeight: "600"
  },
  fabMain: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 10
  }
});

export default TasksScreen;

