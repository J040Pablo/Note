import React, { useMemo } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { useTheme } from "@hooks/useTheme";
import { useNavigation } from "@react-navigation/native";
import { useAppStore } from "@store/useAppStore";
import type { RootStackParamList } from "@navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

type Nav = NativeStackNavigationProp<RootStackParamList, "Tabs">;

const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const tasksMap = useAppStore((s) => s.tasks);
  const notesMap = useAppStore((s) => s.notes);

  const tasks = useMemo(
    () => Object.values(tasksMap).filter((t) => t.priority && !t.completed),
    [tasksMap]
  );
  const notes = useMemo(
    () => Object.values(notesMap).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    [notesMap]
  );

  return (
    <Screen>
      <View style={styles.headerRow}>
        <View>
          <Text variant="title">Organize your day</Text>
          <Text muted>Priority tasks and recent notes at a glance.</Text>
        </View>
        <PrimaryButton
          label="+ Note"
          onPress={() => navigation.navigate("NoteEditor", { folderId: null })}
        />
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]}>
        <Text variant="subtitle">Priority tasks</Text>
        {tasks.length === 0 ? (
          <Text muted style={styles.emptyText}>
            No priority tasks yet.
          </Text>
        ) : (
          <FlatList
            data={tasks}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Text style={styles.listItem}>• {item.text}</Text>
            )}
          />
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.colors.surfaceElevated }]}>
        <Text variant="subtitle">Recent notes</Text>
        {notes.length === 0 ? (
          <Text muted style={styles.emptyText}>
            Create your first note to get started.
          </Text>
        ) : (
          <FlatList
            data={notes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Text
                style={styles.noteItem}
                onPress={() => navigation.navigate("NoteEditor", { noteId: item.id })}
              >
                {item.title || "Untitled note"}
              </Text>
            )}
          />
        )}
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  emptyText: {
    marginTop: 8
  },
  listItem: {
    marginTop: 6
  },
  noteItem: {
    marginTop: 6,
    fontWeight: "500"
  }
});

export default HomeScreen;

