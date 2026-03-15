import React, { useState } from "react";
import { View, StyleSheet, TextInput, ScrollView } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { PrimaryButton } from "@components/PrimaryButton";
import { MarkdownEditor } from "@components/MarkdownEditor";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useAppStore } from "@store/useAppStore";

type NoteEditorRoute = RouteProp<RootStackParamList, "NoteEditor">;

const NoteEditorScreen: React.FC = () => {
  const route = useRoute<NoteEditorRoute>();
  const { noteId, folderId } = route.params ?? {};
  const notes = useAppStore((s) => s.notes);
  const upsertNote = useAppStore((s) => s.upsertNote);

  const existing = noteId ? notes[noteId] : undefined;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [content, setContent] = useState(existing?.content ?? "");

  const handleSave = () => {
    const now = Date.now();
    const id = existing?.id ?? String(now);
    upsertNote({
      id,
      title: title || "Untitled",
      content,
      folderId: existing?.folderId ?? (folderId ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text variant="subtitle" muted>
            Note
          </Text>
          <PrimaryButton label="Save" onPress={handleSave} />
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Title"
          style={styles.titleInput}
        />

        <MarkdownEditor
          value={content}
          onChangeText={setContent}
          placeholder="- [ ] Checklist item
- [x] Completed item

Write your thoughts in markdown..."
        />
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingBottom: 32
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12
  },
  titleInput: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8
  }
});

export default NoteEditorScreen;

