import React, { useCallback } from "react";
import { View, Text, FlatList, StyleSheet, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "@hooks/useTheme";
import { useNotificationsStore } from "@store/useNotificationsStore";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import type { Notification } from "@models/types";

const getRelativeTime = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function NotificationsScreen() {
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const notifications = useNotificationsStore((s) => s.notifications);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);

  // Automatically mark all as read when entering the screen
  useFocusEffect(
    useCallback(() => {
      markAllAsRead();
    }, [markAllAsRead])
  );

  const handleNotificationPress = async (notif: Notification) => {
    await markAsRead(notif.id);
    if (notif.taskId) {
      navigation.navigate("Tabs", {
        screen: "Tasks",
        params: { focusTaskId: notif.taskId }
      });
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const isUnread = item.read === 0;

    return (
      <Pressable
        onPress={() => handleNotificationPress(item)}
        style={[
          styles.itemContainer,
          { backgroundColor: theme.colors.card, borderBottomColor: theme.colors.border },
          isUnread && { backgroundColor: theme.colors.surfaceElevated }
        ]}
      >
        <View style={styles.iconContainer}>
          <View style={[styles.dot, { backgroundColor: isUnread ? theme.colors.primary : "transparent" }]} />
          <Ionicons 
            name={item.taskId ? "checkmark-done-circle" : "notifications"} 
            size={24} 
            color={isUnread ? theme.colors.primary : theme.colors.textSecondary} 
          />
        </View>
        
        <View style={styles.content}>
          <View style={styles.header}>
            <Text 
              style={[
                styles.title, 
                { color: theme.colors.textPrimary },
                isUnread && styles.boldText
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={[styles.time, { color: theme.colors.textSecondary }]}>
              {getRelativeTime(item.receivedAt)}
            </Text>
          </View>
          <Text 
            style={[
              styles.body, 
              { color: theme.colors.textSecondary },
              isUnread && { color: theme.colors.textPrimary }
            ]} 
            numberOfLines={2}
          >
            {item.body}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }} edges={["left", "right"]}>
      <View style={[styles.screenHeader, { borderBottomColor: theme.colors.border }]}>
        <Text style={[styles.screenTitle, { color: theme.colors.textPrimary }]}>History</Text>
        <Pressable onPress={() => markAllAsRead()}>
          <Text style={{ color: theme.colors.primary, fontSize: 13, fontWeight: "600" }}>Mark all as read</Text>
        </Pressable>
      </View>

      {notifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="notifications-off-outline" size={48} color={theme.colors.textSecondary} />
          <Text style={{ color: theme.colors.textSecondary, fontSize: 16, marginTop: 12 }}>No notifications yet</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screenHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  listContent: {
    paddingBottom: 40,
  },
  itemContainer: {
    flexDirection: "row",
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  iconContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    marginRight: 8,
  },
  boldText: {
    fontWeight: "800",
  },
  time: {
    fontSize: 12,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    opacity: 0.6,
  },
});
