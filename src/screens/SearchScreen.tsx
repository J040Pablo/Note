import React, { useCallback, useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useAppStore } from "@store/useAppStore";
import { useNotesStore } from "@store/useNotesStore";
import { useTasksStore } from "@store/useTasksStore";
import { getAllFolders } from "@services/foldersService";
import { getAllNotes } from "@services/notesService";
import { getAllTasks } from "@services/tasksService";
import { getPlainTextFromRichNoteContent, getRichNotePreviewLine } from "@utils/noteContent";

type Nav = NativeStackNavigationProp<RootStackParamList, "Tabs">;
type SearchFilter = "all" | "folder" | "note" | "task";

type SearchResult = {
  id: string;
  type: "folder" | "note" | "task";
  title: string;
  subtitle?: string;
};

const firstLine = (text: string) => getRichNotePreviewLine(text, 110);

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();

  const foldersMap = useAppStore((s) => s.folders);
  const setFolders = useAppStore((s) => s.setFolders);

  const notesMap = useNotesStore((s) => s.notes);
  const setNotes = useNotesStore((s) => s.setNotes);

  const tasksMap = useTasksStore((s) => s.tasks);
  const setTasks = useTasksStore((s) => s.setTasks);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [folders, notes, tasks] = await Promise.all([getAllFolders(), getAllNotes(), getAllTasks()]);
        setFolders(folders);
        setNotes(notes);
        setTasks(tasks);
      })();
    }, [setFolders, setNotes, setTasks])
  );

  const folders = useMemo(() => Object.values(foldersMap), [foldersMap]);
  const notes = useMemo(() => Object.values(notesMap), [notesMap]);
  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as SearchResult[];

    const folderResults: SearchResult[] = folders
      .filter((f) => f.name.toLowerCase().includes(q))
      .map((f) => ({ id: f.id, type: "folder", title: f.name }));

    const noteResults: SearchResult[] = notes
      .filter((n) => `${n.title}\n${getPlainTextFromRichNoteContent(n.content)}`.toLowerCase().includes(q))
      .map((n) => ({ id: n.id, type: "note", title: n.title || "Untitled", subtitle: firstLine(n.content) }));

    const taskResults: SearchResult[] = tasks
      .filter((t) => t.text.toLowerCase().includes(q))
      .map((t) => ({ id: t.id, type: "task", title: t.text }));

    const merged = [...folderResults, ...noteResults, ...taskResults];
    return filter === "all" ? merged : merged.filter((x) => x.type === filter);
  }, [filter, folders, notes, query, tasks]);

  const openResult = async (item: SearchResult) => {
    if (item.type === "folder") {
      navigation.navigate("Tabs", {
        screen: "Folders",
        params: {
          screen: "FolderDetail",
          params: { folderId: item.id, trail: [item.id] }
        }
      });
      return;
    }

    if (item.type === "note") {
      navigation.navigate("NoteEditor", { noteId: item.id });
      return;
    }

    navigation.navigate("Tabs", {
      screen: "Tasks",
      params: { focusTaskId: item.id }
    });
  };

  return (
    <Screen>
      <Text variant="title">Search</Text>
      <Text muted style={styles.subtitle}>Find folders, notes and tasks</Text>

      <View style={[styles.searchBar, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
        <Ionicons name="search-outline" size={18} color={theme.colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Type to search..."
          placeholderTextColor={theme.colors.textSecondary}
          style={[styles.input, { color: theme.colors.textPrimary }]}
          autoCapitalize="none"
        />
        {!!query && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <View style={styles.filtersRow}>
        {([
          { key: "all", label: "All", icon: "grid-outline" },
          { key: "folder", label: "Folders", icon: "folder-outline" },
          { key: "note", label: "Notes", icon: "document-text-outline" },
          { key: "task", label: "Tasks", icon: "checkmark-done-outline" }
        ] as const).map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[
                styles.filterChip,
                {
                  borderColor: theme.colors.border,
                  backgroundColor: active ? theme.colors.primary + "22" : theme.colors.card
                }
              ]}
            >
              <Ionicons name={item.icon} size={14} color={active ? theme.colors.primary : theme.colors.textSecondary} />
              <Text style={{ color: active ? theme.colors.primary : theme.colors.textSecondary, fontSize: 12 }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={results}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text muted style={styles.emptyText}>
            {query.trim() ? "No results found." : "Start typing to search."}
          </Text>
        }
        renderItem={({ item }) => {
          const icon =
            item.type === "folder"
              ? "folder-outline"
              : item.type === "note"
              ? "document-text-outline"
              : "checkmark-done-outline";
          return (
            <Pressable
              onPress={() => openResult(item)}
              style={[styles.resultRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}
            >
              <Ionicons name={icon} size={18} color={theme.colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1}>{item.title}</Text>
                {!!item.subtitle && (
                  <Text muted variant="caption" numberOfLines={1}>
                    {item.subtitle}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
};

const styles = StyleSheet.create({
  subtitle: {
    marginTop: 4,
    marginBottom: 10
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
  input: {
    flex: 1,
    fontSize: 14
  },
  filtersRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  listContent: {
    paddingTop: 10,
    paddingBottom: 24,
    gap: 8
  },
  resultRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  emptyText: {
    marginTop: 24,
    textAlign: "center"
  }
});

export default SearchScreen;
