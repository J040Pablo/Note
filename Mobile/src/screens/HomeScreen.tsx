import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, Animated, Share, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { getAllTasks, isTaskCompletedForDate, shouldAppearOnDate, toDateKey, toggleTaskForDate } from "@services/tasksService";
import { createNote, getAllNotes, getAllQuickNotes } from "@services/notesService";
import { createFolder, getAllFolders } from "@services/foldersService";
import { getAllFiles } from "@services/filesService";
import { getPinnedItems, getRecentItems, savePinnedItems, saveRecentItems } from "@services/appMetaService";
import type { RootStackParamList } from "@navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Task, Note, Folder, ID, PinnedItemType } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import { FolderIcon } from "@components/FolderIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";
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

const firstLine = (text: string): string => getRichNotePreviewLine(text, 90);

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
          return folder ? { ...item, label: folder.name, icon: "folder" as const } : null;
        }
        if (item.type === "note") {
          const note = notesMap[item.id];
          return note
            ? {
                ...item,
                label: note.title,
                subtitle: firstLine(note.content),
                icon: "document-text-outline" as const
              }
            : null;
        }
        const task = tasksMap[item.id];
        return task ? { ...item, label: task.text, icon: "checkmark-done-outline" as const } : null;
      })
      .filter(Boolean) as Array<{ type: PinnedItemType; id: ID; label: string; subtitle?: string; icon: keyof typeof Ionicons.glyphMap }>;
  }, [foldersMap, notesMap, pinnedItems, tasksMap]);

  const recentResolved = useMemo(() => {
    return recentItems
      .map((item) => {
        if (item.type === "folder") {
          const folder = foldersMap[item.id];
          return folder ? { ...item, label: folder.name } : null;
        }
        const note = notesMap[item.id];
        return note ? { ...item, label: note.title, subtitle: firstLine(note.content) } : null;
      })
      .filter(Boolean) as Array<{ type: "folder" | "note"; id: ID; openedAt: number; label: string; subtitle?: string }>;
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

  const isSelected = useCallback(
    (kind: SelectableKind, id: ID) => isSelectedItem({ kind, id, label: "" }),
    [isSelectedItem]
  );

  const handleClearSelection = useCallback(() => {
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
            params: { folderId, trail: [folderId] }
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

    if (!body.trim()) return;
    await Share.share({
      title: items.length === 1 ? items[0].label : `${items.length} itens selecionados`,
      message: body
    });
  }, [notesMap, quickNotesMap, selectedItems, tasksMap]);

  const handlePinSelected = useCallback(async () => {
    const items = selectedItems;
    const pinnable = items.filter((item): item is SelectedItem & { kind: "folder" | "note" | "task" } => item.kind !== "quick");
    if (!pinnable.length) return;
    for (const item of pinnable) {
      const type = item.kind as PinnedItemType;
      const next = togglePinned(type, item.id);
      await savePinnedItems(next);
    }
    showToast("Pins atualizados");
  }, [selectedItems, showToast, togglePinned]);

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

  const sectionData = useMemo(
    () => ["pinned", "today", "recentNotes", "folders", "recent"],
    []
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
      style={[hsStyles.safe, { backgroundColor: theme.colors.background }]}
      edges={["top", "right", "left", "bottom"]}
    >
      <View style={hsStyles.header}>
        {selectionMode ? (
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
        ) : (
          <View style={hsStyles.headerTopRow}>
            <Text style={[hsStyles.headerTitle, { color: theme.colors.textPrimary }]}>Home</Text>
            <Pressable
              onPress={() => setOpenScanner(true)}
              style={[hsStyles.headerActionBtn, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
              accessibilityRole="button"
              accessibilityLabel="Abrir QR Code"
            >
              <Ionicons name="qr-code-outline" size={20} color={theme.colors.textPrimary} />
            </Pressable>
          </View>
        )}
      </View>

      <FlatList
        data={sectionData}
        keyExtractor={(item) => item}
        contentContainerStyle={hsStyles.scroll}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          if (item === "pinned") {
            return (
              <View style={[hsStyles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                <SectionHeader title="Pinned" icon="pin-outline" />
                {pinnedResolved.length === 0 ? (
                  <Text muted>Long press folders, notes or tasks to pin them.</Text>
                ) : (
                  <FlatList
                    horizontal
                    data={pinnedResolved}
                    keyExtractor={(x) => `${x.type}-${x.id}`}
                    contentContainerStyle={hsStyles.horizontalListContent}
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item: pin }) => (
                      <Pressable
                        onPress={() => {
                          if (selectionMode) {
                            toggleSelection({ kind: pin.type, id: pin.id, label: pin.label });
                            return;
                          }
                          if (pin.type === "folder") return handleOpenFolder(pin.id);
                          if (pin.type === "note") return handleOpenNote(pin.id);
                          return handleOpenTask(pin.id);
                        }}
                        onLongPress={() => {
                          if (selectionMode) {
                            toggleSelection({ kind: pin.type, id: pin.id, label: pin.label });
                            return;
                          }
                          startSelection({ kind: pin.type, id: pin.id, label: pin.label });
                        }}
                        delayLongPress={260}
                        style={[
                          hsStyles.pinnedCard,
                          {
                            backgroundColor: theme.colors.surfaceElevated,
                            borderColor: isSelected(pin.type, pin.id) ? theme.colors.primary : theme.colors.border
                          },
                          isSelected(pin.type, pin.id) && { borderWidth: 1.5 }
                        ]}
                      >
                        <View style={hsStyles.pinnedTopRow}>
                          <Ionicons name={pin.icon} size={16} color={theme.colors.primary} />
                          <Pressable onPress={() => handleTogglePin(pin.type, pin.id)} hitSlop={8}>
                            <Ionicons name="pin" size={14} color={theme.colors.primary} />
                          </Pressable>
                        </View>
                        <Text numberOfLines={1} style={hsStyles.pinnedTitle}>{pin.label}</Text>
                        {!!pin.subtitle && (
                          <Text muted variant="caption" numberOfLines={2}>
                            {pin.subtitle}
                          </Text>
                        )}
                        {isSelected(pin.type, pin.id) && (
                          <View style={hsStyles.selectedBadge}>
                            <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
                          </View>
                        )}
                      </Pressable>
                    )}
                  />
                )}
              </View>
            );
          }

          if (item === "today") {
            return (
              <View style={[hsStyles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                <SectionHeader title="Today's tasks" icon="checkmark-done-outline" />
                <View style={hsStyles.progressRow}>
                  <Text muted variant="caption">
                    {completedToday}/{todaysTasks.length} completed
                  </Text>
                  {!!recurringCount && (
                    <Text variant="caption" style={{ color: theme.colors.primary }}>
                      {recurringCount} recurring
                    </Text>
                  )}
                </View>
                <View style={[hsStyles.progressTrack, { backgroundColor: theme.colors.border }]}>
                  <Animated.View
                    style={[
                      hsStyles.progressFill,
                      {
                        backgroundColor: theme.colors.primary,
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ["0%", "100%"]
                        })
                      }
                    ]}
                  />
                </View>
                {todaysTasks.length === 0 ? (
                  <Text muted>No tasks for today.</Text>
                ) : (
                  todaysTasks.map((task) => (
                    <Pressable
                      key={task.id}
                      style={[
                        hsStyles.row,
                        isSelected("task", task.id) && {
                          backgroundColor: theme.colors.primaryAlpha20,
                          borderRadius: 10,
                          paddingHorizontal: 8
                        }
                      ]}
                      onPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "task", id: task.id, label: task.text });
                          return;
                        }
                        handleToggleTodayTask(task.id);
                      }}
                      onLongPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: "task", id: task.id, label: task.text });
                          return;
                        }
                        startSelection({ kind: "task", id: task.id, label: task.text });
                      }}
                      delayLongPress={260}
                    >
                      <Ionicons
                        name={isTaskCompletedForDate(task, todayKey) ? "checkbox" : "square-outline"}
                        size={18}
                        color={isTaskCompletedForDate(task, todayKey) ? theme.colors.primary : theme.colors.textSecondary}
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          hsStyles.rowText,
                          isTaskCompletedForDate(task, todayKey) && {
                            textDecorationLine: "line-through",
                            color: theme.colors.textSecondary
                          }
                        ]}
                      >
                        {task.text}
                      </Text>
                      {!!task.repeatDays?.length && (
                        <Text variant="caption" style={{ color: theme.colors.primary }}>
                          Recurring • {task.repeatDays.length} day(s)
                        </Text>
                      )}
                      <Ionicons name="pin-outline" size={14} color={theme.colors.textSecondary} />
                    </Pressable>
                  ))
                )}
              </View>
            );
          }

          if (item === "recentNotes") {
            return (
              <View style={[hsStyles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                <SectionHeader title="Recent notes" icon="document-text-outline" />
                {recentNotes.length === 0 ? (
                  <Text muted>No notes yet.</Text>
                ) : (
                  (recentNotes ?? []).map((note) => (
                    <Pressable
                      key={note.id}
                      style={[
                        hsStyles.noteCard,
                        {
                          backgroundColor: theme.colors.surface,
                          borderColor: isSelected(note.kind, note.id) ? theme.colors.primary : theme.colors.border
                        },
                        isSelected(note.kind, note.id) && { borderWidth: 1.5 }
                      ]}
                      onPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: note.kind, id: note.id, label: note.title });
                          return;
                        }
                        note.kind === "quick" ? handleOpenQuickNote(note.id) : handleOpenNote(note.id);
                      }}
                      onLongPress={() => {
                        if (selectionMode) {
                          toggleSelection({ kind: note.kind, id: note.id, label: note.title });
                          return;
                        }
                        startSelection({ kind: note.kind, id: note.id, label: note.title });
                      }}
                      delayLongPress={260}
                    >
                      <View style={hsStyles.noteTopRow}>
                        <Text numberOfLines={1} style={hsStyles.noteTitle}>{note.title}</Text>
                        {note.kind === "quick" ? (
                          <Ionicons name="flash-outline" size={14} color={theme.colors.textSecondary} />
                        ) : (
                          <Ionicons
                            name={pinnedItems.some((x) => x.type === "note" && x.id === note.id) ? "pin" : "pin-outline"}
                            size={14}
                            color={theme.colors.textSecondary}
                          />
                        )}
                      </View>
                      {!!firstLine(note.content) && (
                        <Text muted numberOfLines={1} style={hsStyles.notePreview}>
                          {firstLine(note.content)}
                        </Text>
                      )}
                      {isSelected(note.kind, note.id) && (
                        <View style={hsStyles.selectedBadge}>
                          <Ionicons name="checkmark-circle" size={16} color={theme.colors.primary} />
                        </View>
                      )}
                    </Pressable>
                  ))
                )}
              </View>
            );
          }

          if (item === "folders") {
            return (
              <View style={[hsStyles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                <SectionHeader title="Folders preview" icon="folder-outline" />
                {previewFolders.length === 0 ? (
                  <Text muted>No folders yet.</Text>
                ) : (
                  (previewFolders ?? []).map((folder) => (
                    <Pressable
                      key={folder.id}
                      style={[
                        hsStyles.row,
                        isSelected("folder", folder.id) && {
                          backgroundColor: theme.colors.primaryAlpha20,
                          borderRadius: 10,
                          paddingHorizontal: 8
                        }
                      ]}
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
                      delayLongPress={260}
                    >
                      <FolderIcon color={folder.color} fallbackColor={theme.colors.primary} size={18} />
                      <View style={{ flex: 1 }}>
                        <Text style={hsStyles.rowText} numberOfLines={1}>{folder.name}</Text>
                        <Text muted variant="caption" numberOfLines={1}>
                          {folderPreviewCounts[folder.id]?.subfolders ?? 0} folders • {folderPreviewCounts[folder.id]?.notes ?? 0} notes • {folderPreviewCounts[folder.id]?.files ?? 0} files
                        </Text>
                      </View>
                      <Ionicons
                        name={pinnedItems.some((x) => x.type === "folder" && x.id === folder.id) ? "pin" : "chevron-forward"}
                        size={14}
                        color={theme.colors.textSecondary}
                      />
                    </Pressable>
                  ))
                )}
              </View>
            );
          }

          return (
            <View style={[hsStyles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
              <SectionHeader title="Recent" icon="time-outline" />
              {recentResolved.length === 0 ? (
                <Text muted>No recently opened items.</Text>
              ) : (
                (recentResolved ?? []).map((item) => (
                  <Pressable
                    key={`${item.type}-${item.id}`}
                    style={[
                      hsStyles.row,
                      isSelected(item.type, item.id) && {
                        backgroundColor: theme.colors.primaryAlpha20,
                        borderRadius: 10,
                        paddingHorizontal: 8
                      }
                    ]}
                    onPress={() => {
                      if (selectionMode) {
                        toggleSelection({ kind: item.type, id: item.id, label: item.label });
                        return;
                      }
                      item.type === "folder" ? handleOpenFolder(item.id) : handleOpenNote(item.id);
                    }}
                    onLongPress={() => {
                      if (selectionMode) {
                        toggleSelection({ kind: item.type, id: item.id, label: item.label });
                        return;
                      }
                      startSelection({ kind: item.type, id: item.id, label: item.label });
                    }}
                  >
                    <Ionicons
                      name={item.type === "folder" ? "folder-outline" : "document-text-outline"}
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1}>{item.label}</Text>
                      {!!item.subtitle && (
                        <Text muted variant="caption" numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      )}
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          );
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
            onPress: () => showToast("Duplicacao em breve")
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

      <View style={hsStyles.fabRoot} pointerEvents="box-none">
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
                      outputRange: [0, -((index + 1) * 58)]
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

        <Pressable
          onPress={toggleFab}
          style={[
            hsStyles.fabMain,
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
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  selectionBar: {
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
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4
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
    right: spacing.md,
    bottom: spacing.lg
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
    minWidth: 160
  },
  fabMenuLabel: {
    fontSize: 13,
    fontWeight: "600"
  },
  fabMain: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6
  }
});

export default HomeScreen;

