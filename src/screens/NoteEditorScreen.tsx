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
  const [isReadMode, setIsReadMode] = useState(false);
  const [centerSignal, setCenterSignal] = useState(0);
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
        <CanvasNoteEditor
          value={content}
          onChangeText={setContent}
          toolbarVisible={!isReadMode}
          editable={!isReadMode}
          centerSignal={centerSignal}
        />

        <View style={[styles.headerRow, { borderBottomColor: theme.colors.border + "55" }]}> 
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
            editable={!isReadMode}
            placeholder="Title"
            placeholderTextColor={theme.colors.textSecondary}
            style={[styles.headerTitleInput, { color: theme.colors.textPrimary }]}
            numberOfLines={1}
          />

          <View style={styles.headerActions}>
            {isReadMode && (
              <Pressable
                onPress={() => setCenterSignal((prev) => prev + 1)}
                hitSlop={8}
                style={styles.focusToggleButton}
              >
                <Ionicons name="locate-outline" size={20} color={theme.colors.textPrimary} />
              </Pressable>
            )}

            <Pressable
              onPress={() => setIsReadMode((prev) => !prev)}
              hitSlop={8}
              style={styles.focusToggleButton}
            >
              <Ionicons name={isReadMode ? "create-outline" : "eye-outline"} size={20} color={theme.colors.textPrimary} />
            </Pressable>

            {!isReadMode && (
              <Pressable
                disabled={saving}
                onPress={handleSave}
                hitSlop={8}
                style={[styles.saveButton, saving && styles.disabledButton]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="save-outline" size={18} color={theme.colors.primary} />
                )}
              </Pressable>
            )}
          </View>
        </View>
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
    paddingHorizontal: 0,
    paddingTop: 0,
    position: "relative"
  },
  headerRow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderBottomWidth: StyleSheet.hairlineWidth
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  headerTitleInput: {
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
    gap: 8
  },
  focusToggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)"
  },
  saveButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
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

