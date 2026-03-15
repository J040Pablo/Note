import React from "react";
import { View } from "react-native";

interface SwipeActionsRowProps {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const SwipeActionsRow: React.FC<SwipeActionsRowProps> = ({
  children
}) => {
  return <View>{children}</View>;
};
