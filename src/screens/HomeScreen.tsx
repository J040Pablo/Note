import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Text } from "@components/Text";
import { useTheme, spacing } from "@hooks/useTheme";
import { FolderNameModal } from "@components/FolderNameModal";
import { useNotesStore } from "@store/useNotesStore";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";
import { useFilesStore } from "@store/useFilesStore";
import { getAllTasks, isTaskCompletedForDate, shouldAppearOnDate, toDateKey, toggleTaskForDate } from "@services/tasksService";
import { getAllNotes } from "@services/notesService";
import { createFolder, getAllFolders } from "@services/foldersService";
import { getAllFiles } from "@services/filesService";
import { getPinnedItems, getRecentItems, savePinnedItems, saveRecentItems } from "@services/appMetaService";
import type { RootStackParamList } from "@navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Task, Note, Folder, ID, PinnedItemType } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import { FolderIcon } from "@components/FolderIcon";
import { ContextActionMenu } from "@components/ContextActionMenu";

type Nav = NativeStackNavigationProp<RootStackParamList, "Tabs">;

const firstLine = (text: string): string => {
  const line = (text || "").split(/\r?\n/).find((x) => x.trim().length > 0) ?? "";
  return line.length > 90 ? line.slice(0, 87).trimEnd() + "…" : line;
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
  const filesMap = useFilesStore((s) => s.files);
  const setFiles = useFilesStore((s) => s.setFiles);

  const tasksMap = useTasksStore((s) => s.tasks);
  const setTasks = useTasksStore((s) => s.setTasks);
  const upsertTask = useTasksStore((s) => s.upsertTask);

  const [search, setSearch] = useState("");
  const [selectedPinned, setSelectedPinned] = useState<{ type: PinnedItemType; id: ID; label: string } | null>(null);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const fabAnim = useRef(new Animated.Value(0)).current;

  const loadData = useCallback(async () => {
    const [folders, notes, tasks, files, pinned, recent] = await Promise.all([
      getAllFolders(),
      getAllNotes(),
      getAllTasks(),
      getAllFiles(),
      getPinnedItems(),
      getRecentItems()
    ]);
    setFolders(folders);
    setNotes(notes);
    setTasks(tasks);
    setFiles(files);
    setPinnedItems(pinned);
    setRecentItems(recent);
  }, [setFiles, setFolders, setNotes, setPinnedItems, setRecentItems, setTasks]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const folders = useMemo(() => Object.values(foldersMap), [foldersMap]);
  const notes = useMemo(() => Object.values(notesMap), [notesMap]);
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
    () => [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [notes]
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
                label: note.title || "Untitled",
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
        return note ? { ...item, label: note.title || "Untitled", subtitle: firstLine(note.content) } : null;
      })
      .filter(Boolean) as Array<{ type: "folder" | "note"; id: ID; openedAt: number; label: string; subtitle?: string }>;
  }, [foldersMap, notesMap, recentItems]);


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
    async (folderId: ID) => {
      const next = pushRecent("folder", folderId);
      setRecentItems(next);
      await saveRecentItems(next);

      navigation.navigate("Tabs", {
        screen: "Folders",
        params: {
          screen: "FolderDetail",
          params: { folderId, trail: [folderId] }
        }
      });
    },
    [navigation, pushRecent, setRecentItems]
  );

  const handleOpenNote = useCallback(
    async (noteId: ID) => {
      const next = pushRecent("note", noteId);
      setRecentItems(next);
      await saveRecentItems(next);
      navigation.navigate("NoteEditor", { noteId });
    },
    [navigation, pushRecent, setRecentItems]
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
      <FlatList
        data={sectionData}
        keyExtractor={(item) => item}
        contentContainerStyle={hsStyles.scroll}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={hsStyles.header}>
            <Text style={[hsStyles.headerTitle, { color: theme.colors.textPrimary }]}>Home</Text>
          </View>
        }
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
                          if (pin.type === "folder") return handleOpenFolder(pin.id);
                          if (pin.type === "note") return handleOpenNote(pin.id);
                          return handleOpenTask(pin.id);
                        }}
                        onLongPress={() => setSelectedPinned({ type: pin.type, id: pin.id, label: pin.label })}
                        delayLongPress={260}
                        style={[hsStyles.pinnedCard, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
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
                      style={hsStyles.row}
                      onPress={async () => {
                        const updated = await toggleTaskForDate(task, todayKey);
                        upsertTask(updated);
                      }}
                      onLongPress={() => handleTogglePin("task", task.id)}
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
                  recentNotes.map((note) => (
                    <Pressable
                      key={note.id}
                      style={hsStyles.noteCard}
                      onPress={() => handleOpenNote(note.id)}
                      onLongPress={() => handleTogglePin("note", note.id)}
                      delayLongPress={260}
                    >
                      <View style={hsStyles.noteTopRow}>
                        <Text numberOfLines={1} style={hsStyles.noteTitle}>{note.title || "Untitled"}</Text>
                        <Ionicons
                          name={pinnedItems.some((x) => x.type === "note" && x.id === note.id) ? "pin" : "pin-outline"}
                          size={14}
                          color={theme.colors.textSecondary}
                        />
                      </View>
                      {!!firstLine(note.content) && (
                        <Text muted numberOfLines={1} style={hsStyles.notePreview}>
                          {firstLine(note.content)}
                        </Text>
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
                  previewFolders.map((folder) => (
                    <Pressable
                      key={folder.id}
                      style={hsStyles.row}
                      onPress={() => handleOpenFolder(folder.id)}
                      onLongPress={() => handleTogglePin("folder", folder.id)}
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
                recentResolved.map((item) => (
                  <Pressable
                    key={`${item.type}-${item.id}`}
                    style={hsStyles.row}
                    onPress={() => (item.type === "folder" ? handleOpenFolder(item.id) : handleOpenNote(item.id))}
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

      {fabOpen && <Pressable style={hsStyles.fabBackdrop} onPress={closeFab} />}

      <View style={hsStyles.fabRoot} pointerEvents="box-none">
        {([
          {
            key: "note",
            label: "Create Note",
            icon: "document-text-outline" as const,
            onPress: () => {
              closeFab();
              navigation.navigate("NoteEditor", { folderId: null });
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
        onCancel={() => setShowCreateFolderModal(false)}
        onConfirm={async (name, color) => {
          const created = await createFolder(name, null, color);
          upsertFolder(created);
          setShowCreateFolderModal(false);
        }}
      />
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
    paddingBottom: spacing.sm
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: spacing.md
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    marginTop: spacing.md
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
    padding: 10
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
    paddingVertical: 8
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

