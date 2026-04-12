import React, { memo, useCallback, useMemo } from "react";
import { View, Text as RNText, StyleSheet, Pressable } from "react-native";
import { useTheme } from "@hooks/useTheme";
import type { Link } from "@utils/linkUtils";
import { stringToLink } from "@utils/linkUtils";

interface RichHtmlDisplayProps {
  html: string;
  onLinkPress?: (link: Link) => void;
}

/**
 * Renderiza HTML com suporte a links
 * Parse simples para demonstração
 */
const RichHtmlDisplay = memo(function RichHtmlDisplay({
  html,
  onLinkPress
}: RichHtmlDisplayProps) {
  const { theme } = useTheme();

  const renderContent = useMemo(() => {
    if (!html) return [];

    const parts: React.ReactElement[] = [];
    const regex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;

    let lastIndex = 0;
    let match;

    while ((match = regex.exec(html)) !== null) {
      // Adicione texto antes do link
      if (match.index > lastIndex) {
        const beforeText = html.substring(lastIndex, match.index);
        if (beforeText) {
          parts.push(
            <RNText key={`text-${lastIndex}`}>
              {beforeText}
            </RNText>
          );
        }
      }

      // Adicione o link
      const href = match[1];
      const text = match[2];
      const link = stringToLink(href);

      if (link) {
        parts.push(
          <LinkText
            key={`link-${match.index}`}
            href={href}
            text={text}
            link={link}
            onPress={onLinkPress}
            theme={theme}
          />
        );
      }

      lastIndex = regex.lastIndex;
    }

    // Adicione texto final
    if (lastIndex < html.length) {
      const finalText = html.substring(lastIndex);
      if (finalText) {
        parts.push(
          <RNText key={`text-${lastIndex}`}>
            {finalText}
          </RNText>
        );
      }
    }

    return parts;
  }, [html, onLinkPress, theme]);

  return <RNText>{renderContent}</RNText>;
});

interface LinkTextProps {
  href: string;
  text: string;
  link: Link;
  onPress?: (link: Link) => void;
  theme: any;
}

const LinkText = memo(function LinkText({
  href,
  text,
  link,
  onPress,
  theme
}: LinkTextProps) {
  const handlePress = useCallback(() => {
    onPress?.(link);
  }, [link, onPress]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        { opacity: pressed ? 0.7 : 1 }
      ]}
    >
      <RNText
        style={[
          styles.linkText,
          { color: theme.colors.primary }
        ]}
      >
        {text}
      </RNText>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  linkText: {
    textDecorationLine: "underline",
    fontSize: 16
  }
});

export default RichHtmlDisplay;
