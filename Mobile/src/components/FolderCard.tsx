import React, { memo, useMemo } from "react";
import { View, StyleSheet, Pressable, Image, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { FolderIcon } from "@components/FolderIcon";
import { SelectionIndicator } from "@components/SelectionIndicator";
import { useTheme } from "@hooks/useTheme";
import { useValidatedImageUri } from "@hooks/useValidatedImageUri";
import type { Folder } from "@models/types";

interface FolderCardProps {
  folder: Folder;
  onPress: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  isLoading?: boolean;
  variant?: "default" | "compact";
  selected?: boolean;
}

const CARD_HEIGHT = 130;
const BANNER_HEIGHT = 64;

const FolderCard = memo(({
  folder,
  onPress,
  onLongPress,
  style,
  isLoading = false,
  variant = "default",
  selected = false
}: FolderCardProps) => {
  const { theme } = useTheme();
  const validatedBannerPath = useValidatedImageUri(folder.bannerPath);
  const validatedPhotoPath = useValidatedImageUri(folder.photoPath);


  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.container,
        variant === "compact" && styles.containerCompact,
        style,
        {
          height: variant === "compact" ? undefined : CARD_HEIGHT,
          backgroundColor: theme.colors.card,
          borderColor: selected ? theme.colors.primary : theme.colors.border,
          borderWidth: 2,
          opacity: isLoading ? 0.6 : 1
        }
      ]}
      disabled={isLoading}
    >
      {/* Banner */}
      {variant !== "compact" && (
      <View style={{ height: BANNER_HEIGHT }}>
        {validatedBannerPath ? (
          <Image
            source={{ uri: validatedBannerPath }}
            style={{ width: "100%", height: BANNER_HEIGHT }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: "100%",
              height: BANNER_HEIGHT,
              backgroundColor: theme.colors.primaryAlpha20
            }}
          />
        )}
      </View>
      )}

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.iconRow}>
          {validatedPhotoPath ? (
            <Image
              source={{ uri: validatedPhotoPath }}
              style={styles.icon}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.iconPlaceholder}>
              <FolderIcon
                color={folder.color}
                fallbackColor={theme.colors.primary}
                size={24}
              />
            </View>
          )}
          <View style={styles.textContent}>
            <Text
              style={[
                styles.title,
                { color: theme.colors.textPrimary }
              ]}
              numberOfLines={1}
            >
              {folder.name}
            </Text>
            {folder.description && variant !== "compact" && (
              <Text
                muted
                variant="caption"
                numberOfLines={1}
                style={styles.description}
              >
                {folder.description}
              </Text>
            )}
          </View>
        </View>

        {/* Footer with count or action */}
        {variant !== "compact" && (
        <View style={styles.footer}>
          <Ionicons
            name="folder-outline"
            size={14}
            color={theme.colors.textSecondary}
          />
          <Text variant="caption" muted>
            Folder
          </Text>
        </View>
        )}
      </View>

      {/* Overlay effect on press */}
      {isLoading && (
        <View
          style={[
            styles.overlay,
            { backgroundColor: "rgba(0,0,0,0.3)" }
          ]}
        />
      )}

      <SelectionIndicator visible={selected} />
    </Pressable>
  );
}) as React.MemoExoticComponent<React.FC<FolderCardProps>>;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
  },
  containerCompact: {
    height: 100,
    width: 140,
    justifyContent: "center"
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "space-between",
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  iconPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  textContent: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 16,
  },
  description: {
    fontSize: 11,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});

export default FolderCard;
