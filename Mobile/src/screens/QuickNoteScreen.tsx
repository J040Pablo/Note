import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@components/Layout";
import { useTheme } from "@hooks/useTheme";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { createQuickNote, getQuickNoteById, updateQuickNote } from "@services/notesService";
import { useQuickNotesStore } from "@store/useQuickNotesStore";


type QuickNoteRoute = RouteProp<RootStackParamList, "QuickNote">;
type Nav = NativeStackNavigationProp<RootStackParamList, "QuickNote">;

const QuickNoteScreen: React.FC = () => {
  const { theme } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<QuickNoteRoute>();
  const { quickNoteId, folderId } = route.params ?? {};

  const quickNotes = useQuickNotesStore((s) => s.quickNotes);
  const upsertQuickNote = useQuickNotesStore((s) => s.upsertQuickNote);

  const existing = quickNoteId ? quickNotes[quickNoteId] : undefined;

  const [currentId, setCurrentId] = useState<string | null>(quickNoteId ?? null);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [lastSavedTitle, setLastSavedTitle] = useState(existing?.title ?? "");
  const [lastSavedContent, setLastSavedContent] = useState(existing?.content ?? "");
  const [saving, setSaving] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const persistRef = useRef<((opts?: { allowCreate?: boolean }) => Promise<void>) | null>(null);

  useEffect(() => {
    if (!quickNoteId) return;
    if (existing) return;

    let mounted = true;
    (async () => {
      const fetched = await getQuickNoteById(quickNoteId);
      if (!mounted || !fetched) return;
      upsertQuickNote(fetched);
      setCurrentId(fetched.id);
      setTitle(fetched.title ?? "");
      setContent(fetched.content ?? "");
      setLastSavedTitle(fetched.title ?? "");
      setLastSavedContent(fetched.content ?? "");
    })();

    return () => {
      mounted = false;
    };
  }, [existing, quickNoteId, upsertQuickNote]);

  useEffect(() => {
    if (!existing) return;
    setCurrentId(existing.id);
    setTitle(existing.title ?? "");
    setContent(existing.content ?? "");
    setLastSavedTitle(existing.title ?? "");
    setLastSavedContent(existing.content ?? "");
  }, [existing]);

  const hasPendingChanges = useMemo(
    () => title !== lastSavedTitle || content !== lastSavedContent,
    [content, lastSavedContent, lastSavedTitle, title]
  );

  const persistQuickNote = useCallback(async (opts?: { allowCreate?: boolean }) => {
    if (savingRef.current) return;

    const allowCreate = opts?.allowCreate ?? false;
    if (!allowCreate && !currentId) return;

    const safeTitle = title.trim() || "Untitled";
    const safeContent = content;

    if (!currentId && !title.trim() && !content.trim()) return;
    if (currentId && !hasPendingChanges) return;

    savingRef.current = true;
    setSaving(true);

    try {
      if (currentId) {
        await updateQuickNote(currentId, { title: safeTitle, content: safeContent });
        const previous = quickNotes[currentId];
        upsertQuickNote({
          id: currentId,
          title: safeTitle,
          content: safeContent,
          folderId: previous?.folderId ?? folderId ?? null,
          createdAt: previous?.createdAt ?? Date.now(),
          updatedAt: Date.now()
        });
      } else {
        const created = await createQuickNote({
          title: safeTitle,
          content: safeContent,
          folderId: folderId ?? null
        });
        setCurrentId(created.id);
        upsertQuickNote(created);
      }

      setLastSavedTitle(safeTitle);
      setLastSavedContent(safeContent);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [content, currentId, folderId, hasPendingChanges, quickNotes, title, upsertQuickNote]);

  useEffect(() => {
    persistRef.current = persistQuickNote;
  }, [persistQuickNote]);

  useEffect(() => {
    if (!hasPendingChanges && currentId) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      if (persistRef.current) {
        persistRef.current({ allowCreate: true });
      }
    }, 800);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [content, currentId, hasPendingChanges, title]);

  const handleBack = useCallback(() => {
    if (persistRef.current) {
      persistRef.current({ allowCreate: true });
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate("Tabs");
    }
  }, [navigation]);

  return (
    <Screen style={styles.screen}>
      <View style={[styles.headerRow, { borderBottomColor: theme.colors.border + "55" }]}> 
        <Pressable disabled={saving} onPress={handleBack} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
        </Pressable>

        <TextInput
          value={title}
          onChangeText={setTitle}
          onBlur={() => {
            if (persistRef.current) persistRef.current({ allowCreate: true });
          }}
          placeholder="Title"
          placeholderTextColor={theme.colors.textSecondary}
          style={[styles.titleInput, { color: theme.colors.textPrimary }]}
          numberOfLines={1}
        />

        {saving ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <View style={{ width: 20 }} />}
      </View>

      <View style={[styles.editorWrap, { backgroundColor: theme.colors.background }]}> 
        <TextInput
          value={content}
          onChangeText={setContent}
          onBlur={() => {
            if (persistRef.current) persistRef.current({ allowCreate: true });
          }}
          multiline
          placeholder="Write something..."
          placeholderTextColor={theme.colors.textSecondary}
          style={[styles.contentInput, { color: theme.colors.textPrimary }]}
          textAlignVertical="top"
          autoFocus
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(0,0,0,0.15)"
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  titleInput: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 22,
    fontWeight: "700",
    paddingVertical: 0,
    letterSpacing: 0.2
  },
  editorWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16
  },
  contentInput: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24
  }
});

export default QuickNoteScreen;
