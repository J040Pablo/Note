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
  const initialContentRef = useRef<string>(serializeCanvasNoteContent(createEmptyCanvasNote()));

  const [currentNote, setCurrentNote] = useState(existing);
  const [title, setTitle] = useState(existing?.title ?? "Untitled");
  const [content, setContent] = useState(existing?.content ?? initialContentRef.current);
  const [lastSavedTitle, setLastSavedTitle] = useState(existing?.title ?? "Untitled");
  const [lastSavedContent, setLastSavedContent] = useState(existing?.content ?? initialContentRef.current);
  const [saving, setSaving] = useState(false);
  const [isReadMode, setIsReadMode] = useState(false);
  const [centerSignal, setCenterSignal] = useState(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const creatingRef = useRef(false);
  const skipBeforeRemoveRef = useRef(false);
  const persistNoteRef = useRef<any>(null);

  useEffect(() => {
    if (!existing) return;
    setCurrentNote(existing);
    setTitle(existing.title ?? "Untitled");
    setContent(existing.content ?? initialContentRef.current);
    setLastSavedTitle(existing.title ?? "Untitled");
    setLastSavedContent(existing.content ?? initialContentRef.current);
  }, [existing]);

  const hasPendingChanges = useMemo(() => title !== lastSavedTitle || content !== lastSavedContent, [content, lastSavedContent, lastSavedTitle, title]);

  const persistNote = useCallback(async (options?: { allowCreate?: boolean; showValidationError?: boolean }) => {
    if (savingRef.current) return null;
    if (!currentNote && creatingRef.current) return null;
    const allowCreate = options?.allowCreate ?? false;
    const showValidationError = options?.showValidationError ?? false;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const normalizedTitle = title.trim() || "Untitled";
    const normalizedContent = typeof content === "string" ? content : "";
    const hasMeaningfulContent = normalizedContent.trim().length > 0;
    const hasMeaningfulTitle = title.trim().length > 0;
    if (!currentNote && !hasMeaningfulTitle && !hasMeaningfulContent) {
      if (showValidationError) {
        showToast("Start typing to create a note", "error");
      }
      return null;
    }
    if (!hasPendingChanges && currentNote) return currentNote;
    if (!currentNote && !allowCreate) return null;

    savingRef.current = true;
    setSaving(true);

    try {
      if (currentNote) {
        const saved = await updateNote({
          ...currentNote,
          title: normalizedTitle,
          content: normalizedContent
        });
        upsertNote(saved);
        setCurrentNote(saved);
        setLastSavedTitle(saved.title);
        setLastSavedContent(saved.content);
        return saved;
      }

      creatingRef.current = true;
      const saved = await createNote({
        title: normalizedTitle,
        content: normalizedContent,
        folderId: folderId ?? null
      });
      upsertNote(saved);
      setCurrentNote(saved);
      setLastSavedTitle(saved.title);
      setLastSavedContent(saved.content);
      // Keep local state as source of truth. Avoid setParams after async save,
      // because the screen may already be unfocused/unmounted when user leaves quickly.
      return saved;
    } catch (error) {
      console.error("[note] save failed", error);
      showToast("Could not save note", "error");
      return null;
    } finally {
      creatingRef.current = false;
      savingRef.current = false;
      setSaving(false);
    }
  }, [content, currentNote, folderId, showToast, title, upsertNote]);

  useEffect(() => {
    persistNoteRef.current = persistNote;
  }, [persistNote]);

  useEffect(() => {
    if (!hasPendingChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistNote({ allowCreate: true });
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [currentNote, hasPendingChanges, persistNote]);

  const handleBack = useCallback(() => {
    if (hasPendingChanges) {
      persistNote({ allowCreate: true });
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("Tabs", {
      screen: folderId ? "Folders" : "Home",
      params: folderId
        ? {
            screen: "FolderDetail",
            params: { folderId, trail: [folderId] }
          }
        : undefined
    });
  }, [currentNote, folderId, hasPendingChanges, navigation, persistNote]);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (skipBeforeRemoveRef.current || savingRef.current) return;
      if (hasPendingChanges && persistNoteRef.current) {
        persistNoteRef.current({ allowCreate: true });
      }
    });

    return unsub;
  }, [navigation, hasPendingChanges, currentNote]);

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
            onBlur={() => {
              if (persistNoteRef.current) {
                persistNoteRef.current({ allowCreate: true });
              }
            }}
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

            {!isReadMode && saving ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
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
  disabledButton: {
    opacity: 0.6
  },
  spacer: {
    height: 8
  }
});

export default NoteEditorScreen;

