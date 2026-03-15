import React from "react";
import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { useTheme } from "@hooks/useTheme";

interface TextProps extends RNTextProps {
  variant?: "title" | "subtitle" | "body" | "caption";
  muted?: boolean;
}

export const Text: React.FC<TextProps> = ({
  children,
  variant = "body",
  muted,
  style,
  ...rest
}) => {
  const { theme } = useTheme();

  const fontSize =
    variant === "title" ? 22 : variant === "subtitle" ? 16 : variant === "caption" ? 12 : 14;
  const fontWeight = variant === "title" ? "600" : variant === "subtitle" ? "500" : "400";

  return (
    <RNText
      {...rest}
      style={[
        {
          color: muted ? theme.colors.textMuted : theme.colors.text,
          fontSize,
          fontWeight
        },
        style
      ]}
    >
      {children}
    </RNText>
  );
};

