import React from "react";
import { Platform } from "react-native";
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
import ImportFolderPackageScreen from "@screens/ImportFolderPackageScreen";
import TasksScreen from "@screens/TasksScreen";
import SettingsScreen from "@screens/SettingsScreen";
import NotificationsScreen from "@screens/NotificationsScreen";
import { useTheme } from "@hooks/useTheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  NoteEditor: { noteId?: string; folderId?: string | null };
  QuickNote: { quickNoteId?: string; folderId?: string | null };
  PdfViewer: { path: string; name: string };
  ImageViewer: { path: string; name: string };
  SaveSharedFile: { uri: string; name?: string; mimeType?: string | null };
  ImportFolderPackage: { destinationFolderId?: string | null } | undefined;
  Notifications: undefined;
};

export type FoldersStackParamList = {
  FoldersRoot: undefined;
  FolderDetail: { folderId: string | null; trail?: string[]; from?: "home" | "folders" };
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
        animationDuration: 40,
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
          animationDuration: 21.25
        }}
      />
    </FolderStack.Navigator>
  );
};

const TabsNavigator = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          position: "absolute",
          left: 24,
          right: 24,
          bottom: Math.max(insets.bottom + 16, 24),
          height: 68,
          borderRadius: 34,
          backgroundColor: theme.colors.card,
          borderTopWidth: 0,
          elevation: 14,
          shadowColor: "#000",
          shadowOpacity: 0.15,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
          paddingHorizontal: 8,
          paddingBottom: 0,
          paddingTop: 0,
        },
        tabBarItemStyle: {
          flex: 1,
        },
        tabBarIconStyle: {
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        },
        tabBarIcon: ({ color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";
          if (route.name === "Home") iconName = "home";
          if (route.name === "Search") iconName = "search";
          if (route.name === "Folders") iconName = "folder";
          if (route.name === "Tasks") iconName = "checkmark-done";
          if (route.name === "Settings") iconName = "settings";
          
          return (
            <Ionicons 
               name={iconName} 
               size={size} 
               color={color}
            />
          );
        },
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
        animationDuration: 40,
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
          animationDuration: 35
        }}
      />
      <RootStack.Screen
        name="QuickNote"
        component={QuickNoteScreen}
        options={{
          headerShown: false,
          title: "Quick Note",
          animation: "slide_from_right",
          animationDuration: 35
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
      <RootStack.Screen
        name="ImportFolderPackage"
        component={ImportFolderPackageScreen}
        options={{
          title: "Import Package",
          presentation: "modal",
          animation: "slide_from_bottom"
        }}
      />
      <RootStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: true,
          title: "Notifications",
          animation: "slide_from_right"
        }}
      />
    </RootStack.Navigator>
  );
};

export default RootNavigator;