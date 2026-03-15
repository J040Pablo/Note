import React, { useMemo } from "react";
import { View, StyleSheet, FlatList, Pressable } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { useTheme } from "@hooks/useTheme";
import { useAppStore } from "@store/useAppStore";

const TasksScreen: React.FC = () => {
  const { theme } = useTheme();
  const tasksMap = useAppStore((s) => s.tasks);
  const toggleTaskCompleted = useAppStore((s) => s.toggleTaskCompleted);
  const toggleTaskPriority = useAppStore((s) => s.toggleTaskPriority);

  const tasks = useMemo(() => Object.values(tasksMap), [tasksMap]);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text variant="title">Tasks</Text>
        <PrimaryButton label="+ Task" onPress={() => {}} />
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => (
          <View
            style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border }}
          />
        )}
        renderItem={({ item }) => (
          <View style={styles.taskRow}>
            <Pressable
              onPress={() => toggleTaskCompleted(item.id)}
              style={[
                styles.checkbox,
                {
                  borderColor: theme.colors.primary,
                  backgroundColor: item.completed ? theme.colors.primary : "transparent"
                }
              ]}
            />
            <Pressable
              style={styles.taskTextWrapper}
              onPress={() => toggleTaskCompleted(item.id)}
            >
              <Text
                style={[
                  styles.taskText,
                  item.completed && { textDecorationLine: "line-through", opacity: 0.6 }
                ]}
              >
                {item.text}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => toggleTaskPriority(item.id)}
              style={styles.priorityPill}
            >
              <Text style={{ color: item.priority ? theme.colors.accent : theme.colors.textMuted }}>
                ★
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          <Text muted style={styles.emptyText}>
            No tasks yet.
          </Text>
        }
      />
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
  emptyText: {
    marginTop: 24,
    textAlign: "center"
  }
});

export default TasksScreen;

