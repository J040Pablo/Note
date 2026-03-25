import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import HomeScreen from "@screens/HomeScreen";
import SearchScreen from "@screens/SearchScreen";
import FoldersScreen from "@screens/FoldersScreen";
import FolderDetailScreen from "@screens/FolderDetailScreen";
import NoteEditorScreen from "@screens/NoteEditorScreen";
import QuickNoteScreen from "@screens/QuickNoteScreen";
import PdfViewerScreen from "@screens/PdfViewerScreen";
import ImageViewerScreen from "@screens/ImageViewerScreen";
import SaveSharedFileScreen from "@screens/SaveSharedFileScreen";
import TasksScreen from "@screens/TasksScreen";
import SettingsScreen from "@screens/SettingsScreen";
import { useTheme } from "@hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  NoteEditor: { noteId?: string; folderId?: string | null };
  QuickNote: { quickNoteId?: string; folderId?: string | null };
  PdfViewer: { path: string; name: string };
  ImageViewer: { path: string; name: string };
  SaveSharedFile: { uri: string; name?: string; mimeType?: string | null };
};

export type FoldersStackParamList = {
  FoldersRoot: undefined;
  FolderDetail: { folderId: string | null; trail?: string[] };
};

export type TabsParamList = {
  Home: undefined;
  Search: undefined;
  Folders: NavigatorScreenParams<FoldersStackParamList> | undefined;
  Tasks: { focusTaskId?: string; dateKey?: string; openCreate?: boolean } | undefined;
  Settings: undefined;
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
        animationDuration: 160,
        fullScreenGestureEnabled: true,
        gestureEnabled: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: true,
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
        options={{
          headerShown: false,
          title: "Folder",
          animation: "slide_from_right",
          animationDuration: 85
        }}
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
          borderTopColor: theme.colors.border,
          borderTopWidth: 1,
          elevation: 4,
          shadowColor: "#000000",
          shadowOpacity: 0.2,
          shadowRadius: 6,
          shadowOffset: { width: 0, height: -2 }
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";
          if (route.name === "Home") iconName = "home";
          if (route.name === "Search") iconName = "search";
          if (route.name === "Folders") iconName = "folder";
          if (route.name === "Tasks") iconName = "checkmark-done";
          if (route.name === "Settings") iconName = "settings";
          return <Ionicons name={iconName} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Search" component={SearchScreen} />
      <Tab.Screen name="Folders" component={FoldersStackNavigator} />
      <Tab.Screen name="Tasks" component={TasksScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
};

const RootNavigator = () => {
  const { theme } = useTheme();
  return (
    <RootStack.Navigator
      screenOptions={{
        animation: "slide_from_right",
        animationDuration: 160,
        fullScreenGestureEnabled: true,
        gestureEnabled: true,
        animationTypeForReplace: "push",
        presentation: "card",
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: true,
        headerTintColor: theme.colors.textPrimary,
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
          title: "Note",
          animation: "slide_from_right",
          animationDuration: 140
        }}
      />
      <RootStack.Screen
        name="QuickNote"
        component={QuickNoteScreen}
        options={{
          headerShown: false,
          title: "Quick Note",
          animation: "slide_from_right",
          animationDuration: 140
        }}
      />
      <RootStack.Screen
        name="PdfViewer"
        component={PdfViewerScreen}
        options={{ title: "PDF", animation: "slide_from_right" }}
      />
      <RootStack.Screen
        name="ImageViewer"
        component={ImageViewerScreen}
          options={{ title: "Image", animation: "slide_from_right" }}
      />
      <RootStack.Screen
        name="SaveSharedFile"
        component={SaveSharedFileScreen}
        options={{ title: "Save File", animation: "slide_from_bottom" }}
      />
    </RootStack.Navigator>
  );
};

export default RootNavigator;

