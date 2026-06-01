import React, { useState, useEffect } from "react";
import { Modal, View, StyleSheet, TextInput, Pressable, Image, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, spacing } from "@hooks/useTheme";
import { Text } from "./Text";
import { FOLDER_COLOR_OPTIONS, getFolderColorHex } from "@utils/folderColors";
import { pickAndSaveImage, deleteImage } from "@services/imageService";

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
      <KeyboardAvoidingView
        style={styles.modalKeyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
      >
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
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
            >
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

              <Text style={{ marginTop: spacing.md, marginBottom: spacing.xs }}>Folder media (optional)</Text>
              <View style={styles.mediaActionsGrid}>
                <Pressable
                  disabled={submitting}
                  onPress={async () => {
                    if (submitting) return;
                    const picked = await pickAndSaveImage("folder-photo");
                    if (picked) {
                      if (photoPath) await deleteImage(photoPath);
                      setPhotoPath(picked);
                    }
                  }}
                  style={[
                    styles.mediaActionCard,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }
                  ]}
                >
                  <View style={[styles.mediaActionIcon, { backgroundColor: theme.colors.primary + "18" }]}>
                    <Ionicons name="camera-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.mediaActionCopy}>
                    <Text style={styles.mediaActionTitle}>Change Photo</Text>
                    <Text muted style={styles.mediaActionSubtitle}>
                      Add a cover image for this folder
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Pressable>

                <Pressable
                  disabled={submitting}
                  onPress={async () => {
                    if (submitting) return;
                    const picked = await pickAndSaveImage("folder-banner");
                    if (picked) {
                      if (bannerPath) await deleteImage(bannerPath);
                      setBannerPath(picked);
                    }
                  }}
                  style={[
                    styles.mediaActionCard,
                    { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }
                  ]}
                >
                  <View style={[styles.mediaActionIcon, { backgroundColor: theme.colors.primary + "18" }]}>
                    <Ionicons name="image-outline" size={18} color={theme.colors.primary} />
                  </View>
                  <View style={styles.mediaActionCopy}>
                    <Text style={styles.mediaActionTitle}>Change Banner</Text>
                    <Text muted style={styles.mediaActionSubtitle}>
                      Use a wide header image
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                </Pressable>
              </View>

              <View style={styles.previewRow}>
                {!!photoPath && (
                  <View style={styles.previewBlock}>
                    <Image source={{ uri: photoPath }} style={styles.photoPreview} resizeMode="cover" />
                    <Pressable disabled={submitting} onPress={() => setPhotoPath(null)} style={styles.removeChip}>
                      <Text muted style={styles.removeChipText}>Remove photo</Text>
                    </Pressable>
                  </View>
                )}

                {!!bannerPath && (
                  <View style={[styles.previewBlock, styles.bannerPreviewBlock]}>
                    <Image source={{ uri: bannerPath }} style={styles.bannerPreview} resizeMode="cover" />
                    <Pressable disabled={submitting} onPress={() => setBannerPath(null)} style={styles.removeChip}>
                      <Text muted style={styles.removeChipText}>Remove banner</Text>
                    </Pressable>
                  </View>
                )}
              </View>

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
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalKeyboardAvoid: {
    flex: 1
  },
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
    paddingBottom: spacing.md
  },
  modalScroll: {
    maxHeight: "100%"
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
  mediaActionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  mediaActionCard: {
    flexGrow: 1,
    flexBasis: 160,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  mediaActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center"
  },
  mediaActionCopy: {
    flex: 1,
    gap: 2
  },
  mediaActionTitle: {
    fontWeight: "700"
  },
  mediaActionSubtitle: {
    fontSize: 12,
    lineHeight: 16
  },
  previewRow: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  previewBlock: {
    flexGrow: 1,
    flexBasis: 140,
    gap: 8
  },
  bannerPreviewBlock: {
    flexBasis: 220
  },
  photoPreview: {
    width: 64,
    height: 64,
    borderRadius: 16
  },
  bannerPreview: {
    width: "100%",
    height: 92,
    borderRadius: 16
  },
  removeChip: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(127,127,127,0.12)"
  },
  removeChipText: {
    fontSize: 12,
    fontWeight: "600"
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

