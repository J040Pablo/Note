import React, { useMemo, useState } from "react";
import { View, StyleSheet, Pressable, FlatList, TextInput, LayoutAnimation, Platform, UIManager } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useTheme, spacing } from "@hooks/useTheme";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useUnifiedItems } from "@hooks/useUnifiedItems";
import { getPlainTextFromRichNoteContent, getRichNotePreviewLine } from "@utils/noteContent";
import { useSearchStore } from "@store/useSearchStore";
import FolderCard from "@components/FolderCard";
import type { Folder } from "@models/types";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type SearchFilter = "all" | "folder" | "note" | "quick" | "task";

type Nav = NativeStackNavigationProp<RootStackParamList>;

type SearchResult = {
  id: string;
  type: "folder" | "note" | "quick" | "task";
  title: string;
  subtitle?: string;
  raw?: any;
};

const firstLine = (text: string) => getRichNotePreviewLine(text, 110);

const SearchScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { history, addSearch, removeSearch, clearHistory } = useSearchStore();

  const { folders, notes, quickNotes, tasks } = useUnifiedItems({ scope: "global" });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as SearchResult[];

    const folderResults: SearchResult[] = folders
      .filter((f) => f.name.toLowerCase().includes(q))
      .map((f) => ({ id: f.id, type: "folder", title: f.name, raw: f }));

    const noteResults: SearchResult[] = notes
      .filter((n) => `${n.title}\n${getPlainTextFromRichNoteContent(n.content)}`.toLowerCase().includes(q))
      .map((n) => ({ id: n.id, type: "note", title: n.title, subtitle: firstLine(n.content) }));

    const quickNoteResults: SearchResult[] = quickNotes
      .filter((n) => `${n.title}\n${n.content}`.toLowerCase().includes(q))
      .map((n) => ({ id: n.id, type: "quick", title: n.title, subtitle: firstLine(n.content) }));

    const taskResults: SearchResult[] = tasks
      .filter((t) => t.text.toLowerCase().includes(q))
      .map((t) => ({ id: t.id, type: "task", title: t.text }));

    const merged = [...folderResults, ...noteResults, ...quickNoteResults, ...taskResults];
    return filter === "all" ? merged : merged.filter((x) => x.type === filter);
  }, [filter, folders, notes, quickNotes, query, tasks]);

  const openResult = async (item: SearchResult) => {
    addSearch(query);

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

    if (item.type === "quick") {
      navigation.navigate("QuickNote", { quickNoteId: item.id });
      return;
    }

    navigation.navigate("Tabs", {
      screen: "Tasks",
      params: { focusTaskId: item.id }
    });
  };

  const handleApplyHistory = (item: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setQuery(item);
  };

  const combinedData = useMemo(() => {
    if (!query.trim()) {
      return history.map(h => ({ type: "history" as const, value: h }));
    }
    
    // Show results, then history at the bottom if any
    const data: any[] = [...results];
    if (history.length > 0) {
      data.push({ type: "history_header" as const });
      history.forEach(h => {
        if (!query.toLowerCase().includes(h.toLowerCase())) {
           data.push({ type: "history" as const, value: h });
        }
      });
    }
    return data;
  }, [query, results, history]);

  return (
    <Screen>
      <View style={styles.headerBlock}>
        <Text variant="title">Search</Text>
        <Text muted style={styles.subtitle}>Find folders, notes and tasks</Text>

        <View style={[styles.searchBar, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}> 
          <Ionicons name="search-outline" size={18} color={theme.colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={(txt) => {
              setQuery(txt);
            }}
            placeholder="Search moments, notes..."
            placeholderTextColor={theme.colors.textSecondary}
            style={[styles.input, { color: theme.colors.textPrimary }]}
            autoCapitalize="none"
            onSubmitEditing={() => addSearch(query)}
            returnKeyType="search"
          />
          {!!query && (
            <Pressable onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setQuery("");
            }} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={theme.colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <View style={styles.filtersRow}>
          {([
            { key: "all", label: "All", icon: "grid-outline" },
            { key: "folder", label: "Folders", icon: "folder-outline" },
            { key: "note", label: "Notes", icon: "document-text-outline" },
            { key: "quick", label: "Quick Notes", icon: "flash-outline" },
            { key: "task", label: "Tasks", icon: "checkmark-done-outline" }
          ] as const).map((item) => {
            const active = filter === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setFilter(item.key);
                }}
                style={[
                  styles.filterChip,
                  {
                    borderColor: theme.colors.border,
                    backgroundColor: active ? theme.colors.primaryAlpha20 : theme.colors.card
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
      </View>

      <FlatList
        data={combinedData}
        keyExtractor={(item, index) => {
          if (item.type === "history") return `h-${item.value}-${index}`;
          if (item.type === "history_header") return "h-header";
          return `r-${item.type}-${item.id}`;
        }}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          query.trim() ? (
            <Text muted style={styles.emptyText}>No results found.</Text>
          ) : null
        }
        renderItem={({ item }) => {
          if (item.type === "history_header") {
            return (
              <View style={styles.historyHeader}>
                <Text variant="subtitle" style={styles.historyHeaderText}>Recent Searches</Text>
                <Pressable onPress={clearHistory} hitSlop={8}>
                  <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: "600" }}>Clear all</Text>
                </Pressable>
              </View>
            );
          }

          if (item.type === "history") {
            return (
              <View style={[styles.historyItemRow, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
                <Pressable
                  onPress={() => handleApplyHistory(item.value)}
                  style={({ pressed }) => [
                    styles.historyItemPressable,
                    { opacity: pressed ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }
                  ]}
                >
                  <Ionicons name="time-outline" size={18} color={theme.colors.textSecondary} />
                  <Text numberOfLines={1} style={styles.historyText}>{item.value}</Text>
                </Pressable>
                <Pressable onPress={() => removeSearch(item.value)} hitSlop={12} style={styles.historyItemDelete}>
                  <Ionicons name="close" size={16} color={theme.colors.textSecondary} />
                </Pressable>
              </View>
            );
          }

          const res = item as SearchResult;
          
          if (res.type === "folder") {
            return (
              <FolderCard
                folder={res.raw as Folder}
                variant="compact"
                onPress={() => openResult(res)}
                style={styles.folderCardOverride}
              />
            );
          }

          const icon =
            res.type === "note"
              ? "document-text-outline"
              : res.type === "quick"
              ? "flash-outline"
              : "checkmark-done-outline";

          return (
            <Pressable
              onPress={() => openResult(res)}
              style={({ pressed }) => [
                styles.resultRow,
                { 
                  borderColor: theme.colors.border, 
                  backgroundColor: theme.colors.card,
                  opacity: pressed ? 0.8 : 1
                }
              ]}
            >
              <View style={[styles.resultIconWrap, { backgroundColor: theme.colors.primaryAlpha20 }]}>
                <Ionicons name={icon} size={18} color={theme.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.resultTitle}>{res.title}</Text>
                {!!res.subtitle && (
                  <Text muted variant="caption" numberOfLines={1} style={styles.resultSubtitle}>
                    {res.subtitle}
                  </Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={14} color={theme.colors.textSecondary} style={{ opacity: 0.5 }} />
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
  headerBlock: {
    paddingTop: 16,
    paddingHorizontal: 4
  },
  searchBar: {
    borderWidth: 1,
    borderRadius: 14,
    height: 48,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500"
  },
  filtersRow: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
    marginBottom: 10,
    paddingHorizontal: 6
  },
  historyHeaderText: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#888"
  },
  listContent: {
    paddingTop: 16,
    paddingBottom: 40,
    gap: 12,
    paddingHorizontal: 4
  },
  historyItemRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden"
  },
  historyItemPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10
  },
  historyItemDelete: {
    padding: 12,
    opacity: 0.7
  },
  historyText: {
    fontSize: 14,
    fontWeight: "500"
  },
  resultRow: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  resultIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: "600"
  },
  resultSubtitle: {
    fontSize: 12,
    marginTop: 1
  },
  folderCardOverride: {
    width: "100%",
    height: undefined,
    borderWidth: 1,
    borderRadius: 16
  },
  emptyText: {
    marginTop: 40,
    textAlign: "center",
    fontSize: 14
  }
});

export default SearchScreen;
