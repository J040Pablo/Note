import React, { memo, useCallback, useMemo } from "react";
import {
  View,
  TextInput,
  Text as RNText,
  StyleSheet,
  Pressable,
  type TextInputProps,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData
} from "react-native";
import type { Link } from "@utils/linkUtils";
import { stringToLink, extractLinksFromHtml } from "@utils/linkUtils";

interface TextBlockWithLinksProps extends TextInputProps {
  isSelected: boolean;
  onLinkPress?: (link: Link) => void;
  testID?: string;
}

/**
 * TextInput wrapper que permite cliques em links mesmo durante edição.
 * Solução: Renderiza overlay com links clicáveis quando não está focado.
 */
export const TextBlockWithLinks = memo(function TextBlockWithLinks({
  value,
  isSelected,
  onLinkPress,
  onFocus,
  onBlur,
  ...props
}: TextBlockWithLinksProps) {
  const [isFocused, setIsFocused] = React.useState(false);

  const handleFocus = useCallback(
    (e: NativeSyntheticEvent<any>) => {
      setIsFocused(true);
      onFocus?.(e);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (e: NativeSyntheticEvent<any>) => {
      setIsFocused(false);
      onBlur?.(e);
    },
    [onBlur]
  );

  // Se está focado ou não é selecionado, apenas renderiza TextInput normal
  if (isFocused || !isSelected) {
    return (
      <TextInput
        {...props}
        value={value}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  }

  // Se NÃO está focado, renderiza versão interativa com links clicáveis
  const text = typeof value === "string" ? value : "";

  return (
    <View>
      <TextInput
        {...props}
        value={text}
        onFocus={handleFocus}
        onBlur={handleBlur}
        editable={false}
        selectTextOnFocus={false}
        style={[props.style, { opacity: 0 }]}
        pointerEvents="none"
      />
      <ReadableTextWithLinks
        text={text}
        style={props.style}
        onLinkPress={onLinkPress}
      />
    </View>
  );
});

interface ReadableTextWithLinksProps {
  text: string;
  style?: any;
  onLinkPress?: (link: Link) => void;
}

const ReadableTextWithLinks = memo(function ReadableTextWithLinks({
  text,
  style,
  onLinkPress
}: ReadableTextWithLinksProps) {
  const links = useMemo(() => extractLinksFromHtml(text), [text]);

  if (links.length === 0) {
    return <RNText style={style}>{text}</RNText>;
  }

  const parts: React.ReactElement[] = [];
  let lastIndex = 0;

  // Encontrar todas as tags <a> e renderizar com clique
  const regex = /<a\s+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Adicionar texto antes do link
    if (match.index > lastIndex) {
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) {
        parts.push(
          <RNText key={`text-${lastIndex}`} style={style}>
            {beforeText}
          </RNText>
        );
      }
    }

    // Adicionar link clicável
    const href = match[1];
    const linkText = match[2];
    const link = stringToLink(href);

    if (link) {
      parts.push(
        <ClickableLink
          key={`link-${match.index}`}
          link={link}
          text={linkText}
          style={style}
          onPress={() => onLinkPress?.(link)}
        />
      );
    }

    lastIndex = regex.lastIndex;
  }

  // Adicionar texto final
  if (lastIndex < text.length) {
    const finalText = text.substring(lastIndex);
    if (finalText) {
      parts.push(
        <RNText key={`text-final`} style={style}>
          {finalText}
        </RNText>
      );
    }
  }

  return <RNText style={style}>{parts}</RNText>;
});

interface ClickableLinkProps {
  link: Link;
  text: string;
  style?: any;
  onPress?: () => void;
}

const ClickableLink = memo(function ClickableLink({
  link,
  text,
  style,
  onPress
}: ClickableLinkProps) {
  return (
    <Pressable onPress={onPress} hitSlop={4}>
      <RNText
        style={[
          style,
          {
            color: "#2563eb",
            textDecorationLine: "underline"
          }
        ]}
      >
        {text}
      </RNText>
    </Pressable>
  );
});
