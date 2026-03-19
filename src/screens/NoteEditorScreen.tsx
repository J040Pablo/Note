import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet, TextInput, Pressable, ActivityIndicator } from "react-native";
import { Screen } from "@components/Layout";
import { CanvasNoteEditor } from "@components/CanvasNoteEditor";
import { useFeedback } from "@components/FeedbackProvider";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useNotesStore } from "@store/useNotesStore";
import { createNote, updateNote } from "@services/notesService";
import { useTheme } from "@hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { createEmptyCanvasNote, serializeCanvasNoteContent } from "@utils/noteContent";

type NoteEditorRoute = RouteProp<RootStackParamList, "NoteEditor">;
type Nav = NativeStackNavigationProp<RootStackParamList, "NoteEditor">;

const NoteEditorScreen: React.FC = () => {
  const route = useRoute<NoteEditorRoute>();
  const navigation = useNavigation<Nav>();
  const { noteId, folderId } = route.params ?? {};
  const notes = useNotesStore((s) => s.notes);
  const upsertNote = useNotesStore((s) => s.upsertNote);
  const { theme } = useTheme();
  const { showToast } = useFeedback();

  const existing = noteId ? notes[noteId] : undefined;

  const [currentNote, setCurrentNote] = useState(existing);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? serializeCanvasNoteContent(createEmptyCanvasNote()));
  const [lastSavedTitle, setLastSavedTitle] = useState(existing?.title ?? "");
  const [lastSavedContent, setLastSavedContent] = useState(existing?.content ?? serializeCanvasNoteContent(createEmptyCanvasNote()));
  const [saving, setSaving] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!existing) return;
    setCurrentNote(existing);
    setTitle(existing.title ?? "");
    setContent(existing.content ?? serializeCanvasNoteContent(createEmptyCanvasNote()));
    setLastSavedTitle(existing.title ?? "");
    setLastSavedContent(existing.content ?? serializeCanvasNoteContent(createEmptyCanvasNote()));
  }, [existing]);

  const hasPendingChanges = useMemo(() => title !== lastSavedTitle || content !== lastSavedContent, [content, lastSavedContent, lastSavedTitle, title]);

  const persistNote = useCallback(async () => {
    if (savingRef.current) return null;
    const normalizedTitle = title.trim() || "Untitled";
    if (!hasPendingChanges && currentNote) return currentNote;

    savingRef.current = true;
    setSaving(true);

    try {
      if (currentNote) {
        const saved = await updateNote({
          ...currentNote,
          title: normalizedTitle,
          content
        });
        upsertNote(saved);
        setCurrentNote(saved);
        setLastSavedTitle(saved.title);
        setLastSavedContent(saved.content);
        return saved;
      }

      const saved = await createNote({
        title: normalizedTitle,
        content,
        folderId: folderId ?? null
      });
      upsertNote(saved);
      setCurrentNote(saved);
      setLastSavedTitle(saved.title);
      setLastSavedContent(saved.content);
      navigation.setParams({ noteId: saved.id, folderId: saved.folderId });
      return saved;
    } catch (error) {
      console.error("[note] save failed", error);
      showToast("Could not save note", "error");
      return null;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [content, currentNote, folderId, hasPendingChanges, navigation, showToast, title, upsertNote]);

  useEffect(() => {
    if (!hasPendingChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistNote();
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [hasPendingChanges, persistNote]);

  const handleSave = useCallback(async () => {
    const saved = await persistNote();
    if (!saved) return;
    showToast("Note saved ✓");
  }, [persistNote, showToast]);

  const handleBack = useCallback(() => {
    if (hasPendingChanges) {
      persistNote();
    }
    navigation.goBack();
  }, [hasPendingChanges, navigation, persistNote]);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (hasPendingChanges) {
        persistNote();
      }
    });

    return unsub;
  }, [hasPendingChanges, navigation, persistNote]);

  return (
    <Screen style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Pressable
            disabled={saving}
            onPress={handleBack}
            hitSlop={8}
            style={[styles.backButton, saving && styles.disabledButton]}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </Pressable>

          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={theme.colors.textSecondary}
            style={[styles.headerTitleInput, { color: theme.colors.textPrimary }]}
            numberOfLines={1}
          />

          <Pressable
            disabled={saving}
            onPress={handleSave}
            hitSlop={8}
            style={[styles.saveButton, { backgroundColor: theme.colors.primary + "22" }, saving && styles.disabledButton]}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : (
              <Ionicons name="save-outline" size={18} color={theme.colors.primary} />
            )}
          </Pressable>
        </View>

        <CanvasNoteEditor value={content} onChangeText={setContent} />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    backgroundColor: "#0b0b0b"
  },
  content: {
    flex: 1,
    paddingBottom: 0,
    backgroundColor: "#0b0b0b",
    paddingHorizontal: 12,
    paddingTop: 6
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    minHeight: 48
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  headerTitleInput: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 24,
    fontWeight: "700",
    paddingVertical: 0
  },
  saveButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  disabledButton: {
    opacity: 0.6
  },
  spacer: {
    height: 8
  }
});

export default NoteEditorScreen;

