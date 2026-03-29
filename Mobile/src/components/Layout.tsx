import React from "react";
import { View, StyleSheet, ScrollView, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { Edge } from "react-native-safe-area-context";
import { useTheme } from "@hooks/useTheme";

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  edges?: Edge[];
}

export const Screen: React.FC<ScreenProps> = ({ children, scroll, style, edges = ["top", "right", "left"] }) => {
  const { theme } = useTheme();
  const Container = scroll ? ScrollView : View;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.background }]}
      edges={edges}
    >
      <Container
        style={[styles.container, { backgroundColor: theme.colors.background }, style]}
        contentContainerStyle={scroll ? styles.scrollContent : undefined}
      >
        {children}
      </Container>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12
  },
  scrollContent: {
    paddingBottom: 32
  }
});

