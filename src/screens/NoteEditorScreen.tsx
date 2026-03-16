import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet, TextInput, ScrollView, Pressable, Modal, ActivityIndicator } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { MarkdownEditor } from "@components/MarkdownEditor";
import { useFeedback } from "@components/FeedbackProvider";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NavigationAction, RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useNotesStore } from "@store/useNotesStore";
import { createNote, updateNote } from "@services/notesService";
import { useTheme } from "@hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

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

  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");
  const [originalTitle, setOriginalTitle] = useState(existing?.title ?? "");
  const [originalContent, setOriginalContent] = useState(existing?.content ?? "");
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<NavigationAction | null>(null);
  const [bypassUnsavedCheck, setBypassUnsavedCheck] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasUnsavedChanges = useMemo(
    () => title !== originalTitle || content !== originalContent,
    [content, originalContent, originalTitle, title]
  );

  const persistNote = useCallback(async () => {
    if (saving) return null;
    setSaving(true);
    const normalizedTitle = title || "Untitled";
    try {
      if (existing) {
        const saved = await updateNote({
          ...existing,
          title: normalizedTitle,
          content
        });
        upsertNote(saved);
        setOriginalTitle(saved.title);
        setOriginalContent(saved.content);
        return saved;
      }

      const saved = await createNote({
        title: normalizedTitle,
        content,
        folderId: folderId ?? null
      });
      upsertNote(saved);
      setOriginalTitle(saved.title);
      setOriginalContent(saved.content);
      return saved;
    } catch (error) {
      console.error("[note] save failed", error);
      showToast("Could not save note", "error");
      return null;
    } finally {
      setSaving(false);
    }
  }, [content, existing, folderId, saving, showToast, title, upsertNote]);

  const handleSave = useCallback(async () => {
    const saved = await persistNote();
    if (!saved) return;
    showToast("Note saved ✓");
    setBypassUnsavedCheck(true);
    navigation.goBack();
  }, [navigation, persistNote, showToast]);

  const continueLeaving = useCallback(() => {
    if (!pendingAction) return;
    setBypassUnsavedCheck(true);
    setShowUnsavedModal(false);
    const action = pendingAction;
    setPendingAction(null);
    navigation.dispatch(action);
  }, [navigation, pendingAction]);

  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (bypassUnsavedCheck) {
        setBypassUnsavedCheck(false);
        return;
      }

      if (saving) {
        e.preventDefault();
        return;
      }

      if (!hasUnsavedChanges) {
        return;
      }

      e.preventDefault();

      setPendingAction(e.data.action);
      setShowUnsavedModal(true);
    });

    return unsub;
  }, [bypassUnsavedCheck, hasUnsavedChanges, navigation, saving]);

  const displayFileName = title.trim() || existing?.title || "Untitled";

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Pressable
            disabled={saving}
            onPress={() => navigation.goBack()}
            hitSlop={8}
            style={[styles.backButton, saving && styles.disabledButton]}
          >
            <Ionicons name="arrow-back" size={22} color={theme.colors.textPrimary} />
          </Pressable>

          <Text variant="subtitle" numberOfLines={1} style={styles.headerTitle}>
            {displayFileName}
          </Text>

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

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          placeholderTextColor={theme.colors.textSecondary}
          style={[
            styles.titleInput,
            {
              color: theme.colors.textPrimary
            }
          ]}
        />

        <MarkdownEditor
          value={content}
          onChangeText={setContent}
          placeholder="- [ ] Checklist item
- [x] Completed item

Write your thoughts in markdown..."
        />
      </ScrollView>

      <Modal transparent visible={showUnsavedModal} animationType="fade" onRequestClose={() => setShowUnsavedModal(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
            <View style={[styles.iconWrap, { backgroundColor: theme.colors.primary + "1A" }]}> 
              <Ionicons name="save-outline" size={20} color={theme.colors.primary} />
            </View>

            <Text variant="subtitle" style={styles.modalTitle}>Unsaved changes</Text>
            <Text muted style={styles.modalMessage}>
              You edited this note. Save before leaving?
            </Text>

            <View style={styles.modalActionsRow}>
              <Pressable
                disabled={saving}
                onPress={() => {
                  if (saving) return;
                  setShowUnsavedModal(false);
                  setPendingAction(null);
                }}
                style={[styles.modalButton, styles.modalButtonGhost, { borderColor: theme.colors.border }, saving && styles.disabledButton]}
              >
                <Text muted>Cancel</Text>
              </Pressable>

              <Pressable
                disabled={saving}
                onPress={continueLeaving}
                style={[styles.modalButton, styles.modalButtonDanger, { backgroundColor: theme.colors.danger + "22" }, saving && styles.disabledButton]}
              >
                <Text style={{ color: theme.colors.danger, fontWeight: "600" }}>Discard</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={async () => {
                const saved = await persistNote();
                if (!saved) return;
                showToast("Note saved ✓");
                continueLeaving();
              }}
              disabled={saving}
              style={[styles.modalSaveButton, { backgroundColor: theme.colors.primary }, saving && styles.disabledButton]}
            >
              {saving ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  <Text style={{ color: theme.colors.onPrimary, fontWeight: "700" }}>Saving...</Text>
                </>
              ) : (
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "700" }}>Save and leave</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0
  },
  content: {
    paddingBottom: 32
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
  headerTitle: {
    flex: 1,
    marginHorizontal: 8
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
  titleInput: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 16
  },
  modalCard: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10
  },
  modalTitle: {
    marginBottom: 6
  },
  modalMessage: {
    lineHeight: 20,
    marginBottom: 14
  },
  modalActionsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10
  },
  modalButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  modalButtonGhost: {
    borderWidth: StyleSheet.hairlineWidth
  },
  modalButtonDanger: {
    borderWidth: 0
  },
  modalSaveButton: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8
  }
});

export default NoteEditorScreen;

