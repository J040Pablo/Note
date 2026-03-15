import React from "react";
import { Ionicons } from "@expo/vector-icons";
import type { AppFileType } from "@models/types";
import { useTheme } from "@hooks/useTheme";

interface FileIconProps {
  type: AppFileType;
  size?: number;
}

export const FileIcon: React.FC<FileIconProps> = ({ type, size = 18 }) => {
  const { theme } = useTheme();

  const iconName: keyof typeof Ionicons.glyphMap =
    type === "pdf" ? "document-text-outline" : type === "image" ? "image-outline" : "document-outline";

  const color =
    type === "pdf" ? theme.colors.danger : type === "image" ? theme.colors.accent : theme.colors.textSecondary;

  return <Ionicons name={iconName} size={size} color={color} />;
};
