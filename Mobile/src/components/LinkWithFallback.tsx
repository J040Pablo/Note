import React, { useCallback, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { useTheme } from "@hooks/useTheme";
import { useLinkValidation } from "@hooks/useLinkValidation";
import type { Link } from "@utils/linkUtils";

interface LinkWithFallbackProps {
  link: Link;
  text: string;
  onPress?: (link: Link) => void;
}

export const LinkWithFallback = React.memo(function LinkWithFallback({
  link,
  text,
  onPress
}: LinkWithFallbackProps) {
  const { theme } = useTheme();
  const { isLinkValid, getLinkLabel } = useLinkValidation();

  const isValid = useMemo(() => isLinkValid(link), [link, isLinkValid]);
  const label = useMemo(() => getLinkLabel(link), [link, getLinkLabel]);

  if (!isValid) {
    return (
      <Pressable style={{ opacity: 0.5 }}>
        <Text
          style={{
            color: theme.colors.textSecondary,
            textDecorationLine: "line-through"
          }}
        >
          {text} (not found)
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => onPress?.(link)}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      <Text
        style={{
          color: theme.colors.primary,
          textDecorationLine: "underline"
        }}
      >
        {text}
      </Text>
    </Pressable>
  );
});
