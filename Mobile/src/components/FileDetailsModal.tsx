import React, { useEffect, useState } from "react";
import { Modal, View, StyleSheet, TextInput, Pressable, Image, ScrollView } from "react-native";
import { useTheme, spacing } from "@hooks/useTheme";
import { Text } from "./Text";
import { pickAndSaveImage, deleteImage } from "@services/imageService";

interface FileDetailsModalProps {
  visible: boolean;
  initialName?: string;
  initialDescription?: string | null;
  initialThumbnailPath?: string | null;
  initialBannerPath?: string | null;
  onCancel: () => void;
  onConfirm: (payload: {
    name: string;
    description: string | null;
    thumbnailPath: string | null;
    bannerPath: string | null;
  }) => void;
}

export const FileDetailsModal: React.FC<FileDetailsModalProps> = ({
  visible,
  initialName,
  initialDescription,
  initialThumbnailPath,
  initialBannerPath,
  onCancel,
  onConfirm
}) => {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailPath, setThumbnailPath] = useState<string | null>(null);
  const [bannerPath, setBannerPath] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setName(initialName ?? "");
    setDescription(initialDescription ?? "");
    setThumbnailPath(initialThumbnailPath ?? null);
    setBannerPath(initialBannerPath ?? null);
  }, [initialBannerPath, initialDescription, initialName, initialThumbnailPath, visible]);

  return (
    <Modal transparent visible={visible} animationType="fade">
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="subtitle">Edit file</Text>
            <Text muted style={{ marginTop: spacing.xs }}>
              Update file details and visual previews.
            </Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="File name"
              placeholderTextColor={theme.colors.textSecondary}
              style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              style={[styles.textArea, { borderColor: theme.colors.border, color: theme.colors.textPrimary }]}
            />

            <Text style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>Thumbnail (optional)</Text>
            <View style={styles.mediaRow}>
              <Pressable
                onPress={async () => {
                  const picked = await pickAndSaveImage("file-thumb");
                  if (picked) {
                    if (thumbnailPath) await deleteImage(thumbnailPath);
                    setThumbnailPath(picked);
                  }
                }}
                style={[styles.mediaButton, { borderColor: theme.colors.border }]}
              >
                <Text>Upload thumbnail</Text>
              </Pressable>
              {!!thumbnailPath && (
                <Pressable onPress={() => setThumbnailPath(null)} style={styles.secondaryButtonInline}>
                  <Text muted>Remove</Text>
                </Pressable>
              )}
            </View>
            {!!thumbnailPath && <Image source={{ uri: thumbnailPath }} style={styles.thumbnailPreview} resizeMode="cover" />}

            <Text style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>Banner (optional)</Text>
            <View style={styles.mediaRow}>
              <Pressable
                onPress={async () => {
                  const picked = await pickAndSaveImage("file-banner");
                  if (picked) {
                    if (bannerPath) await deleteImage(bannerPath);
                    setBannerPath(picked);
                  }
                }}
                style={[styles.mediaButton, { borderColor: theme.colors.border }]}
              >
                <Text>Upload banner</Text>
              </Pressable>
              {!!bannerPath && (
                <Pressable onPress={() => setBannerPath(null)} style={styles.secondaryButtonInline}>
                  <Text muted>Remove</Text>
                </Pressable>
              )}
            </View>
            {!!bannerPath && <Image source={{ uri: bannerPath }} style={styles.bannerPreview} resizeMode="cover" />}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.secondaryButton}>
              <Text muted>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!name.trim()) return;
                onConfirm({
                  name: name.trim(),
                  description: description.trim() ? description.trim() : null,
                  thumbnailPath,
                  bannerPath
                });
              }}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.md
  },
  card: {
    width: "100%",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    maxHeight: "88%"
  },
  content: {
    paddingBottom: spacing.sm
  },
  input: {
    marginTop: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm
  },
  textArea: {
    marginTop: spacing.sm,
    minHeight: 78,
    textAlignVertical: "top",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm
  },
  mediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  mediaButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  secondaryButtonInline: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  thumbnailPreview: {
    marginTop: spacing.sm,
    width: 56,
    height: 56,
    borderRadius: 12
  },
  bannerPreview: {
    marginTop: spacing.sm,
    width: "100%",
    height: 92,
    borderRadius: 12
  },
  actions: {
    marginTop: spacing.md,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm
  },
  secondaryButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  primaryButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 999
  }
});
