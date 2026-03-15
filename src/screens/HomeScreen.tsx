import React, { memo, useCallback, useMemo } from "react";
import { View, ScrollView, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "@components/Text";
import { useTheme, spacing } from "@hooks/useTheme";
import { useNavigation } from "@react-navigation/native";
import { useNotesStore } from "@store/useNotesStore";
import { useTasksStore } from "@store/useTasksStore";
import { useAppStore } from "@store/useAppStore";
import { getPriorityTasks, toggleTask } from "@services/tasksService";
import { getRecentNotes } from "@services/notesService";
import { getFoldersByParent } from "@services/foldersService";
import type { RootStackParamList } from "@navigation/RootNavigator";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { Task, Note, Folder } from "@models/types";
import { Ionicons } from "@expo/vector-icons";
import { FolderIcon } from "@components/FolderIcon";

type Nav = NativeStackNavigationProp<RootStackParamList, "Tabs">;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const relativeTime = (ts: number): string => {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
};

const getGreeting = (): string => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

const PRIORITY_META = {
  2: { label: "HIGH", colorKey: "priorityHigh" as const },
  1: { label: "MED",  colorKey: "priorityMedium" as const },
  0: { label: "LOW",  colorKey: "priorityLow" as const },
} as const;

// ─── SectionHeader ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

const SectionHeader: React.FC<SectionHeaderProps> = memo(({ title, iconName, actionLabel, onAction }) => {
  const { theme } = useTheme();
  return (
    <View style={shStyles.row}>
      <View style={shStyles.titleGroup}>
        {!!iconName && (
          <Ionicons
            name={iconName}
            size={18}
            color={theme.colors.textSecondary}
            style={shStyles.sectionIcon}
          />
        )}
        <Text style={[shStyles.title, { color: theme.colors.textPrimary }]}>{title}</Text>
      </View>
      {!!actionLabel && (
        <Pressable
          onPress={onAction}
          hitSlop={8}
          style={[shStyles.actionPill, { backgroundColor: theme.colors.primary + "1A" }]}
        >
          <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: "700" }}>
            {actionLabel}
          </Text>
        </Pressable>
      )}
    </View>
  );
});

const shStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  titleGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionIcon: {
    marginRight: 2,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
  },
  actionPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
});

// ─── TaskItem ─────────────────────────────────────────────────────────────────

interface TaskItemProps {
  task: Task;
  onToggle: (task: Task) => void;
  isLast: boolean;
}

const TaskItem: React.FC<TaskItemProps> = memo(({ task, onToggle, isLast }) => {
  const { theme } = useTheme();
  const meta =
    PRIORITY_META[task.priority as keyof typeof PRIORITY_META] ?? PRIORITY_META[0];
  const badgeColor = theme.colors[meta.colorKey];

  return (
    <>
      <Pressable
        style={tiStyles.row}
        onPress={() => onToggle(task)}
        android_ripple={{ color: theme.colors.border }}
      >
        <View
          style={[
            tiStyles.checkbox,
            {
              borderColor: task.completed ? theme.colors.primary : theme.colors.border,
              backgroundColor: "transparent",
            },
          ]}
        >
          <Ionicons
            name={task.completed ? "checkbox" : "square-outline"}
            size={18}
            color={task.completed ? theme.colors.primary : theme.colors.textSecondary}
          />
        </View>
        <Text
          style={[
            tiStyles.text,
            { color: theme.colors.textPrimary },
            task.completed && {
              textDecorationLine: "line-through",
              color: theme.colors.textSecondary,
              opacity: 0.6,
            },
          ]}
          numberOfLines={2}
        >
          {task.text}
        </Text>
        <View
          style={[
            tiStyles.badge,
            {
              backgroundColor: badgeColor + "20",
              borderColor: badgeColor + "50",
              borderWidth: 1,
            },
          ]}
        >
          <Text style={{ color: badgeColor, fontSize: 10, fontWeight: "700", letterSpacing: 0.6 }}>
            {meta.label}
          </Text>
        </View>
      </Pressable>
      {!isLast && (
        <View style={[tiStyles.divider, { backgroundColor: theme.colors.border }]} />
      )}
    </>
  );
});

const tiStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    flex: 1,
    fontSize: 15,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginLeft: 10,
    flexShrink: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // indent so it lines up under the task text, not the checkbox
    marginLeft: 34,
  },
});

// ─── NoteItem ─────────────────────────────────────────────────────────────────

interface NoteItemProps {
  note: Note;
  onPress: (note: Note) => void;
  isLast: boolean;
}

const NoteItem: React.FC<NoteItemProps> = memo(({ note, onPress, isLast }) => {
  const { theme } = useTheme();
  const preview =
    note.content.length > 90
      ? note.content.slice(0, 87).trimEnd() + "…"
      : note.content;

  return (
    <Pressable
      style={[
        niStyles.card,
        {
          backgroundColor: theme.colors.surfaceElevated,
          borderColor: theme.colors.border,
          marginBottom: isLast ? 0 : spacing.sm,
        },
      ]}
      onPress={() => onPress(note)}
      android_ripple={{ color: theme.colors.border }}
    >
      <View style={niStyles.top}>
        <Text style={[niStyles.title, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {note.title || "Untitled note"}
        </Text>
        <Text style={[niStyles.time, { color: theme.colors.textSecondary }]}>
          {relativeTime(note.updatedAt)}
        </Text>
      </View>
      {!!preview && (
        <Text style={[niStyles.preview, { color: theme.colors.textSecondary }]} numberOfLines={2}>
          {preview}
        </Text>
      )}
    </Pressable>
  );
});

const niStyles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    marginRight: spacing.sm,
  },
  time: {
    fontSize: 12,
    flexShrink: 0,
  },
  preview: {
    fontSize: 13,
    lineHeight: 19,
  },
});

// ─── FolderItem ───────────────────────────────────────────────────────────────

interface FolderItemProps {
  folder: Folder;
  onPress: (folder: Folder) => void;
  isLast: boolean;
}

const FolderItem: React.FC<FolderItemProps> = memo(({ folder, onPress, isLast }) => {
  const { theme } = useTheme();
  return (
    <>
      <Pressable
        style={fiStyles.row}
        onPress={() => onPress(folder)}
        android_ripple={{ color: theme.colors.border }}
      >
        <FolderIcon color={folder.color} fallbackColor={theme.colors.primary} size={18} />
        <Text style={[fiStyles.name, { color: theme.colors.textPrimary }]} numberOfLines={1}>
          {folder.name}
        </Text>
        <Text style={[fiStyles.chevron, { color: theme.colors.textSecondary }]}>›</Text>
      </Pressable>
      {!isLast && (
        <View style={[fiStyles.divider, { backgroundColor: theme.colors.border }]} />
      )}
    </>
  );
});

const fiStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  name: {
    flex: 1,
    fontSize: 15,
  },
  chevron: {
    fontSize: 20,
    lineHeight: 24,
    marginLeft: spacing.sm,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    // indent to align under the folder name
    marginLeft: 46,
  },
});

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  iconName?: keyof typeof Ionicons.glyphMap;
  message: string;
}

const EmptyState: React.FC<EmptyStateProps> = memo(({ iconName, message }) => {
  const { theme } = useTheme();
  return (
    <View style={esStyles.wrap}>
      {!!iconName && (
        <Ionicons
          name={iconName}
          size={24}
          color={theme.colors.textSecondary}
          style={esStyles.icon}
        />
      )}
      <Text style={[esStyles.text, { color: theme.colors.textSecondary }]}>{message}</Text>
    </View>
  );
});

const esStyles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  icon: {
    fontSize: 28,
    marginBottom: spacing.sm,
    opacity: 0.5,
  },
  text: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },
});

// ─── HomeScreen ───────────────────────────────────────────────────────────────

const HomeScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();

  const tasksMap     = useTasksStore((s) => s.tasks);
  const notesMap     = useNotesStore((s) => s.notes);
  const setTasks     = useTasksStore((s) => s.setTasks);
  const setNotes     = useNotesStore((s) => s.setNotes);
  const upsertTask   = useTasksStore((s) => s.upsertTask);
  const foldersMap   = useAppStore((s) => s.folders);
  const upsertFolder = useAppStore((s) => s.upsertFolder);

  // Load fresh data on mount
  React.useEffect(() => {
    (async () => {
      const [priorityTasks, recentNotes, rootFolders] = await Promise.all([
        getPriorityTasks(1, 5),
        getRecentNotes(5),
        getFoldersByParent(null),
      ]);
      setTasks(priorityTasks);
      setNotes(recentNotes);
      rootFolders.forEach(upsertFolder);
    })();
  }, [setNotes, setTasks, upsertFolder]);

  const tasks = useMemo(
    () =>
      Object.values(tasksMap)
        .filter((t) => t.priority >= 1)
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 5),
    [tasksMap],
  );

  const notes = useMemo(
    () =>
      Object.values(notesMap)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5),
    [notesMap],
  );

  const folders = useMemo(
    () =>
      Object.values(foldersMap)
        .filter((f) => f.parentId == null)
        .slice(0, 5),
    [foldersMap],
  );

  const handleToggleTask = useCallback(
    async (task: Task) => {
      const updated = await toggleTask(task);
      upsertTask(updated);
    },
    [upsertTask],
  );

  const handleNotePress = useCallback(
    (note: Note) => navigation.navigate("NoteEditor", { noteId: note.id }),
    [navigation],
  );

  const handleFolderPress = useCallback(
    (folder: Folder) =>
      navigation.navigate("Tabs", {
        screen: "Folders",
        params: {
          screen: "FolderDetail",
          params: { folderId: folder.id, trail: [folder.id] }
        }
      }),
    [navigation],
  );

  return (
    <SafeAreaView
      style={[hsStyles.safe, { backgroundColor: theme.colors.background }]}
      edges={["top", "right", "left", "bottom"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={hsStyles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={hsStyles.header}>
          <Text style={[hsStyles.headerTitle, { color: theme.colors.textPrimary }]}>Home</Text>
          <Text style={[hsStyles.greeting, { color: theme.colors.textSecondary }]}>
            Organize your life
          </Text>
        </View>

        {/* ── Tasks ──────────────────────────────────────── */}
        <View
          style={[
            hsStyles.card,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <SectionHeader
            title="Tasks"
            iconName="checkmark-done-outline"
            actionLabel="+ Task"
            onAction={() => navigation.navigate("Tabs", undefined)}
          />
          {tasks.length === 0 ? (
            <EmptyState iconName="checkmark-circle-outline" message="No priority tasks right now." />
          ) : (
            tasks.map((t, i) => (
              <TaskItem
                key={t.id}
                task={t}
                onToggle={handleToggleTask}
                isLast={i === tasks.length - 1}
              />
            ))
          )}
        </View>

        {/* ── Recent Notes ───────────────────────────────── */}
        <View
          style={[
            hsStyles.card,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <SectionHeader
            title="Recent Notes"
            iconName="document-text-outline"
            actionLabel="+ Note"
            onAction={() => navigation.navigate("NoteEditor", { folderId: null })}
          />
          {notes.length === 0 ? (
            <EmptyState
              iconName="document-outline"
              message={"No notes yet.\nTap + Note to create one."}
            />
          ) : (
            notes.map((n, i) => (
              <NoteItem
                key={n.id}
                note={n}
                onPress={handleNotePress}
                isLast={i === notes.length - 1}
              />
            ))
          )}
        </View>

        {/* ── Folders ────────────────────────────────────── */}
        <View
          style={[
            hsStyles.card,
            { backgroundColor: theme.colors.card, borderColor: theme.colors.border },
          ]}
        >
          <SectionHeader title="Folders" iconName="folder-outline" />
          {folders.length === 0 ? (
            <EmptyState iconName="folder-open-outline" message="No folders yet." />
          ) : (
            folders.map((f, i) => (
              <FolderItem
                key={f.id}
                folder={f}
                onPress={handleFolderPress}
                isLast={i === folders.length - 1}
              />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const hsStyles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg * 2,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
  greeting: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    marginBottom: spacing.lg,
  },
});

export default HomeScreen;

