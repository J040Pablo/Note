import React, { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "@hooks/useTheme";
import type { Link } from "@utils/linkUtils";
import { stringToLink } from "@utils/linkUtils";

interface LinkRendererProps {
  href: string;
  text: string;
  onLinkPress?: (link: Link) => void;
}

const LinkRenderer = memo(function LinkRenderer({
  href,
  text,
  onLinkPress
}: LinkRendererProps) {
  const { theme } = useTheme();

  const handlePress = useCallback(() => {
    const link = stringToLink(href);
    if (link && onLinkPress) {
      onLinkPress(link);
    }
  }, [href, onLinkPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.link,
        { opacity: pressed ? 0.7 : 1 }
      ]}
    >
      <Text
        style={[
          styles.linkText,
          { color: theme.colors.primary }
        ]}
      >
        {text}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  link: {
    paddingHorizontal: 2,
    paddingVertical: 1
  },
  linkText: {
    textDecorationLine: "underline",
    fontSize: 16
  }
});

export default LinkRenderer;
