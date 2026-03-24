import React, { useState, useEffect } from "react";
import { Modal, View, StyleSheet, TextInput, Pressable, Image, ScrollView, ActivityIndicator } from "react-native";
import { useTheme, spacing } from "@hooks/useTheme";
import { Text } from "./Text";
import { FOLDER_COLOR_OPTIONS, getFolderColorHex } from "@utils/folderColors";
import { pickAndStoreImage } from "@utils/mediaPicker";

interface FolderNameModalProps {
  visible: boolean;
  onCancel: () => void;
  onConfirm: (payload: {
    name: string;
    color: string | null;
    description: string | null;
    photoPath: string | null;
    bannerPath: string | null;
  }) => void;
  initialName?: string;
  initialColor?: string | null;
  initialDescription?: string | null;
  initialPhotoPath?: string | null;
  initialBannerPath?: string | null;
  title?: string;
  confirmLabel?: string;
  submitting?: boolean;
}

export const FolderNameModal: React.FC<FolderNameModalProps> = ({
  visible,
  onCancel,
  onConfirm,
  initialName,
  initialColor,
  initialDescription,
  initialPhotoPath,
  initialBannerPath,
  title = "New folder",
  confirmLabel = "Create",
  submitting = false
}) => {
  const { theme } = useTheme();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>("blue");
  const [description, setDescription] = useState("");
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [bannerPath, setBannerPath] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName(initialName ?? "");
      setColor(initialColor ?? "blue");
      setDescription(initialDescription ?? "");
      setPhotoPath(initialPhotoPath ?? null);
      setBannerPath(initialBannerPath ?? null);
    }
  }, [initialBannerPath, initialColor, initialDescription, initialName, initialPhotoPath, visible]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              shadowColor: "#000"
            }
          ]}
        >
          <ScrollView contentContainerStyle={styles.content}>
            <Text variant="subtitle">{title}</Text>
            <Text muted style={{ marginTop: spacing.xs }}>
              Add details to make your folders easier to find.
            </Text>

            <TextInput
              autoFocus
              value={name}
              onChangeText={setName}
              placeholder="Folder name"
              placeholderTextColor={theme.colors.textSecondary}
              style={[
                styles.input,
                {
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                  backgroundColor: theme.colors.background
                }
              ]}
            />

            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Description (optional)"
              placeholderTextColor={theme.colors.textSecondary}
              multiline
              style={[
                styles.textArea,
                {
                  borderColor: theme.colors.border,
                  color: theme.colors.textPrimary,
                  backgroundColor: theme.colors.background
                }
              ]}
            />

            <Text style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>Folder photo (optional)</Text>
            <View style={styles.mediaRow}>
              <Pressable
                disabled={submitting}
                onPress={async () => {
                  if (submitting) return;
                  const picked = await pickAndStoreImage("folder-photo");
                  if (picked) setPhotoPath(picked);
                }}
                style={[styles.mediaButton, { borderColor: theme.colors.border }]}
              >
                <Text>Upload photo</Text>
              </Pressable>
              {!!photoPath && (
                <Pressable disabled={submitting} onPress={() => setPhotoPath(null)} style={styles.secondaryButtonInline}>
                  <Text muted>Remove</Text>
                </Pressable>
              )}
            </View>
            {!!photoPath && <Image source={{ uri: photoPath }} style={styles.photoPreview} resizeMode="cover" />}

            <Text style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>Folder banner (optional)</Text>
            <View style={styles.mediaRow}>
              <Pressable
                disabled={submitting}
                onPress={async () => {
                  if (submitting) return;
                  const picked = await pickAndStoreImage("folder-banner");
                  if (picked) setBannerPath(picked);
                }}
                style={[styles.mediaButton, { borderColor: theme.colors.border }]}
              >
                <Text>Upload banner</Text>
              </Pressable>
              {!!bannerPath && (
                <Pressable disabled={submitting} onPress={() => setBannerPath(null)} style={styles.secondaryButtonInline}>
                  <Text muted>Remove</Text>
                </Pressable>
              )}
            </View>
            {!!bannerPath && <Image source={{ uri: bannerPath }} style={styles.bannerPreview} resizeMode="cover" />}

            <Text style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>Folder color</Text>
            <View style={styles.colorRow}>
              {FOLDER_COLOR_OPTIONS.map((option) => {
                const isSelected = color === option.value;
                const swatchColor = getFolderColorHex(option.value, theme.colors.primary);

                return (
                  <Pressable
                    key={option.key}
                    disabled={submitting}
                    onPress={() => setColor(option.value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${option.label} color`}
                    style={[
                      styles.colorSwatch,
                      {
                        backgroundColor: swatchColor,
                        borderColor: isSelected ? theme.colors.textPrimary : theme.colors.border,
                        transform: [{ scale: isSelected ? 1.05 : 1 }]
                      }
                    ]}
                  />
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable disabled={submitting} onPress={onCancel} style={[styles.secondaryButton, submitting && styles.disabledButton]}>
              <Text muted>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={submitting}
              onPress={() => {
                if (submitting) return;
                if (!name.trim()) return;
                onConfirm({
                  name: name.trim(),
                  color,
                  description: description.trim() ? description.trim() : null,
                  photoPath,
                  bannerPath
                });
              }}
              style={[styles.primaryButton, { backgroundColor: theme.colors.primary }, submitting && styles.disabledButton]}
            >
              {submitting ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.onPrimary} />
                  <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>{confirmLabel}...</Text>
                </>
              ) : (
                <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>{confirmLabel}</Text>
              )}
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
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md
  },
  card: {
    width: "100%",
    borderRadius: 22,
    padding: spacing.md,
    maxHeight: "88%",
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10
  },
  content: {
    paddingBottom: spacing.sm
  },
  input: {
    marginTop: spacing.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 18
  },
  textArea: {
    marginTop: spacing.sm,
    minHeight: 78,
    textAlignVertical: "top",
    paddingVertical: 12,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth
  },
  colorRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  mediaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  mediaButton: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm
  },
  secondaryButtonInline: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs
  },
  photoPreview: {
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
  colorSwatch: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 2
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
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    minWidth: 132
  },
  disabledButton: {
    opacity: 0.7
  }
});

