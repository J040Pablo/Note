import React, { memo } from "react";
import { View, StyleSheet, Pressable, Image, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { FolderIcon } from "@components/FolderIcon";
import { useTheme } from "@hooks/useTheme";
import type { Folder } from "@models/types";

interface FolderCardProps {
  folder: Folder;
  onPress: () => void;
  onLongPress?: () => void;
  style?: ViewStyle;
  isLoading?: boolean;
}

const FolderCard = memo(({
  folder,
  onPress,
  onLongPress,
  style,
  isLoading = false
}: FolderCardProps) => {
  const { theme } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.container,
        style,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          opacity: isLoading ? 0.6 : 1
        }
      ]}
      disabled={isLoading}
    >
      {/* Banner */}
      <View style={styles.bannerContainer}>
        {folder.bannerPath ? (
          <Image
            source={{ uri: folder.bannerPath }}
            style={styles.banner}
            resizeMode="cover"
          />
        ) : (
          <View
            style={[
              styles.bannerPlaceholder,
              { backgroundColor: theme.colors.primaryAlpha20 }
            ]}
          />
        )}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.iconRow}>
          {folder.photoPath ? (
            <Image
              source={{ uri: folder.photoPath }}
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
              numberOfLines={2}
            >
              {folder.name}
            </Text>
            {folder.description && (
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
    </Pressable>
  );
}) as React.MemoExoticComponent<React.FC<FolderCardProps>>;

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "#fff",
    height: 200,
  },
  bannerContainer: {
    width: "100%",
    height: 100,
    overflow: "hidden",
  },
  banner: {
    width: "100%",
    height: "100%",
  },
  bannerPlaceholder: {
    width: "100%",
    height: "100%",
  },
  content: {
    flex: 1,
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
