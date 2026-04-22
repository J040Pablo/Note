import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, TextInput, Modal, ScrollView, LayoutAnimation, UIManager, ActivityIndicator, TouchableOpacity, Platform, Animated, Share, Alert } from "react-native";
import { KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useFeedback } from "@components/FeedbackProvider";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { DeleteConfirmModal } from "@components/DeleteConfirmModal";
import { SelectionIndicator } from "@components/SelectionIndicator";
import { useTheme } from "@hooks/useTheme";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";
import {
  createTask,
  deleteTask,
  getAllTasks,
  isTaskCompletedForDate,
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
import {
  areNotificationsAvailable,
  getScheduledNotifications,
  logScheduledNotificationsDetailed,
  requestNotificationPermission,
  scheduleTestNotification
} from "@services/notificationService";
import { Ionicons } from "@expo/vector-icons";
import type { Task, TaskReminderType } from "@models/types";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { TabsParamList } from "@navigation/RootNavigator";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import DraggableFlatList, { type RenderItemParams } from "react-native-draggable-flatlist";
import { useGlobalSelection } from "@hooks/useGlobalSelection";
import { useItemActions } from "@hooks/useItemActions";
import { useUnifiedItems } from "@hooks/useUnifiedItems";
import { FloatingButton } from "@components/FloatingButton";
import { log, warn, error as logError } from '@utils/logger';

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
const TOP_PADDING_DEFAULT = 24;
const TOP_PADDING_WITH_SELECTION = 80;

const TasksScreen: React.FC = () => {


  const { theme } = useTheme();
  const route = useRoute<TasksRoute>();
  const navigation = useNavigation<TasksNav>();
  const insets = useSafeAreaInsets();
  const { showToast } = useFeedback();
  const actions = useItemActions();
  const tasksMap = useTasksStore((s) => s.tasks);
  const setTasks = useTasksStore((s) => s.setTasks);
  const upsertTask = useTasksStore((s) => s.upsertTask);
  const removeTask = useTasksStore((s) => s.removeTask);
  const pinnedItems = useAppStore((s) => s.pinnedItems);

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
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const taskSubmittingRef = useRef(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOrderRef = useRef<string[]>([]);
  const taskAnimationsRef = useRef<Map<string, { scale: Animated.Value; opacity: Animated.Value }>>(new Map());

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

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

  const now = new Date();
  const todayKey = toDateKey(now);
  const currentTime = toTimeKey(now);

  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

  const getTaskStatus = useCallback((task: Task, dateKey: string) => {
    const isDirectlyDone = isTaskCompletedForDate(task, dateKey);
    const childTasks = tasks.filter(t => t.parentId === task.id);
    const subtasks = childTasks.filter(st => !st.scheduledDate || st.scheduledDate === dateKey);
    
    if (subtasks.length > 0) {
      const completedCount = subtasks.filter(st => st.completed || isTaskCompletedForDate(st, dateKey)).length;
      const total = subtasks.length;
      const progress = total === 0 ? 0 : completedCount / total;
      const isCompleted = completedCount === total;
      return { isCompleted, progress, completedCount, total, subtasks };
    }

    return { 
      isCompleted: isDirectlyDone, 
      progress: isDirectlyDone ? 1 : 0, 
      completedCount: isDirectlyDone ? 1 : 0, 
      total: 0, 
      subtasks: [] 
    };
  }, [tasks]);

  const isExpired = useCallback((task: Task) => {
    if (task.parentId || !task.scheduledDate) return false;
    const { isCompleted } = getTaskStatus(task, task.scheduledDate);
    if (isCompleted) return false;
    if (task.scheduledDate < todayKey) return true;
    if (task.scheduledDate === todayKey && task.scheduledTime && task.scheduledTime < currentTime) return true;
    return false;
  }, [todayKey, currentTime, getTaskStatus]);

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
    return () => {
      if (reorderTimerRef.current) {
        clearTimeout(reorderTimerRef.current);
      }
    };
  }, []);

  // Handle route params
  useEffect(() => {
    const { dateKey, openCreate, focusTaskId } = route.params || {};

    if (openCreate) {
      openCreateModal();
      navigation.setParams({ openCreate: undefined });
    }

    if (dateKey) {
      setSelectedDate(dateKey);
      navigation.setParams({ dateKey: undefined });
    } else if (focusTaskId) {
      const task = tasksMap[focusTaskId];
      if (task) {
        if (task.scheduledDate) setSelectedDate(task.scheduledDate);
        navigation.setParams({ focusTaskId: undefined });
      }
    }
  }, [route.params, tasksMap, navigation]);

  const monthCells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  const { tasks: unifiedTasks, selectableItems: unifiedSelectableItems } = useUnifiedItems({ scope: "root" });

  const expiredTasks = useMemo(() => {
    return tasks
      .filter(isExpired)
      .map(root => {
        const status = getTaskStatus(root, root.scheduledDate!);
        return { ...root, ...status, parentCompleted: status.isCompleted };
      });
  }, [tasks, isExpired, getTaskStatus]);

  // Only root tasks (no parentId) appear in the list — subtasks render inside their parent card
  const rootTasksForDate = useMemo(
    () => unifiedTasks.filter((task) => shouldAppearOnDate(task, selectedDate) && !isExpired(task)),
    [selectedDate, unifiedTasks, isExpired]
  );

  const sortedRootTasks = useMemo(() => {
    let sortedList = [...rootTasksForDate];
    if (sortMode === "name_asc") sortedList.sort((a, b) => a.text.localeCompare(b.text));
    else if (sortMode === "name_desc") sortedList.sort((a, b) => b.text.localeCompare(a.text));
    else if (sortMode === "recent") {
      sortedList.sort((a, b) => {
        const ad = a.scheduledDate ? Number(a.scheduledDate.replace(/-/g, "")) : 0;
        const bd = b.scheduledDate ? Number(b.scheduledDate.replace(/-/g, "")) : 0;
        if (bd !== ad) return bd - ad;
        return Number(b.id) - Number(a.id);
      });
    } else {
      sortedList.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    }
    
    const taskPins = pinnedItems.filter(p => p.type === "task").map(p => p.id);
    return sortedList.sort((a, b) => {
      const aPinned = taskPins.includes(a.id);
      const bPinned = taskPins.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      return 0;
    });
  }, [sortMode, rootTasksForDate, pinnedItems]);

  // Enrich each root task with its subtasks + progress (mirrors HomeScreen rootTasks)
  const enrichedTasks = useMemo(() => {
    const taskPins = pinnedItems.filter(p => p.type === "task").map(p => p.id);
    return sortedRootTasks.map(root => {
      const status = getTaskStatus(root, selectedDate);
      const isPinned = taskPins.includes(root.id);
      return { ...root, ...status, parentCompleted: status.isCompleted, isPinned };
    });
  }, [sortedRootTasks, selectedDate, pinnedItems, getTaskStatus]);



  // Progress card counts root-level completion
  const completedToday = useMemo(
    () => enrichedTasks.filter(t => t.parentCompleted).length,
    [enrichedTasks]
  );

  const progressPct =
    enrichedTasks.length === 0 ? 0 : Math.round((completedToday / enrichedTasks.length) * 100);

  // Keep tasksForSelectedDate for calendar dot logic (includes subtasks intentionally)
  const tasksForSelectedDate = useMemo(
    () => tasks.filter((task) => shouldAppearOnDate(task, selectedDate)),
    [selectedDate, tasks]
  );

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
    
    // reset subtasks on edit, but load existing ones
    const existingSubtasks = Object.values(tasksMap).filter(t => t.parentId === task.id);
    if (existingSubtasks.length > 0) {
      setSubtasks(existingSubtasks.map(st => ({ id: st.id, text: st.text })));
    } else {
      setSubtasks([{ id: Date.now().toString(), text: "" }]); 
    }
    
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
  } = useGlobalSelection(unifiedSelectableItems, {
    onSelectionStart: () => showToast("Modo de seleção ativado")
  });

  const topContentPadding = selectionMode ? TOP_PADDING_WITH_SELECTION : TOP_PADDING_DEFAULT;

  const handleClearSelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    clearSelection();
    setShowSelectionMenu(false);
  }, [clearSelection]);

  const handlePinSelected = useCallback(async () => {
    const items = selectedItems;
    try {
      for (const item of items) {
        await actions.pin(item);
      }
      showToast("Pins atualizados");
    } finally {
      handleClearSelection();
    }
  }, [actions, handleClearSelection, selectedItems, showToast]);

  const handleEditSelected = useCallback(() => {
    if (selectedItems.length !== 1) return;
    const task = tasksMap[selectedItems[0].id];
    if (!task) return;
    handleClearSelection();
    openEditModal(task);
  }, [handleClearSelection, selectedItems, tasksMap]);

  const handleShareSelected = useCallback(async () => {
    const items = selectedItems;
    if (!items.length) return;
    try {
      await Share.share({
        title: items.length === 1 ? items[0].label : `${items.length} tarefas`,
        message: items.map((item) => `Tarefa: ${item.label}`).join("\n")
      });
    } finally {
      handleClearSelection();
    }
  }, [handleClearSelection, selectedItems]);

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
              await actions.delete(item);
            }
            handleClearSelection();
            showToast(selectedItems.length === 1 ? "Tarefa apagada" : `${selectedItems.length} tarefas apagadas`);
          }
        }
      ]
    );
  }, [actions, handleClearSelection, selectedItems, showToast]);

  const ensureTaskSelectedForDrag = useCallback(
    (task: { id: string; parentId?: string | null; text: string }) => {
      const item = { kind: "task" as const, id: task.id, parentId: task.parentId ?? null, label: task.text };
      if (selectionMode) {
        if (!isSelected(item)) {
          toggleSelection(item);
        }
        return;
      }
      startSelection(item);
    },
    [isSelected, selectionMode, startSelection, toggleSelection]
  );

  const startTaskDrag = useCallback(
    (drag: () => void) => {
      if (sortMode !== "custom") {
        showToast("Use ordenação: Custom order para reordenar");
        return;
      }
      setShowSelectionMenu(false);
      drag();
    },
    [showToast, sortMode]
  );

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

  const runNotificationDevValidation = useCallback(async () => {
    if (!__DEV__) return;

    try {
      log("[NOTIF][SCHEDULE] DEV validation started");
      const testId = await scheduleTestNotification();
      log(`[NOTIF][SCHEDULE] Test notification id=${String(testId)}`);

      const now = new Date();
      const plus15 = new Date(now.getTime() + 15 * 60 * 1000);
      const testTask = await createTask({
        text: `[DEV] Notification validation ${plus15.toLocaleTimeString()}`,
        priority: 1,
        scheduledDate: toDateKey(plus15),
        scheduledTime: toTimeKey(plus15),
        reminders: ["AT_TIME", "10_MIN_BEFORE", "1_HOUR_BEFORE"]
      });

      log(
        `[NOTIF][SCHEDULE] DEV task created id=${testTask.id} notificationIds=${JSON.stringify(testTask.notificationIds ?? [])}`
      );

      const allScheduled = await getScheduledNotifications();
      log(`[NOTIF][SCHEDULE] Total scheduled after DEV validation: ${allScheduled.length}`);
      await logScheduledNotificationsDetailed();
      upsertTask(testTask);
      showToast("DEV notif validation triggered");
    } catch (error) {
      logError("[NOTIF][SCHEDULE] DEV validation failed", error);
      showToast("DEV notif validation failed", "error");
    }
  }, [showToast, upsertTask]);

  return (
    <Screen>
      <DraggableFlatList
        data={enrichedTasks}
        keyExtractor={(item) => item.id.toString()}
        activationDistance={12}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={9}
        removeClippedSubviews={false}
        style={styles.taskList}
        contentContainerStyle={[styles.screenScrollContent, { paddingTop: 16 }]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            <View style={styles.headerRow}>
              <>
                <View>
                  <Text variant="title">Tasks</Text>
                  <Text muted>Daily productivity</Text>
                </View>
                <View style={styles.headerActions}>
                  {__DEV__ && (
                    <Pressable
                      onPress={runNotificationDevValidation}
                      style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                    >
                      <Ionicons name="bug-outline" size={16} color={theme.colors.primary} />
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => setShowSortMenu(true)}
                    style={[styles.sortButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                  >
                    <Ionicons name="funnel-outline" size={16} color={theme.colors.textPrimary} />
                  </Pressable>
                </View>
              </>

              {selectionMode && (
                <View style={[styles.selectionBar, styles.selectionBarOverlay, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
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
              )}
            </View>

            <View style={[styles.progressCard, { backgroundColor: theme.colors.card }]}>
              <View style={styles.progressHeader}>
                <Text variant="subtitle">Today&apos;s progress</Text>
                <Text muted>
                  {completedToday} / {enrichedTasks.length}
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
                  const isDaySelected = key === selectedDate;
                  const inMonth = sameMonth(day, monthCursor);
                  const hasTasks = dayHasTasks.has(key);

                  return (
                    <Pressable
                      key={key}
                      onPress={() => setSelectedDate(key)}
                      style={[
                        styles.dayCell,
                        isDaySelected && { backgroundColor: theme.colors.primaryAlpha20 }
                      ]}
                    >
                      <Text
                        style={{
                          color: isDaySelected
                            ? theme.colors.primary
                            : inMonth
                            ? theme.colors.textPrimary
                            : theme.colors.textSecondary,
                          fontWeight: isDaySelected ? "700" : "400"
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

            {expiredTasks.length > 0 && (
              <View style={{ marginBottom: 24 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Ionicons name="time-outline" size={20} color={theme.colors.danger} />
                  <Text variant="subtitle" style={{ color: theme.colors.danger }}>Expired Tasks</Text>
                </View>
                <View style={{ gap: 10 }}>
                  {expiredTasks.map(root => {
                    const isExpanded = expandedTaskId === root.id;
                    const taskSelected = isSelected({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });

                    return (
                      <View
                        key={root.id}
                        style={[
                          styles.taskCard,
                          {
                            backgroundColor: theme.colors.card,
                            borderColor: taskSelected ? theme.colors.primary : theme.colors.danger + "40",
                            borderWidth: 2,
                          }
                        ]}
                      >
                        <Pressable
                          android_ripple={{ color: theme.colors.primaryAlpha20 }}
                          style={{ padding: 14 }}
                          onPress={() => {
                            if (selectionMode) {
                              toggleSelection({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });
                              return;
                            }
                            LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                            setExpandedTaskId(prev => prev === root.id ? null : root.id);
                          }}
                          onLongPress={() => {
                            if (selectionMode) {
                              toggleSelection({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });
                              return;
                            }
                            startSelection({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });
                          }}
                          delayLongPress={280}
                        >
                          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: root.total > 0 ? 8 : 0 }}>
                            <Pressable
                              hitSlop={8}
                              onPress={async () => {
                                if (root.total > 0) {
                                  if (root.parentCompleted) return;
                                  if (root.completedCount < root.total) {
                                    showToast("Conclua as subtarefas primeiro");
                                    return;
                                  }
                                }
                                LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                                try {
                                  const updated = await toggleTaskForDate(root, root.scheduledDate!);
                                  upsertTask(updated);
                                } catch (e) {
                                  logError("[TasksScreen] toggle expired task failed", e);
                                }
                              }}
                            >
                              <Ionicons
                                name={root.parentCompleted ? "checkmark-circle" : "ellipse-outline"}
                                size={22}
                                color={root.parentCompleted ? theme.colors.primary : theme.colors.textSecondary}
                              />
                            </Pressable>

                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontSize: 16,
                                fontWeight: "500",
                                marginHorizontal: 8,
                                color: root.parentCompleted ? theme.colors.textSecondary : theme.colors.textPrimary,
                                textDecorationLine: root.parentCompleted ? "line-through" : "none"
                              }}
                            >
                              {root.text}
                            </Text>

                            <View style={{ backgroundColor: theme.colors.danger + "20", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginRight: 8 }}>
                              <Text style={{ fontSize: 10, color: theme.colors.danger, fontWeight: "700" }}>EXPIRED</Text>
                            </View>

                            <Pressable
                              hitSlop={8}
                              onPress={async () => {
                                const nextPriority = ((root.priority + 1) % 3) as TaskPriority;
                                const updated = await updateTaskPriority(root, nextPriority);
                                upsertTask(updated);
                              }}
                              style={{ marginRight: 8 }}
                            >
                              <View
                                style={[
                                  styles.priorityBadge,
                                  {
                                    backgroundColor:
                                      root.priority === 0
                                        ? theme.colors.priorityLow
                                        : root.priority === 1
                                        ? theme.colors.priorityMedium
                                        : theme.colors.priorityHigh
                                  }
                                ]}
                              >
                                <Text style={{ color: theme.colors.onPrimary, fontSize: 10 }}>
                                  {root.priority === 0 ? "LOW" : root.priority === 1 ? "MED" : "HIGH"}
                                </Text>
                              </View>
                            </Pressable>

                            {root.total > 0 && (
                              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.textSecondary} />
                            )}
                          </View>

                          {root.total > 0 && (
                            <>
                              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{root.completedCount}/{root.total} done</Text>
                                <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{Math.round(root.progress * 100)}%</Text>
                              </View>
                              <View style={{ height: 5, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                                <View style={{ height: "100%", borderRadius: 3, width: `${root.progress * 100}%`, backgroundColor: root.progress === 1 ? theme.colors.primary : (theme.colors.secondary || theme.colors.primary) }} />
                              </View>
                            </>
                          )}

                          {root.total === 0 && (
                            <Text muted variant="caption" style={{ marginTop: 2, color: theme.colors.danger }}>
                              {root.scheduledDate}{root.scheduledTime ? ` • ${root.scheduledTime}` : ""}
                            </Text>
                          )}
                        </Pressable>

                        {isExpanded && root.total > 0 && (
                          <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, gap: 4 }}>
                            {root.subtasks.map((subtask: Task) => {
                              const subDone = subtask.completed || isTaskCompletedForDate(subtask, root.scheduledDate!);
                              return (
                                <Pressable
                                  key={subtask.id}
                                  android_ripple={{ color: theme.colors.primaryAlpha20 }}
                                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}
                                  onPress={async () => {
                                    LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                                    try {
                                      const updated = await toggleTaskForDate(subtask, root.scheduledDate!);
                                      upsertTask(updated);
                                    } catch (e) {
                                      logError("[TasksScreen] toggle expired subtask failed", e);
                                    }
                                  }}
                                >
                                  <Ionicons
                                    name={subDone ? "checkmark-circle" : "ellipse-outline"}
                                    size={18}
                                    color={subDone ? theme.colors.primary : theme.colors.textSecondary}
                                  />
                                  <Text
                                    style={{
                                      flex: 1,
                                      fontSize: 14,
                                      color: subDone ? theme.colors.textSecondary : theme.colors.textPrimary,
                                      textDecorationLine: subDone ? "line-through" : "none"
                                    }}
                                  >
                                    {subtask.text}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        )}

                        <SelectionIndicator visible={taskSelected} />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            <View style={styles.dayTitleRow}>
              <Text variant="subtitle">{selectedDate === toDateKey(new Date()) ? "Today's Tasks" : `Tasks • ${selectedDate}`}</Text>
            </View>
          </>
        }
        onDragEnd={({ data }) => {
          const orderedIds = data.map((x) => x.id);
          setSortMode("custom");
          saveSortPreference(TASK_SORT_SCOPE, "custom");
          actions.reorder({ kind: "task", parentId: null, orderedIds }).catch((error) => {
            logError("[tasks] reorder persist failed", error);
            showToast("Não foi possível salvar a ordem", "error");
          });
        }}
        ItemSeparatorComponent={() => (
          <View style={{ height: 10 }} />
        )}
        renderItem={({ item: root, drag, isActive }: RenderItemParams<typeof enrichedTasks[number]>) => {
          const isExpanded = expandedTaskId === root.id;
          const taskSelected = isSelected({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });

          // Get or create animated values for this task
          const getAnimations = () => {
            if (!taskAnimationsRef.current.has(root.id)) {
              taskAnimationsRef.current.set(root.id, {
                scale: new Animated.Value(1),
                opacity: new Animated.Value(1)
              });
            }
            return taskAnimationsRef.current.get(root.id)!;
          };

          const animations = getAnimations();

          // Animate task completion: scale 1→0.92→1.05→1 + opacity fade
          const animateCompletion = () => {
            Animated.parallel([
              Animated.sequence([
                Animated.timing(animations.scale, {
                  toValue: 0.92,
                  duration: 100,
                  useNativeDriver: false
                }),
                Animated.timing(animations.scale, {
                  toValue: 1.05,
                  duration: 100,
                  useNativeDriver: false
                }),
                Animated.timing(animations.scale, {
                  toValue: 1,
                  duration: 100,
                  useNativeDriver: false
                })
              ]),
              Animated.sequence([
                Animated.timing(animations.opacity, {
                  toValue: 0.7,
                  duration: 130,
                  useNativeDriver: false
                }),
                Animated.timing(animations.opacity, {
                  toValue: 1,
                  duration: 170,
                  useNativeDriver: false
                })
              ])
            ]).start();
          };

          return (
            <Animated.View
              style={[
                styles.taskCard,
                { 
                  backgroundColor: theme.colors.card, 
                  borderColor: taskSelected ? theme.colors.primary : theme.colors.border,
                  transform: [{ scale: animations.scale }],
                  opacity: animations.opacity
                },
                isActive && {
                  elevation: 10,
                  shadowColor: theme.colors.textPrimary,
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 8 }
                }
              ]}
            >
              {/* Header row — tap to expand, long-press to select/drag */}
              <Pressable
                android_ripple={{ color: theme.colors.primaryAlpha20 }}
                style={{ padding: 14 }}
                onPress={() => {
                  if (selectionMode) {
                    toggleSelection({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });
                    return;
                  }
                  LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                  setExpandedTaskId(prev => prev === root.id ? null : root.id);
                }}
                onLongPress={() => {
                  if (sortMode === "custom") {
                    ensureTaskSelectedForDrag(root);
                    startTaskDrag(drag);
                    return;
                  }
                  if (selectionMode) {
                    toggleSelection({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });
                    return;
                  }
                  startSelection({ kind: "task", id: root.id, parentId: root.parentId ?? null, label: root.text });
                }}
                delayLongPress={280}
              >
                {/* Completion toggle + title */}
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: root.total > 0 ? 8 : 0 }}>
                  <Pressable
                    hitSlop={8}
                    onPress={async () => {
                      if (root.total > 0) {
                        if (root.parentCompleted) return;
                        if (root.completedCount < root.total) {
                          showToast("Conclua as subtarefas primeiro");
                          return;
                        }
                      }
                      // Trigger completion animation
                      animateCompletion();
                      LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                      try {
                        const updated = await toggleTaskForDate(root, selectedDate);
                        upsertTask(updated);
                      } catch (e) {
                        logError("[TasksScreen] toggle root task failed", e);
                      }
                    }}
                  >
                    <Ionicons
                      name={root.parentCompleted ? "checkmark-circle" : "ellipse-outline"}
                      size={22}
                      color={root.parentCompleted ? theme.colors.primary : theme.colors.textSecondary}
                    />
                  </Pressable>

                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontSize: 16,
                      fontWeight: "500",
                      marginHorizontal: 8,
                      color: root.parentCompleted ? theme.colors.textSecondary : theme.colors.textPrimary,
                      textDecorationLine: root.parentCompleted ? "line-through" : "none"
                    }}
                  >
                    {root.text}
                  </Text>
                  {root.isPinned && (
                    <Ionicons name="pin" size={12} color={theme.colors.primary} style={{ marginLeft: 6 }} />
                  )}

                  {/* Priority badge */}
                  <Pressable
                    hitSlop={8}
                    onPress={async () => {
                      const nextPriority = ((root.priority + 1) % 3) as TaskPriority;
                      const updated = await updateTaskPriority(root, nextPriority);
                      upsertTask(updated);
                    }}
                    style={{ marginRight: 8 }}
                  >
                    <View
                      style={[
                        styles.priorityBadge,
                        {
                          backgroundColor:
                            root.priority === 0
                              ? theme.colors.priorityLow
                              : root.priority === 1
                              ? theme.colors.priorityMedium
                              : theme.colors.priorityHigh
                        }
                      ]}
                    >
                      <Text style={{ color: theme.colors.onPrimary, fontSize: 10 }}>
                        {root.priority === 0 ? "LOW" : root.priority === 1 ? "MED" : "HIGH"}
                      </Text>
                    </View>
                  </Pressable>

                  {root.total > 0 && (
                    <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={theme.colors.textSecondary} />
                  )}
                </View>

                {/* Subtask progress bar */}
                {root.total > 0 && (
                  <>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{root.completedCount}/{root.total} done</Text>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>{Math.round(root.progress * 100)}%</Text>
                    </View>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                      <View style={{ height: "100%", borderRadius: 3, width: `${root.progress * 100}%`, backgroundColor: root.progress === 1 ? theme.colors.primary : (theme.colors.secondary || theme.colors.primary) }} />
                    </View>
                  </>
                )}

                {/* Schedule info for tasks without subtasks */}
                {root.total === 0 && (
                  <>
                    {!!root.repeatDays?.length && (
                      <Text muted variant="caption" style={{ marginTop: 2 }}>Repeats: {root.repeatDays.map((d: number) => WEEKDAYS[d]).join(", ")}</Text>
                    )}
                    {!root.repeatDays?.length && !!root.scheduledDate && (
                      <Text muted variant="caption" style={{ marginTop: 2 }}>
                        {root.scheduledDate}{root.scheduledTime ? ` • ${root.scheduledTime}` : ""}
                      </Text>
                    )}
                  </>
                )}
              </Pressable>

              {/* Expanded subtask list */}
              {isExpanded && root.total > 0 && (
                <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2, gap: 4 }}>
                  {root.subtasks.map((subtask: Task) => {
                    const subDone = subtask.completed || isTaskCompletedForDate(subtask, selectedDate);
                    return (
                      <Pressable
                        key={subtask.id}
                        android_ripple={{ color: theme.colors.primaryAlpha20 }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}
                        onPress={async () => {
                          LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                          try {
                            const updated = await toggleTaskForDate(subtask, selectedDate);
                            upsertTask(updated);
                          } catch (e) {
                            logError("[TasksScreen] toggle subtask failed", e);
                          }
                        }}
                      >
                        <Ionicons
                          name={subDone ? "checkmark-circle" : "ellipse-outline"}
                          size={18}
                          color={subDone ? theme.colors.primary : theme.colors.textSecondary}
                        />
                        <Text
                          style={{
                            flex: 1,
                            fontSize: 14,
                            color: subDone ? theme.colors.textSecondary : theme.colors.textPrimary,
                            textDecorationLine: subDone ? "line-through" : "none"
                          }}
                        >
                          {subtask.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <SelectionIndicator visible={taskSelected} />
            </Animated.View>
          );
        }}
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
          (() => {
            const allPinned = selectedItems.every(i =>
              pinnedItems.some(p => p.type === "task" && p.id === i.id)
            );
            return {
              key: "pin",
              label: allPinned ? "Despinar" : "Pinar",
              icon: allPinned ? "pin" : "pin-outline" as const,
              onPress: handlePinSelected
            };
          })(),
          {
            key: "duplicate",
            label: "Duplicar / Copiar",
            icon: "copy-outline",
            onPress: () => {
              showToast("Duplicação em breve");
              handleClearSelection();
            }
          },
          {
            key: "move",
            label: "Mover",
            icon: "folder-open-outline",
            onPress: () => {
              showToast("Segure o item para mover");
              handleClearSelection();
            }
          },
          {
            key: "archive",
            label: "Arquivar / Desarquivar",
            icon: "archive-outline",
            onPress: () => {
              showToast("Arquivo em breve");
              handleClearSelection();
            }
          },
          {
            key: "tag",
            label: "Tag / Label",
            icon: "pricetag-outline",
            onPress: () => {
              showToast("Tags em breve");
              handleClearSelection();
            }
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
            await actions.delete({ kind: "task", id: pendingDeleteTask.id, parentId: pendingDeleteTask.parentId ?? null });
            setPendingDeleteTask(null);
            showToast("Deleted ✓");
          } catch (error) {
            logError("[task] delete failed", error);
            showToast("Could not delete task", "error");
          } finally {
            setTaskDeleting(false);
          }
        }}
      />

      <Modal
        transparent
        visible={showModal}
        animationType="fade"
        onRequestClose={() => {
          handleClearSelection();
          setShowModal(false);
        }}
      >
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

            {/* Priority Selector */}
            <View style={styles.prioritySection}>
              <Text muted variant="caption" style={{ marginBottom: 8 }}>Prioridade</Text>
              <View style={styles.priorityButtonsRow}>
                {[
                  { label: "Baixa", value: 0 as TaskPriority },
                  { label: "Média", value: 1 as TaskPriority },
                  { label: "Alta", value: 2 as TaskPriority }
                ].map((option) => {
                  const isSelected = priority === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => setPriority(option.value)}
                      style={[
                        styles.priorityButton,
                        {
                          backgroundColor: isSelected
                            ? option.value === 0
                              ? theme.colors.priorityLow + "30"
                              : option.value === 1
                              ? theme.colors.priorityMedium + "30"
                              : theme.colors.priorityHigh + "30"
                            : theme.colors.background,
                          borderColor: isSelected
                            ? option.value === 0
                              ? theme.colors.priorityLow
                              : option.value === 1
                              ? theme.colors.priorityMedium
                              : theme.colors.priorityHigh
                            : theme.colors.border,
                          borderWidth: 2
                        }
                      ]}
                    >
                      <Text
                        style={{
                          fontWeight: isSelected ? "700" : "500",
                          fontSize: 14,
                          color: isSelected
                            ? option.value === 0
                              ? theme.colors.priorityLow
                              : option.value === 1
                              ? theme.colors.priorityMedium
                              : theme.colors.priorityHigh
                            : theme.colors.textPrimary
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

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

              {/* Subtasks section */}
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
                  handleClearSelection();
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
                  log("[task] Creating task:", trimmedText);
                  
                  try {
                    const dateForTask = repeatDays.length ? null : scheduledDate || null;
                    const timeForTask = dateForTask ? toTimeKey(scheduledAt) : null;

                    // Notification permission preflight for scheduled tasks
                    if (dateForTask && timeForTask && reminders.length > 0) {
                      if (areNotificationsAvailable()) {
                        const granted = await requestNotificationPermission();
                        log(`[NOTIF][TasksScreen] Permission preflight: ${granted ? "granted" : "denied"}`);
                        if (!granted) {
                          showToast("Permissão de notificação negada", "error");
                        }
                      } else {
                        warn("[NOTIF][TasksScreen] Notifications unavailable (Expo Go or unsupported runtime)");
                      }
                    }
                    
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
                      log(
                        `[NOTIF][TasksScreen] Updated task=${updated.id} scheduledIds=${updated.notificationIds?.length ?? 0}`
                      );
                      upsertTask(updated);

                      // Update subtasks
                      const existingSubtasks = Object.values(tasksMap).filter(t => t.parentId === editingTask.id);
                      const validSubtasks = subtasks.filter(s => s.text.trim().length > 0);
                      
                      // 1. Delete removed subtasks
                      const validSubtaskIds = new Set(validSubtasks.map(s => s.id));
                      for (const existing of existingSubtasks) {
                        if (!validSubtaskIds.has(existing.id)) {
                          await actions.delete({ kind: "task", id: existing.id, parentId: existing.parentId ?? null });
                        }
                      }
                      
                      // 2. Add or Update remaining subtasks
                      for (const sub of validSubtasks) {
                        const existing = existingSubtasks.find(e => e.id === sub.id);
                        if (existing) {
                          if (existing.text !== sub.text.trim() || existing.scheduledDate !== dateForTask) {
                            const updatedSub = await updateTask({
                              ...existing,
                              text: sub.text.trim(),
                              scheduledDate: dateForTask
                            });
                            upsertTask(updatedSub);
                          }
                        } else {
                          // newly added
                          const createdSub = await createTask({
                            text: sub.text.trim(),
                            parentId: editingTask.id,
                            scheduledDate: dateForTask,
                          });
                          upsertTask(createdSub);
                        }
                      }

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
                      log("[task] Task created successfully:", created.id);
                      log(
                        `[NOTIF][TasksScreen] Created task=${created.id} scheduledIds=${created.notificationIds?.length ?? 0}`
                      );
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
                    handleClearSelection();
                    setShowModal(false);
                    showToast("Task salva ✓");
                  } catch (error) {
                    logError("[task] save failed", error);
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

      <View style={[styles.fabRoot, { bottom: Math.max(insets.bottom + 8, 16) + 68 + 20 }]} pointerEvents="box-none">
        <Animated.View
          pointerEvents={fabOpen ? "auto" : "none"}
          style={[
            styles.fabMenuItemWrap,
            {
              transform: [
                {
                  translateY: fabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -80]
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
          <FloatingButton onPress={toggleFab} icon="add" />
        </Animated.View>
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
    paddingBottom: 200
  },
  headerRow: {
    position: "relative",
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  selectionBar: {
    width: "100%",
    height: 56,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center"
  },
  selectionBarOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000
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
  taskCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden"
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
  prioritySection: {
    marginTop: 14,
    marginBottom: 12
  },
  priorityButtonsRow: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between"
  },
  priorityButton: {
    flex: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
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
    zIndex: 999,
    elevation: 12
  },
  fabMenuItemWrap: {
    position: "absolute",
    right: 0,
    bottom: 0
  },
  fabMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 16,
    minWidth: 170
  },
  fabMenuLabel: {
    fontSize: 14,
    fontWeight: "600"
  },
  fabMain: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12
  }
});

export default TasksScreen;

