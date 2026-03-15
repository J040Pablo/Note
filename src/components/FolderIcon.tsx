import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getFolderColorHex } from "@utils/folderColors";

interface FolderIconProps {
  color?: string | null;
  fallbackColor: string;
  size?: number;
}

export const FolderIcon: React.FC<FolderIconProps> = ({
  color,
  fallbackColor,
  size = 18
}) => {
  const iconColor = getFolderColorHex(color, fallbackColor);

  return (
    <View style={[styles.wrapper, { backgroundColor: `${iconColor}18` }]}>
      <Ionicons name="folder-outline" size={size} color={iconColor} />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    flexShrink: 0
  }
});
