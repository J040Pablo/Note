import React, { useState } from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@hooks/useTheme";

export default function NotificationsScreen() {
  const { theme } = useTheme();
  // Basic empty state as requested
  const [notifications, setNotifications] = useState([]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["top", "left", "right"]}>
      {notifications.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16 }}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item: any) => item.id}
          renderItem={({ item }) => (
            <View style={{ padding: 16, backgroundColor: theme.colors.card, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
              <Text style={{ color: theme.colors.textPrimary }}>{item.message}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
