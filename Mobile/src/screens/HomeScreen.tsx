import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, Animated, Share, Alert, Image, LayoutAnimation, UIManager, Platform } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useFeedback } from "@components/FeedbackProvider";
import { Text } from "@components/Text";
import { useTheme, spacing } from "@hooks/useTheme";
import { FolderNameModal } from "@components/FolderNameModal";
import SyncPairingQrModal from "@components/SyncPairingQrModal";
import { useNotesStore } from "@store/useNotesStore";
import { useQuickNotesStore } from "@store/useQuickNotesStore";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";
import { useFilesStore } from "@store/useFilesStore";
import { getAllTasks, isTaskCompletedForDate, shouldAppearOnDate, toDateKey, toggleTaskForDate, updateTask } from "@services/tasksService";
import { createNote, getAllNotes, getAllQuickNotes } from "@services/notesService";
import { createFolder, getAllFolders } from "@services/foldersService";
import { getAllFiles } from "@services/filesService";
import { getPinnedItems, getRecentItems, savePinnedItems, saveRecentItems } from "@services/appMetaService";
import type { RootStackParamList } from "@navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Task, Note, Folder, ID, PinnedItemType } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import { FolderIcon } from "@components/FolderIcon";
import FolderCard from "@components/FolderCard";
import { ContextActionMenu } from "@components/ContextActionMenu";
import { SelectionIndicator } from "@components/SelectionIndicator";
import { FloatingButton } from "@components/FloatingButton";
import { useNavigationLock } from "@hooks/useNavigationLock";
import { createTextBlock, getRichNotePreviewLine, serializeRichNoteContent } from "@utils/noteContent";
import { deleteNote, deleteQuickNote } from "@services/notesService";
import { deleteFolder } from "@services/foldersService";
import { deleteTask } from "@services/tasksService";
import { useSelection } from "@hooks/useSelection";

type Nav = NativeStackNavigationProp<RootStackParamList, "Tabs">;
type SelectableKind = "folder" | "note" | "quick" | "task";
type SelectedItem = { kind: SelectableKind; id: ID; label: string };
type SelectionKey = `${SelectableKind}:${ID}`;

const TOP_PADDING_DEFAULT = 24;
const TOP_PADDING_WITH_SELECTION = 80;

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const firstLine = (text: string): string => getRichNotePreviewLine(text, 90);

const LIMITS = {
  quick: 6,
  folders: 6,
  today: 5,
  projects: 5,
};

interface SectionHeaderProps {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const SectionHeader: React.FC<SectionHeaderProps> = memo(({ title, icon }) => {
  const { theme } = useTheme();
  return (
    <View style={hsStyles.sectionHeader}>
      <Ionicons name={icon} size={16} color={theme.colors.textSecondary} />
      <Text style={[hsStyles.sectionTitle, { color: theme.colors.textPrimary }]}>{title}</Text>
    </View>
  );
});

const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const { withLock } = useNavigationLock();
  const { showToast } = useFeedback();

  const foldersMap = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);
  const pinnedItems = useAppStore((s) => s.pinnedItems);
  const recentItems = useAppStore((s) => s.recentItems);
  const setPinnedItems = useAppStore((s) => s.setPinnedItems);
  const setRecentItems = useAppStore((s) => s.setRecentItems);
  const togglePinned = useAppStore((s) => s.togglePinned);
  const pushRecent = useAppStore((s) => s.pushRecent);

  const notesMap = useNotesStore((s) => s.notes);
  const setNotes = useNotesStore((s) => s.setNotes);
  const upsertNote = useNotesStore((s) => s.upsertNote);
  const quickNotesMap = useQuickNotesStore((s) => s.quickNotes);
  const setQuickNotes = useQuickNotesStore((s) => s.setQuickNotes);
  const filesMap = useFilesStore((s) => s.files);
  const setFiles = useFilesStore((s) => s.setFiles);

  const tasksMap = useTasksStore((s) => s.tasks);
  const setTasks = useTasksStore((s) => s.setTasks);
  const upsertTask = useTasksStore((s) => s.upsertTask);
  const removeTask = useTasksStore((s) => s.removeTask);
  const removeFolder = useAppStore((s) => s.removeFolder);
  const removeNote = useNotesStore((s) => s.removeNote);
  const removeQuickNote = useQuickNotesStore((s) => s.removeQuickNote);

  const [search, setSearch] = useState("");
  const [selectedPinned, setSelectedPinned] = useState<{ type: PinnedItemType; id: ID; label: string } | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [openScanner, setOpenScanner] = useState(false);
  const [folderSubmitting, setFolderSubmitting] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [showSelectionMenu, setShowSelectionMenu] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fabAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    const [folders, notes, quickNotes, tasks, files, pinned, recent] = await Promise.all([
      getAllFolders(),
      getAllNotes(),
      getAllQuickNotes(),
      getAllTasks(),
      getAllFiles(),
      getPinnedItems(),
      getRecentItems()
    ]);
    setFolders(folders);
    setNotes(notes);
    setQuickNotes(quickNotes);
    setTasks(tasks);
    setFiles(files);
    setPinnedItems(pinned);
    setRecentItems(recent);
  }, [setFiles, setFolders, setNotes, setPinnedItems, setQuickNotes, setRecentItems, setTasks]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const folders = useMemo(() => Object.values(foldersMap), [foldersMap]);
  const notes = useMemo(() => Object.values(notesMap), [notesMap]);
  const quickNotes = useMemo(() => Object.values(quickNotesMap), [quickNotesMap]);
  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);
  const files = useMemo(() => Object.values(filesMap), [filesMap]);

  const todayKey = toDateKey(new Date());

  const todaysTasks = useMemo(
    () =>
      tasks
        .filter((t) => shouldAppearOnDate(t, todayKey))
        .sort((a, b) => Number(isTaskCompletedForDate(a, todayKey)) - Number(isTaskCompletedForDate(b, todayKey)) || b.priority - a.priority)
        .slice(0, 7),
    [tasks, todayKey]
  );

  const recentNotes = useMemo(
    () =>
      [
        ...notes.map((note) => ({ kind: "note" as const, id: note.id, title: note.title, content: note.content, updatedAt: note.updatedAt })),
        ...quickNotes.map((note) => ({ kind: "quick" as const, id: note.id, title: note.title, content: note.content, updatedAt: note.updatedAt }))
      ]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
    [notes, quickNotes]
  );

  const previewFolders = useMemo(
    () => folders.filter((f) => f.parentId == null).slice(0, 6),
    [folders]
  );

  const pinnedResolved = useMemo(() => {
    return pinnedItems
      .map((item) => {
        if (item.type === "folder") {
          const folder = foldersMap[item.id];
          if (!folder) return null;
          return {
            ...item,
            label: folder.name,
            subtitle: folder.description ?? undefined,
            icon: "folder-outline" as keyof typeof Ionicons.glyphMap,
            photoPath: folder.photoPath ?? undefined,
            bannerPath: folder.bannerPath ?? undefined,
            color: folder.color ?? undefined,
            priority: undefined as number | undefined,
            progress: undefined as number | undefined,
            completedCount: undefined as number | undefined,
            totalCount: undefined as number | undefined,
            taskCompleted: undefined as boolean | undefined,
          };
        }
        if (item.type === "note") {
          const note = notesMap[item.id];
          if (!note) return null;
          return {
            ...item,
            label: note.title,
            subtitle: firstLine(note.content),
            icon: "document-text-outline" as keyof typeof Ionicons.glyphMap,
            photoPath: undefined,
            bannerPath: undefined,
            color: undefined,
            priority: undefined,
            progress: undefined,
            completedCount: undefined,
            totalCount: undefined,
            taskCompleted: undefined,
          };
        }
        // Task
        const task = tasksMap[item.id];
        if (!task) return null;
        
        const subtasks = Object.values(tasksMap).filter(t => t.parentId === task.id);
        const total = subtasks.length;
        const completedCount = subtasks.filter(st => isTaskCompletedForDate(st, todayKey)).length;
        const progress = total > 0 ? completedCount / total : (isTaskCompletedForDate(task, todayKey) ? 1 : 0);
        const taskCompleted = total > 0 ? (total === completedCount) : isTaskCompletedForDate(task, todayKey);

        return {
          ...item,
          label: task.text,
          subtitle: undefined,
          icon: (taskCompleted ? "checkmark-circle" : "ellipse-outline") as keyof typeof Ionicons.glyphMap,
          photoPath: undefined,
          bannerPath: undefined,
          color: undefined,
          priority: task.priority,
          progress,
          completedCount,
          totalCount: total,
          taskCompleted,
        };
      })
      .filter(Boolean) as Array<{
        type: PinnedItemType;
        id: ID;
        label: string;
        subtitle?: string;
        icon: keyof typeof Ionicons.glyphMap;
        photoPath?: string;
        bannerPath?: string;
        color?: string;
        priority?: number;
        progress?: number;
        completedCount?: number;
        totalCount?: number;
        taskCompleted?: boolean;
      }>;
  }, [foldersMap, notesMap, pinnedItems, tasksMap, todayKey]);

  const recentResolved = useMemo(() => {
    return recentItems
      .map((item) => {
        if (item.type === "folder") {
          const folder = foldersMap[item.id];
          return folder ? { ...item, label: folder.name, color: folder.color, photoPath: folder.photoPath, bannerPath: folder.bannerPath } : null;
        }
        const note = notesMap[item.id];
        return note ? { ...item, label: note.title, subtitle: firstLine(note.content) } : null;
      })
      .filter(Boolean) as Array<{ type: "folder" | "note"; id: ID; openedAt: number; label: string; subtitle?: string; color?: string; photoPath?: string; bannerPath?: string }>;
  }, [foldersMap, notesMap, recentItems]);

  const allSelectableItems = useMemo<SelectedItem[]>(() => {
    const map: Record<string, SelectedItem> = {};
    pinnedResolved.forEach((item) => {
      map[`${item.type}:${item.id}`] = { kind: item.type, id: item.id, label: item.label };
    });
    todaysTasks.forEach((task) => {
      map[`task:${task.id}`] = { kind: "task", id: task.id, label: task.text };
    });
    recentNotes.forEach((note) => {
      map[`${note.kind}:${note.id}`] = { kind: note.kind, id: note.id, label: note.title };
    });
    previewFolders.forEach((folder) => {
      map[`folder:${folder.id}`] = { kind: "folder", id: folder.id, label: folder.name };
    });
    recentResolved.forEach((item) => {
      map[`${item.type}:${item.id}`] = { kind: item.type, id: item.id, label: item.label };
    });
    return Object.values(map);
  }, [pinnedResolved, todaysTasks, recentNotes, previewFolders, recentResolved]);

  const getSelectionKey = useCallback((kind: SelectableKind, id: ID): SelectionKey => `${kind}:${id}`, []);

  const {
    selectedItems,
    selectionCount,
    selectionMode,
    isSelected: isSelectedItem,
    toggleSelection,
    startSelection,
    clearSelection,
    selectAllVisible
  } = useSelection(allSelectableItems, {
    getKey: (item) => getSelectionKey(item.kind, item.id),
    onSelectionStart: () => showToast("Modo de selecao ativado")
  });

  const topContentPadding = selectionMode ? TOP_PADDING_WITH_SELECTION : TOP_PADDING_DEFAULT;

  const isSelected = useCallback(
    (kind: SelectableKind, id: ID) => isSelectedItem({ kind, id, label: "" }),
    [isSelectedItem]
  );

  const handleClearSelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    clearSelection();
    setShowSelectionMenu(false);
  }, [clearSelection]);

  const canEditSingle = selectionCount === 1;


  const recurringCount = useMemo(
    () => todaysTasks.filter((task) => (task.repeatDays?.length ?? 0) > 0).length,
    [todaysTasks]
  );

  const completedToday = useMemo(
    () => todaysTasks.filter((task) => isTaskCompletedForDate(task, todayKey)).length,
    [todaysTasks, todayKey]
  );

  const todayProgress = todaysTasks.length === 0 ? 0 : completedToday / todaysTasks.length;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: todayProgress,
      duration: 220,
      useNativeDriver: false
    }).start();
  }, [progressAnim, todayProgress]);

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

  const handleOpenFolder = useCallback(
    (folderId: ID) => {
      withLock(() => {
        const next = pushRecent("folder", folderId);
        setRecentItems(next);
        navigation.navigate("Tabs", {
          screen: "Folders",
          params: {
            screen: "FolderDetail",
            params: { folderId, trail: [folderId], from: "home" }
          }
        });
        saveRecentItems(next); // fire-and-forget — does not delay navigation
      });
    },
    [navigation, pushRecent, setRecentItems, withLock]
  );

  const handleOpenNote = useCallback(
    (noteId: ID) => {
      withLock(() => {
        const next = pushRecent("note", noteId);
        setRecentItems(next);
        navigation.navigate("NoteEditor", { noteId });
        saveRecentItems(next); // fire-and-forget — does not delay navigation
      });
    },
    [navigation, pushRecent, setRecentItems, withLock]
  );

  const handleOpenQuickNote = useCallback(
    (quickNoteId: ID) => {
      withLock(() => {
        navigation.navigate("QuickNote", { quickNoteId });
      });
    },
    [navigation, withLock]
  );

  const handleOpenTask = useCallback(
    (taskId: ID) => {
      const task = tasksMap[taskId];
      navigation.navigate("Tabs", {
        screen: "Tasks",
        params: {
          focusTaskId: taskId,
          dateKey: task?.scheduledDate ?? undefined
        }
      });
    },
    [navigation, tasksMap]
  );

  const handleTogglePin = useCallback(
    async (type: PinnedItemType, id: ID) => {
      const next = togglePinned(type, id);
      await savePinnedItems(next);
    },
    [togglePinned]
  );

  const handleToggleTodayTask = useCallback(
    async (taskId: ID) => {
      const targetTask = tasksMap[taskId];
      if (!targetTask) return;
      const updated = await toggleTaskForDate(targetTask, todayKey);
      upsertTask(updated);
    },
    [tasksMap, todayKey, upsertTask]
  );

  const handleEditSelected = useCallback(() => {
    const [item] = selectedItems;
    if (!item) return;
    handleClearSelection();
    if (item.kind === "folder") {
      handleOpenFolder(item.id);
      return;
    }
    if (item.kind === "note") {
      handleOpenNote(item.id);
      return;
    }
    if (item.kind === "quick") {
      handleOpenQuickNote(item.id);
      return;
    }
    handleOpenTask(item.id);
  }, [handleClearSelection, handleOpenFolder, handleOpenNote, handleOpenQuickNote, handleOpenTask, selectedItems]);

  const handleShareSelected = useCallback(async () => {
    const items = selectedItems;
    if (!items.length) return;
    const body = items
      .map((item) => {
        if (item.kind === "note") {
          const note = notesMap[item.id];
          return note ? `Nota: ${note.title}\n${firstLine(note.content)}` : null;
        }
        if (item.kind === "quick") {
          const quick = quickNotesMap[item.id];
          return quick ? `Quick Note: ${quick.title}\n${firstLine(quick.content)}` : null;
        }
        if (item.kind === "folder") {
          return `Pasta: ${item.label}`;
        }
        const task = tasksMap[item.id];
        return task ? `Tarefa: ${task.text}` : null;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!body.trim()) {
      handleClearSelection();
      return;
    }

    try {
      await Share.share({
        title: items.length === 1 ? items[0].label : `${items.length} itens selecionados`,
        message: body
      });
    } finally {
      handleClearSelection();
    }
  }, [handleClearSelection, notesMap, quickNotesMap, selectedItems, tasksMap]);

  const handlePinSelected = useCallback(async () => {
    const items = selectedItems;
    const pinnable = items.filter((item): item is SelectedItem & { kind: "folder" | "note" | "task" } => item.kind !== "quick");
    if (!pinnable.length) {
      handleClearSelection();
      return;
    }
    try {
      for (const item of pinnable) {
        const type = item.kind as PinnedItemType;
        const next = togglePinned(type, item.id);
        await savePinnedItems(next);
      }
      showToast("Pins atualizados");
    } finally {
      handleClearSelection();
    }
  }, [handleClearSelection, selectedItems, showToast, togglePinned]);

  const handleDeleteSelected = useCallback(() => {
    const items = selectedItems;
    if (!items.length) return;

    Alert.alert(
      "Apagar itens",
      items.length === 1 ? "Deseja apagar o item selecionado?" : `Deseja apagar ${items.length} itens selecionados?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: async () => {
            for (const item of items) {
              if (item.kind === "note") {
                await deleteNote(item.id);
                removeNote(item.id);
                continue;
              }
              if (item.kind === "quick") {
                await deleteQuickNote(item.id);
                removeQuickNote(item.id);
                continue;
              }
              if (item.kind === "folder") {
                await deleteFolder(item.id);
                removeFolder(item.id);
                continue;
              }
              await deleteTask(item.id);
              removeTask(item.id);
            }
            handleClearSelection();
            showToast(items.length === 1 ? "Item apagado" : `${items.length} itens apagados`);
          }
        }
      ]
    );
  }, [handleClearSelection, removeFolder, removeNote, removeQuickNote, removeTask, selectedItems, showToast]);

  const memoizedTodayTasks = useMemo(() => todaysTasks, [todaysTasks]);

  const rootTasks = useMemo(() => {
    const todayRootTasks = tasks.filter(t => {
      if (t.parentId) return false;
      return t.scheduledDate === todayKey;
    });

    const sortedTodayTasks = todayRootTasks.sort((a, b) => {
      return (b.priority ?? 0) - (a.priority ?? 0);
    });

    return sortedTodayTasks.map(root => {
      const allSubtasks = tasks.filter(t => t.parentId === root.id);
      const subtasks = allSubtasks.filter(st => {
        if (!st.scheduledDate) return true;
        return st.scheduledDate === todayKey;
      });
      const total = subtasks.length;
      const completedCount = subtasks.filter(st =>
        st.completed || isTaskCompletedForDate(st, todayKey)
      ).length;
      // Parent is completed ONLY when ALL subtasks are completed; fall back to task.completed if no subtasks
      const allCompleted =
        total > 0
          ? total === completedCount
          : isTaskCompletedForDate(root, todayKey);
          
      const displayTotal = total > 0 ? total : 1;
      const displayCompleted = total > 0 ? completedCount : (allCompleted ? 1 : 0);
      const progress = displayTotal === 0 ? 0 : displayCompleted / displayTotal;
      
      return { ...root, subtasks, total: displayTotal, completedCount: displayCompleted, progress, parentCompleted: allCompleted };
    });
  }, [tasks, todayKey]);

  const sectionData = useMemo(
    () => ["pinned", "quick", "folders", "taskOverview", "rootTasks"],
    [rootTasks.length, pinnedResolved.length]
  );

  const folderPreviewCounts = useMemo(() => {
    const byFolder: Record<string, { subfolders: number; notes: number; files: number }> = {};
    for (const folder of folders) {
      byFolder[folder.id] = { subfolders: 0, notes: 0, files: 0 };
    }
    for (const folder of folders) {
      if (folder.parentId && byFolder[folder.parentId]) {
        byFolder[folder.parentId].subfolders += 1;
      }
    }
    for (const note of notes) {
      if (note.folderId && byFolder[note.folderId]) {
        byFolder[note.folderId].notes += 1;
      }
    }
    for (const file of files) {
      if (file.parentFolderId && byFolder[file.parentFolderId]) {
        byFolder[file.parentFolderId].files += 1;
      }
    }
    return byFolder;
  }, [files, folders, notes]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={["top", "left", "right"]}
    >
      <View style={[hsStyles.header, { paddingTop: 24 }]}>
        <>
          {!selectionMode && (
            <View style={hsStyles.headerTopRow}>
              <Text style={[hsStyles.headerTitle, { color: theme.colors.textPrimary }]}>Home</Text>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <Pressable
                  onPress={() => setOpenScanner(true)}
                  style={[hsStyles.headerActionBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir QR Code"
                >
                  <Ionicons name="qr-code-outline" size={20} color={theme.colors.textPrimary} />
                </Pressable>
                <Pressable
                  onPress={() => navigation.navigate("Notifications" as never)}
                  style={[hsStyles.headerActionBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
                >
                  <Ionicons name="notifications-outline" size={20} color={theme.colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          )}

          {selectionMode && (
            <View style={[hsStyles.selectionBar, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Pressable onPress={handleClearSelection} style={hsStyles.selectionTopAction} hitSlop={8}>
                <Ionicons name="close" size={20} color={theme.colors.textPrimary} />
              </Pressable>
              <Text style={[hsStyles.selectionCount, { color: theme.colors.textPrimary }]}>
                {selectionCount}
              </Text>
              <View style={hsStyles.selectionActions}>
                <Pressable onPress={handleShareSelected} style={hsStyles.selectionActionBtn} hitSlop={8}>
                  <Ionicons name="share-social-outline" size={18} color={theme.colors.textPrimary} />
                </Pressable>
                <Pressable onPress={handleDeleteSelected} style={hsStyles.selectionActionBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.danger} />
                </Pressable>
                {canEditSingle && (
                  <Pressable onPress={handleEditSelected} style={hsStyles.selectionActionBtn} hitSlop={8}>
                    <Ionicons name="pencil-outline" size={18} color={theme.colors.textPrimary} />
                  </Pressable>
                )}
                <Pressable onPress={() => setShowSelectionMenu(true)} style={hsStyles.selectionActionBtn} hitSlop={8}>
                  <Ionicons name="ellipsis-vertical" size={18} color={theme.colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          )}
        </>
      </View>

      <FlatList
        style={{ flex: 1, backgroundColor: theme.colors.background }}
        data={sectionData}
        keyExtractor={(item) => item}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 200, backgroundColor: theme.colors.background }}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item === "pinned") {
            if (pinnedResolved.length === 0) return null;
            return (
              <View style={{ marginTop: spacing.lg, overflow: "visible" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.textPrimary }}>Pinned</Text>
                </View>
                <FlatList
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  data={pinnedResolved}
                  keyExtractor={(x) => `${x.type}-${x.id}`}
                  contentContainerStyle={{ paddingLeft: 0, paddingRight: 0, gap: 12 }}
                  renderItem={({ item: pin }) => {
                    const selected = isSelected(pin.type, pin.id);
                    const isTask = pin.type === "task";
                    const isFolder = pin.type === "folder";
                    const priorityColor = pin.priority === 0
                      ? theme.colors.priorityLow
                      : pin.priority === 1
                      ? theme.colors.priorityMedium
                      : theme.colors.priorityHigh;
                    const priorityLabel = pin.priority === 0 ? "LOW" : pin.priority === 1 ? "MED" : "HIGH";

                    return (
                      <Pressable
                        android_ripple={{ color: theme.colors.primaryAlpha20 }}
                        onPress={() => {
                          if (selectionMode) { toggleSelection({ kind: pin.type, id: pin.id, label: pin.label }); return; }
                          if (pin.type === "folder") return handleOpenFolder(pin.id);
                          if (pin.type === "note") return handleOpenNote(pin.id);
                          return handleOpenTask(pin.id);
                        }}
                        onLongPress={() => {
                          if (selectionMode) { toggleSelection({ kind: pin.type, id: pin.id, label: pin.label }); return; }
                          startSelection({ kind: pin.type, id: pin.id, label: pin.label });
                        }}
                        delayLongPress={260}
                        style={{
                          width: 160,
                          borderWidth: 2,
                          borderRadius: 16,
                          overflow: "hidden",
                          backgroundColor: theme.colors.card,
                          borderColor: selected ? theme.colors.primary : theme.colors.border
                        }}
                      >
                        {isFolder ? (
                          <View>
                            {pin.bannerPath ? (
                              <Image source={{ uri: pin.bannerPath }} style={{ width: "100%", height: 64 }} resizeMode="cover" />
                            ) : (
                              <View style={{ width: "100%", height: 64, backgroundColor: theme.colors.primaryAlpha20 }} />
                            )}
                            <View style={{ position: "absolute", top: 48, left: 12, width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.card, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                              {pin.photoPath ? (
                                <Image source={{ uri: pin.photoPath }} style={{ width: "100%", height: "100%", borderRadius: 8 }} resizeMode="cover" />
                              ) : (
                                <FolderIcon color={pin.color} fallbackColor={theme.colors.primary} size={18} />
                              )}
                            </View>
                            <View style={{ padding: 12, paddingTop: 20 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.textPrimary }}>{pin.label}</Text>
                                <Pressable onPress={() => handleTogglePin(pin.type, pin.id)} hitSlop={10}>
                                  <Ionicons name="pin" size={13} color={theme.colors.primary} />
                                </Pressable>
                              </View>
                              {!!pin.subtitle && <Text numberOfLines={1} variant="caption" muted>{pin.subtitle}</Text>}
                            </View>
                          </View>
                        ) : isTask ? (
                          <>
                            <View style={{ width: "100%", height: 72, backgroundColor: pin.taskCompleted ? theme.colors.primaryAlpha20 : theme.colors.surfaceElevated, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons
                                name={pin.taskCompleted ? "checkmark-circle" : "ellipse-outline"}
                                size={28}
                                color={pin.taskCompleted ? theme.colors.primary : theme.colors.textSecondary}
                              />
                            </View>
                            <View style={{ padding: 12 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 2 }}>
                                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: pin.taskCompleted ? theme.colors.textSecondary : theme.colors.textPrimary, textDecorationLine: pin.taskCompleted ? "line-through" : "none" }}>{pin.label}</Text>
                                {pin.priority !== undefined && (
                                  <View style={{ paddingHorizontal: 5, paddingVertical: 2, borderRadius: 999, backgroundColor: priorityColor }}>
                                    <Text style={{ fontSize: 9, fontWeight: "700", color: theme.colors.onPrimary }}>{priorityLabel}</Text>
                                  </View>
                                )}
                                <Pressable onPress={() => handleTogglePin(pin.type, pin.id)} hitSlop={10}>
                                  <Ionicons name="pin" size={13} color={theme.colors.primary} />
                                </Pressable>
                              </View>
                              {pin.totalCount !== undefined && (
                                <Text style={{ fontSize: 11, color: theme.colors.textSecondary, marginBottom: 6 }}>{pin.completedCount}/{pin.totalCount} subtasks</Text>
                              )}
                              {pin.progress !== undefined && (
                                <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                                  <View style={{ height: "100%", borderRadius: 2, width: `${(pin.progress) * 100}%`, backgroundColor: pin.taskCompleted ? theme.colors.primary : (theme.colors.secondary ?? theme.colors.primary) }} />
                                </View>
                              )}
                            </View>
                          </>
                        ) : (
                          <>
                            <View style={{ width: "100%", height: 72, backgroundColor: theme.colors.primaryAlpha20, alignItems: "center", justifyContent: "center" }}>
                              <Ionicons name={pin.icon} size={28} color={theme.colors.primary} />
                            </View>
                            <View style={{ padding: 12 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: theme.colors.textPrimary }}>{pin.label}</Text>
                                <Pressable onPress={() => handleTogglePin(pin.type, pin.id)} hitSlop={10}>
                                  <Ionicons name="pin" size={13} color={theme.colors.primary} />
                                </Pressable>
                              </View>
                              {!!pin.subtitle && <Text numberOfLines={1} variant="caption" muted>{pin.subtitle}</Text>}
                            </View>
                          </>
                        )}

                        <SelectionIndicator visible={selected} />
                      </Pressable>
                    );
                  }}
                />
              </View>
            );
          }



          if (item === "taskOverview") {
            if (tasks.length === 0) return null;

            const allRootBase = tasks.filter(t => !t.parentId).map(root => {
              const subtasks = tasks.filter(st => st.parentId === root.id);
              const total = subtasks.length;
              const completedCount = subtasks.filter(st => st.completed || isTaskCompletedForDate?.(st, todayKey)).length;
              return total > 0 ? (total === completedCount) : (root.completed || isTaskCompletedForDate?.(root, todayKey));
            });
            const pendingCount = allRootBase.filter(c => !c).length;
            const pendingProgress = allRootBase.length === 0 ? 0 : (allRootBase.length - pendingCount) / allRootBase.length;

            const todayCount = rootTasks.length;
            const completedToday = rootTasks.filter(t => t.parentCompleted).length;
            const todayProgress = todayCount === 0 ? 0 : completedToday / todayCount;

            const getBarColor = (progress: number) => {
              if (progress < 0.3) return theme.colors.danger;
              if (progress < 0.7) return theme.colors.secondary;
              return theme.colors.primary;
            };

            return (
              <View style={{ marginTop: spacing.lg }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.textPrimary }}>Task Overview</Text>
                  <Pressable onPress={() => navigation.navigate("Tasks" as never)} hitSlop={8}>
                    <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "600" }}>View All</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 4, color: theme.colors.textPrimary }}>Pending Tasks ({pendingCount})</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>Progress</Text>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.textPrimary }}>{allRootBase.length - pendingCount}/{allRootBase.length}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                      <View style={{ height: "100%", borderRadius: 3, width: `${pendingProgress * 100}%`, backgroundColor: getBarColor(pendingProgress) }} />
                    </View>
                  </View>
                  <View style={{ flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, backgroundColor: theme.colors.card, borderColor: theme.colors.border }}>
                    <Text style={{ fontSize: 14, fontWeight: "600", marginBottom: 4, color: theme.colors.textPrimary }}>Today Tasks ({todayCount})</Text>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.textSecondary }}>Progress</Text>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: theme.colors.textPrimary }}>{completedToday}/{todayCount}</Text>
                    </View>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                      <View style={{ height: "100%", borderRadius: 3, width: `${todayProgress * 100}%`, backgroundColor: getBarColor(todayProgress) }} />
                    </View>
                  </View>
                </View>
              </View>
            );
          }

          if (item === "rootTasks") {
             const limitedRootTasks = rootTasks.slice(0, 5);
             const hasMore = rootTasks.length > 5;
             
             return (
               <View style={{ marginTop: spacing.lg }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.textPrimary, marginBottom: 12 }}>Today</Text>
                  {rootTasks.length === 0 ? (
                    <Text style={{ color: theme.colors.textSecondary, marginBottom: 16 }}>
                      Nenhuma task para hoje
                    </Text>
                  ) : (
                    <>
                      <View style={{ gap: 12 }}>
                    {limitedRootTasks.map(root => {
                       const isExpanded = expandedTaskId === root.id;
                       
                       return (
                         <View key={root.id} style={{ borderRadius: 16, backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' }}>
                            <Pressable
                               android_ripple={{ color: theme.colors.primaryAlpha20 }}
                               style={{ padding: 14 }}
                               onPress={() => {
                                  LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                                  setExpandedTaskId(prev => (prev === root.id ? null : root.id));
                               }}
                            >
                               <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                  <Pressable
                                     hitSlop={8}
                                     onPress={async () => {
                                        LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                                        try {
                                          const originalTask = tasks.find(t => t.id === root.id) || root;
                                          const updated = await toggleTaskForDate(originalTask as Task, todayKey);
                                          upsertTask(updated);
                                        } catch (e) {
                                          console.error("[HomeScreen] toggle root task failed", e);
                                        }
                                     }}
                                  >
                                     <Ionicons
                                        name={root.parentCompleted ? "checkmark-circle" : "ellipse-outline"}
                                        size={22}
                                        color={root.parentCompleted ? theme.colors.primary : theme.colors.textSecondary}
                                     />
                                  </Pressable>
                                  <Text style={{ flex: 1, fontSize: 16, fontWeight: "600", color: root.parentCompleted ? theme.colors.textSecondary : theme.colors.textPrimary, marginRight: 8, marginLeft: 8, textDecorationLine: root.parentCompleted ? "line-through" : "none" }} numberOfLines={1}>{root.text}</Text>
                                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                                    {root.priority !== undefined && (
                                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, backgroundColor: root.priority === 0 ? theme.colors.priorityLow : root.priority === 1 ? theme.colors.priorityMedium : theme.colors.priorityHigh }}>
                                        <Text style={{ fontSize: 10, color: theme.colors.onPrimary }}>{root.priority === 0 ? "LOW" : root.priority === 1 ? "MED" : "HIGH"}</Text>
                                      </View>
                                    )}
                                     <Pressable
                                        hitSlop={8}
                                        onPress={() => handleOpenTask(root.id)}
                                     >
                                        <Ionicons name="open-outline" size={20} color={theme.colors.primary} />
                                     </Pressable>
                                     <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={20} color={theme.colors.textSecondary} />
                                  </View>
                               </View>

                               <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                  <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>{root.completedCount}/{root.total} completas</Text>
                                  <Text style={{ fontSize: 13, color: theme.colors.textSecondary }}>{Math.round(root.progress * 100)}%</Text>
                               </View>
                               
                               <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.border, overflow: "hidden" }}>
                                  <View style={{ height: "100%", borderRadius: 3, width: `${root.progress * 100}%`, backgroundColor: root.progress === 1 ? theme.colors.primary : theme.colors.secondary || theme.colors.primary }} />
                               </View>
                            </Pressable>

                            {isExpanded && (
                               <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4, gap: 6 }}>
                                 {root.subtasks.map(subtask => {
                                    const completed = subtask.completed || isTaskCompletedForDate(subtask, todayKey);
                                    return (
                                       <Pressable
                                          key={subtask.id}
                                          android_ripple={{ color: theme.colors.primaryAlpha20 }}
                                          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}
                                          onPress={async () => {
                                             LayoutAnimation.configureNext({ ...LayoutAnimation.Presets.easeInEaseOut, duration: 150 });
                                             try {
                                               const updated = await toggleTaskForDate(subtask, todayKey);
                                               upsertTask(updated);
                                             } catch (e) {
                                               console.error("[HomeScreen] toggle subtask failed", e);
                                             }
                                          }}
                                          onLongPress={() => {
                                             if (selectionMode) {
                                               toggleSelection({ kind: "task", id: subtask.id, label: subtask.text });
                                               return;
                                             }
                                             startSelection({ kind: "task", id: subtask.id, label: subtask.text });
                                          }}
                                       >
                                          <Ionicons
                                             name={completed ? "checkmark-circle" : "ellipse-outline"}
                                             size={20}
                                             color={completed ? theme.colors.primary : theme.colors.textSecondary}
                                          />
                                          <Text style={{ flex: 1, fontSize: 14, color: completed ? theme.colors.textSecondary : theme.colors.textPrimary, textDecorationLine: completed ? "line-through" : "none" }}>{subtask.text}</Text>
                                       </Pressable>
                                    );
                                 })}
                               </View>
                            )}
                         </View>
                       );
                    })}
                      </View>

                      {hasMore && (
                        <Pressable
                          onPress={() => navigation.navigate("Tasks" as never)}
                          style={{ marginTop: 12, alignItems: "center", paddingVertical: 10 }}
                        >
                          <Text style={{ color: theme.colors.primary, fontWeight: "600", fontSize: 14 }}>Ver mais ({rootTasks.length - 5})</Text>
                        </Pressable>
                      )}
                    </>
                  )}
               </View>
             );
          }

          if (item === "folders") {
            if (previewFolders.length === 0) return null;
            const limitedFolders = previewFolders.slice(0, LIMITS.folders);
            const hasMoreFolders = previewFolders.length > LIMITS.folders;
            return (
              <View style={{ marginTop: spacing.lg, overflow: "visible" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.textPrimary }}>My Folders</Text>
                  {hasMoreFolders && (
                    <Pressable onPress={() => navigation.navigate("Folders" as never)}>
                      <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "600" }}>View All ({previewFolders.length})</Text>
                    </Pressable>
                  )}
                </View>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={limitedFolders}
                    keyExtractor={f => f.id}
                    contentContainerStyle={{ paddingLeft: 0, paddingRight: 0, gap: 12 }}
                    renderItem={({ item: folder }) => (
                        <FolderCard 
                            folder={folder} 
                            variant="compact"
                            selected={isSelected("folder", folder.id)}
                            onPress={() => {
                              if (selectionMode) {
                                toggleSelection({ kind: "folder", id: folder.id, label: folder.name });
                                return;
                              }
                              handleOpenFolder(folder.id);
                            }}
                            onLongPress={() => {
                              if (selectionMode) {
                                toggleSelection({ kind: "folder", id: folder.id, label: folder.name });
                                return;
                              }
                              startSelection({ kind: "folder", id: folder.id, label: folder.name });
                            }}
                        />
                    )}
                  />
              </View>
            );
          }

          if (item === "quick") {
            if (recentResolved.length === 0) return null;
            const limitedRecent = recentResolved.slice(0, LIMITS.quick);
            const hasMoreRecent = recentResolved.length > LIMITS.quick;
            return (
              <View style={{ marginTop: spacing.lg, overflow: "visible" }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.textPrimary }}>Quick Access</Text>
                  {hasMoreRecent && (
                    <Pressable onPress={() => navigation.navigate("Tabs", { screen: "Folders" })} hitSlop={8}>
                      <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "600" }}>View All ({recentResolved.length})</Text>
                    </Pressable>
                  )}
                </View>
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={limitedRecent}
                    keyExtractor={(x) => `${x.type}-${x.id}`}
                    contentContainerStyle={{ paddingLeft: 0, paddingRight: 0, gap: 12 }}
                    renderItem={({ item: act }) => {
                      const selected = isSelected(act.type as any, act.id);
                      return (
                        <Pressable
                          android_ripple={{ color: theme.colors.primaryAlpha20 }}
                          onPress={() => {
                            if (selectionMode) {
                              toggleSelection({ kind: act.type as any, id: act.id, label: act.label });
                              return;
                            }
                            act.type === "folder" ? handleOpenFolder(act.id) : handleOpenNote(act.id);
                          }}
                          onLongPress={() => {
                            if (selectionMode) {
                              toggleSelection({ kind: act.type as any, id: act.id, label: act.label });
                              return;
                            }
                            startSelection({ kind: act.type as any, id: act.id, label: act.label });
                          }}
                          style={[
                            {
                              width: 160,
                              borderWidth: 2,
                              borderRadius: 16,
                              overflow: 'hidden',
                              backgroundColor: theme.colors.card,
                              borderColor: selected ? theme.colors.primary : theme.colors.border
                            }
                          ]}
                        >
                          {act.type === "folder" ? (
                            <View>
                               {act.bannerPath ? (
                                  <Image source={{ uri: act.bannerPath }} style={{ width: '100%', height: 64 }} resizeMode="cover" />
                               ) : (
                                  <View style={{ width: '100%', height: 64, backgroundColor: theme.colors.primaryAlpha20 }} />
                               )}
                               <View style={{ position: 'absolute', top: 48, left: 12, width: 32, height: 32, borderRadius: 8, backgroundColor: theme.colors.card, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                                  {act.photoPath ? (
                                    <Image source={{ uri: act.photoPath }} style={{ width: '100%', height: '100%', borderRadius: 8 }} resizeMode="cover" />
                                  ) : (
                                    <FolderIcon color={act.color} fallbackColor={theme.colors.primary} size={18} />
                                  )}
                               </View>
                               <View style={{ padding: 12, paddingTop: 20 }}>
                                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", marginBottom: 2, color: theme.colors.textPrimary }}>{act.label}</Text>
                                  {!!act.subtitle && <Text numberOfLines={1} variant="caption" muted>{act.subtitle}</Text>}
                               </View>
                            </View>
                          ) : (
                            <>
                               <View style={{ width: '100%', height: 80, backgroundColor: theme.colors.primaryAlpha20, alignItems: 'center', justifyContent: 'center' }}>
                                  <Ionicons name="document-text" size={32} color={theme.colors.primary} />
                               </View>
                               <View style={{ padding: 12 }}>
                                  <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", marginBottom: 2, color: theme.colors.textPrimary }}>{act.label}</Text>
                                  {!!act.subtitle && <Text numberOfLines={1} variant="caption" muted>{act.subtitle}</Text>}
                               </View>
                            </>
                          )}
                          <SelectionIndicator visible={selected} />
                        </Pressable>
                      );
                    }}
                  />
              </View>
            );
          }

          return null;
        }}
      />

      <ContextActionMenu
        visible={!!selectedPinned}
        title={selectedPinned?.label}
        onClose={() => setSelectedPinned(null)}
        actions={[
          {
            key: "open",
            label: "Open",
            icon: "open-outline",
            onPress: async () => {
              if (!selectedPinned) return;
              if (selectedPinned.type === "folder") {
                await handleOpenFolder(selectedPinned.id);
              } else if (selectedPinned.type === "note") {
                await handleOpenNote(selectedPinned.id);
              } else {
                handleOpenTask(selectedPinned.id);
              }
            }
          },
          {
            key: "edit",
            label: "Edit",
            icon: "pencil",
            onPress: async () => {
              if (!selectedPinned) return;
              if (selectedPinned.type === "note") {
                await handleOpenNote(selectedPinned.id);
                return;
              }
              if (selectedPinned.type === "folder") {
                await handleOpenFolder(selectedPinned.id);
                return;
              }
              handleOpenTask(selectedPinned.id);
            }
          },
          {
            key: "unpin",
            label: "Unpin",
            icon: "pin",
            destructive: true,
            onPress: async () => {
              if (!selectedPinned) return;
              await handleTogglePin(selectedPinned.type, selectedPinned.id);
            }
          }
        ]}
      />

      <ContextActionMenu
        visible={showSelectionMenu}
        title="Acoes secundarias"
        onClose={() => setShowSelectionMenu(false)}
        actions={[
          (() => {
            const allPinned = selectedItems
              .filter(i => i.kind !== "quick")
              .every(i => pinnedItems.some(p => p.type === i.kind && p.id === i.id));
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
              showToast("Duplicacao em breve");
              handleClearSelection();
            }
          },
          {
            key: "move",
            label: "Mover",
            icon: "folder-open-outline",
            onPress: () => {
              showToast("Mover em breve");
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
              if (!canEditSingle) {
                showToast("Selecione apenas 1 item para editar");
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
            key: "clearSelection",
            label: "Desmarcar tudo",
            icon: "close-circle-outline",
            onPress: handleClearSelection
          }
        ]}
      />

      {fabOpen && <Pressable style={hsStyles.fabBackdrop} onPress={closeFab} />}

      <View style={[hsStyles.fabRoot, { bottom: Math.max(insets.bottom + 8, 16) + 68 + 20 }]} pointerEvents="box-none">
        {([
          {
            key: "note",
            label: "Create Note",
            icon: "document-text-outline" as const,
            onPress: () => {
              closeFab();
              withLock(() => {
                navigation.navigate("NoteEditor", { folderId: null });
              });
            }
          },
          {
            key: "quick-note",
            label: "Quick Note",
            icon: "flash-outline" as const,
            onPress: () => {
              closeFab();
              withLock(() => {
                navigation.navigate("QuickNote", { folderId: null });
              });
            }
          },
          {
            key: "folder",
            label: "Create Folder",
            icon: "folder-outline" as const,
            onPress: () => {
              closeFab();
              setShowCreateFolderModal(true);
            }
          },
          {
            key: "task",
            label: "Create Task",
            icon: "checkmark-done-outline" as const,
            onPress: () => {
              closeFab();
              navigation.navigate("Tabs", { screen: "Tasks", params: { openCreate: true } });
            }
          }
        ] as const).map((item, index) => (
          <Animated.View
            key={item.key}
            pointerEvents={fabOpen ? "auto" : "none"}
            style={[
              hsStyles.fabMenuItemWrap,
              {
                transform: [
                  {
                    translateY: fabAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -((index + 1) * 62)]
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
              hitSlop={8}
              onPress={item.onPress}
              style={[
                hsStyles.fabMenuItem,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border
                }
              ]}
            >
              <Ionicons name={item.icon} size={16} color={theme.colors.primary} />
              <Text style={[hsStyles.fabMenuLabel, { color: theme.colors.textPrimary }]}>
                {item.label}
              </Text>
            </Pressable>
          </Animated.View>
        ))}

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

      <FolderNameModal
        visible={showCreateFolderModal}
        onCancel={() => {
          if (folderSubmitting) return;
          setShowCreateFolderModal(false);
        }}
        submitting={folderSubmitting}
        onConfirm={async (payload) => {
          if (folderSubmitting) return;
          setFolderSubmitting(true);
          try {
            const created = await createFolder(
              payload.name,
              null,
              payload.color,
              payload.description,
              payload.photoPath,
              payload.bannerPath
            );
            upsertFolder(created);
            setShowCreateFolderModal(false);
            showToast("Folder saved ✓");
          } catch (error) {
            console.error("[folder] create failed", error);
            showToast("Could not save folder", "error");
          } finally {
            setFolderSubmitting(false);
          }
        }}
      />

      <SyncPairingQrModal visible={openScanner} onClose={() => setOpenScanner(false)} />
    </SafeAreaView>
  );
};

const hsStyles = StyleSheet.create({
  safe: {
    flex: 1
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg * 5
  },
  header: {
    position: "relative",
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: 0,
    minHeight: 100
  },
  headerTopRow: {
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  selectionBar: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center"
  },
  selectionBarOverlay: {
    position: "absolute",
    top: spacing.md,
    left: 0,
    right: 0,
    width: "100%",
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
    minHeight: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 4,
    paddingHorizontal: 8
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5
  },
  headerActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
    marginTop: spacing.md,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 3 },
    elevation: 0
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700"
  },
  horizontalListContent: {
    gap: 8,
    paddingVertical: 4
  },
  pinnedCard: {
    width: 190,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 10,
    position: "relative"
  },
  pinnedTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8
  },
  pinnedTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9
  },
  progressRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 8
  },
  progressFill: {
    height: "100%",
    borderRadius: 999
  },
  rowText: {
    flex: 1,
    fontSize: 14
  },
  noteCard: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 8,
    position: "relative"
  },
  selectedBadge: {
    position: "absolute",
    top: 8,
    right: 8
  },
  noteTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  noteTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600"
  },
  notePreview: {
    marginTop: 2,
    fontSize: 12
  },
  quickNoteBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: spacing.md
  },
  quickNoteCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingTop: 12,
    paddingBottom: 10
  },
  quickNoteTitle: {
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    marginBottom: 4
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
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minWidth: 170
  },
  fabMenuLabel: {
    fontSize: 13,
    fontWeight: "600"
  },
  fabMain: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 12
  }
});

export default HomeScreen;

