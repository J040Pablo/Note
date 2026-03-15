import React, { memo, useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Text } from "@components/Text";
import { useTheme, spacing } from "@hooks/useTheme";
import { useNotesStore } from "@store/useNotesStore";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";
import { getAllTasks, isTaskCompletedForDate, shouldAppearOnDate, toDateKey, toggleTaskForDate } from "@services/tasksService";
import { getAllNotes } from "@services/notesService";
import { getAllFolders } from "@services/foldersService";
import { getPinnedItems, getRecentItems, savePinnedItems, saveRecentItems } from "@services/appMetaService";
import type { RootStackParamList } from "@navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Task, Note, Folder, ID, PinnedItemType } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import { FolderIcon } from "@components/FolderIcon";

type Nav = NativeStackNavigationProp<RootStackParamList, "Tabs">;

type SearchResultType = "folder" | "note" | "task";

type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
};

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
  const pinnedItems = useAppStore((s) => s.pinnedItems);
  const recentItems = useAppStore((s) => s.recentItems);
  const setPinnedItems = useAppStore((s) => s.setPinnedItems);
  const setRecentItems = useAppStore((s) => s.setRecentItems);
  const togglePinned = useAppStore((s) => s.togglePinned);
  const pushRecent = useAppStore((s) => s.pushRecent);

  const notesMap = useNotesStore((s) => s.notes);
  const setNotes = useNotesStore((s) => s.setNotes);

  const tasksMap = useTasksStore((s) => s.tasks);
  const setTasks = useTasksStore((s) => s.setTasks);
  const upsertTask = useTasksStore((s) => s.upsertTask);

  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    const [folders, notes, tasks, pinned, recent] = await Promise.all([
      getAllFolders(),
      getAllNotes(),
      getAllTasks(),
      getPinnedItems(),
      getRecentItems()
    ]);
    setFolders(folders);
    setNotes(notes);
    setTasks(tasks);
    setPinnedItems(pinned);
    setRecentItems(recent);
  }, [setFolders, setNotes, setPinnedItems, setRecentItems, setTasks]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const folders = useMemo(() => Object.values(foldersMap), [foldersMap]);
  const notes = useMemo(() => Object.values(notesMap), [notesMap]);
  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

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

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as SearchResult[];

    const folderResults: SearchResult[] = folders
      .filter((f) => f.name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((f) => ({ id: f.id, type: "folder", title: f.name }));

    const noteResults: SearchResult[] = notes
      .filter((n) => `${n.title}\n${n.content}`.toLowerCase().includes(q))
      .slice(0, 8)
      .map((n) => ({ id: n.id, type: "note", title: n.title || "Untitled", subtitle: firstLine(n.content) }));

    const taskResults: SearchResult[] = tasks
      .filter((t) => t.text.toLowerCase().includes(q))
      .slice(0, 8)
      .map((t) => ({ id: t.id, type: "task", title: t.text }));

    return [...folderResults, ...noteResults, ...taskResults];
  }, [folders, notes, search, tasks]);

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

  const handleSearchPress = useCallback(
    async (result: SearchResult) => {
      if (result.type === "folder") {
        await handleOpenFolder(result.id);
        return;
      }
      if (result.type === "note") {
        await handleOpenNote(result.id);
        return;
      }
      handleOpenTask(result.id);
    },
    [handleOpenFolder, handleOpenNote, handleOpenTask]
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
            <View style={[hsStyles.searchBar, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
              <Ionicons name="search-outline" size={18} color={theme.colors.textSecondary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search folders, notes and tasks"
                placeholderTextColor={theme.colors.textSecondary}
                style={[hsStyles.searchInput, { color: theme.colors.textPrimary }]}
              />
              {!!search && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
                </Pressable>
              )}
            </View>

            {!!search.trim() && (
              <View style={[hsStyles.searchResultsCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
                {searchResults.length === 0 ? (
                  <Text muted>No results</Text>
                ) : (
                  searchResults.map((result, idx) => {
                    const iconName =
                      result.type === "folder"
                        ? "folder-outline"
                        : result.type === "note"
                        ? "document-text-outline"
                        : "checkmark-done-outline";
                    return (
                      <Pressable
                        key={`${result.type}-${result.id}`}
                        onPress={() => handleSearchPress(result)}
                        style={[
                          hsStyles.searchResultRow,
                          idx !== searchResults.length - 1 && {
                            borderBottomWidth: StyleSheet.hairlineWidth,
                            borderBottomColor: theme.colors.border
                          }
                        ]}
                      >
                        <Ionicons name={iconName} size={16} color={theme.colors.textSecondary} />
                        <View style={{ flex: 1 }}>
                          <Text numberOfLines={1}>{result.title}</Text>
                          {!!result.subtitle && (
                            <Text muted variant="caption" numberOfLines={1}>
                              {result.subtitle}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}
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
                        onLongPress={() => handleTogglePin(pin.type, pin.id)}
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
                      <Text style={hsStyles.rowText} numberOfLines={1}>{folder.name}</Text>
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
    </SafeAreaView>
  );
};

const hsStyles = StyleSheet.create({
  safe: {
    flex: 1
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg * 2
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
  searchBar: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    height: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  searchInput: {
    flex: 1,
    fontSize: 14
  },
  searchResultsCard: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10
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
  }
});

export default HomeScreen;

