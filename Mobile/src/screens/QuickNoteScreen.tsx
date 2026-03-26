import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@components/Layout";
import QuickRichTextEditor from "@components/QuickRichTextEditor";
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
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(existing?.folderId ?? folderId ?? null);
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
      setCurrentFolderId(fetched.folderId ?? null);
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
    setCurrentFolderId(existing.folderId ?? null);
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

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

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
        await updateQuickNote(currentId, { title: safeTitle, content: safeContent, folderId: currentFolderId });
        const previous = quickNotes[currentId];
        upsertQuickNote({
          id: currentId,
          title: safeTitle,
          content: safeContent,
          folderId: currentFolderId,
          createdAt: previous?.createdAt ?? Date.now(),
          updatedAt: Date.now()
        });
      } else {
        const created = await createQuickNote({
          title: safeTitle,
          content: safeContent,
          folderId: currentFolderId
        });
        setCurrentId(created.id);
        setCurrentFolderId(created.folderId ?? null);
        upsertQuickNote(created);
      }

      setLastSavedTitle(safeTitle);
      setLastSavedContent(safeContent);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [content, currentFolderId, currentId, hasPendingChanges, quickNotes, title, upsertQuickNote]);
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

  const handleSaveAndClose = useCallback(async () => {
    if (persistRef.current) {
      await persistRef.current({ allowCreate: true });
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

        <View style={styles.headerActions}>
          <Pressable
            disabled={saving}
            onPress={handleSaveAndClose}
            hitSlop={8}
            style={[styles.saveCloseButton, { borderColor: theme.colors.border }]}
          >
            <Ionicons name="checkmark" size={14} color={theme.colors.textPrimary} />
          </Pressable>
          {saving ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <View style={{ width: 16 }} />}
        </View>
      </View>

      <View style={[styles.editorWrap, { backgroundColor: theme.colors.background }]}> 
        <QuickRichTextEditor value={content} onChangeText={setContent} />
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  saveCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  editorWrap: {
    flex: 1,
    paddingHorizontal: 0,
    paddingTop: 12,
    paddingBottom: 16
  }
});

export default QuickNoteScreen;
