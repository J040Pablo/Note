import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import HomeScreen from "@screens/HomeScreen";
import FoldersScreen from "@screens/FoldersScreen";
import FolderDetailScreen from "@screens/FolderDetailScreen";
import NoteEditorScreen from "@screens/NoteEditorScreen";
import TasksScreen from "@screens/TasksScreen";
import { useTheme } from "@hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  NoteEditor: { noteId?: string; folderId?: string | null };
};

export type FoldersStackParamList = {
  FoldersRoot: undefined;
  FolderDetail: { folderId: string | null; trail?: string[] };
};

export type TabsParamList = {
  Home: undefined;
  Folders: NavigatorScreenParams<FoldersStackParamList> | undefined;
  Tasks: undefined;
};

const RootStack = createNativeStackNavigator<RootStackParamList>();
const FolderStack = createNativeStackNavigator<FoldersStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

const FoldersStackNavigator = () => {
  const { theme } = useTheme();

  return (
    <FolderStack.Navigator
      screenOptions={{
        animation: "slide_from_right",
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: false,
        headerTintColor: theme.colors.textPrimary,
        contentStyle: { backgroundColor: theme.colors.background }
      }}
    >
      <FolderStack.Screen
        name="FoldersRoot"
        component={FoldersScreen}
        options={{ headerShown: false }}
      />
      <FolderStack.Screen
        name="FolderDetail"
        component={FolderDetailScreen}
        options={{ title: "Folder" }}
      />
    </FolderStack.Navigator>
  );
};

const TabsNavigator = () => {
  const { theme } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        lazy: true,
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";
          if (route.name === "Home") iconName = "home";
          if (route.name === "Folders") iconName = "folder";
          if (route.name === "Tasks") iconName = "checkmark-done";
          return <Ionicons name={iconName} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Folders" component={FoldersStackNavigator} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
    </Tab.Navigator>
  );
};

const RootNavigator = () => {
  const { theme } = useTheme();
  return (
    <RootStack.Navigator
      screenOptions={{
        animation: "slide_from_right",
        fullScreenGestureEnabled: true,
        animationTypeForReplace: "push",
        detachPreviousScreen: true,
        presentation: "card",
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: false,
        headerTintColor: theme.colors.textPrimary,
        headerBackTitleVisible: false,
        headerBackVisible: true,
        contentStyle: { backgroundColor: theme.colors.background }
      }}
    >
      <RootStack.Screen
        name="Tabs"
        component={TabsNavigator}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="NoteEditor"
        component={NoteEditorScreen}
        options={{
          headerShown: false,
          title: "Note"
        }}
      />
    </RootStack.Navigator>
  );
};

export default RootNavigator;

