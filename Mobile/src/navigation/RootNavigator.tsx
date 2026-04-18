import React from "react";
import { Easing } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator } from "@react-navigation/stack";
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
import ProfileScreen from "@screens/ProfileScreen";
import NotificationsScreen from "@screens/NotificationsScreen";
import { useTheme } from "@hooks/useTheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabsParamList> | undefined;
  Settings: undefined;
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
  FolderDetail: { folderId: string | null; trail?: string[] };
};

export type TabsParamList = {
  Home: undefined;
  Search: undefined;
  Folders: NavigatorScreenParams<FoldersStackParamList> | undefined;
  Tasks: { focusTaskId?: string; dateKey?: string; openCreate?: boolean } | undefined;
  Profile: undefined;
};

const RootStack = createStackNavigator<RootStackParamList>();
const FolderStack = createStackNavigator<FoldersStackParamList>();
const Tab = createBottomTabNavigator<TabsParamList>();

const FAST_OVERLAY_TRANSITION = {
  gestureEnabled: true,
  gestureDirection: "horizontal" as const,
  transitionSpec: {
    open: {
      animation: "timing" as const,
      config: {
        duration: 200,
        easing: Easing.out(Easing.poly(4))
      }
    },
    close: {
      animation: "timing" as const,
      config: {
        duration: 200,
        easing: Easing.out(Easing.poly(4))
      }
    }
  },
  cardStyleInterpolator: ({ current, layouts }: { current: { progress: any }; layouts: { screen: { width: number } } }) => ({
    cardStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.width, 0]
          })
        }
      ]
    }
  })
};

const FoldersStackNavigator = () => {
  const { theme } = useTheme();

  return (
    // @ts-ignore - React Navigation type mismatch with id prop
    <FolderStack.Navigator
      id="FolderStack"
      screenOptions={{
        ...FAST_OVERLAY_TRANSITION,
        detachPreviousScreen: false,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.textPrimary,
        cardStyle: { backgroundColor: theme.colors.background }
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
          ...FAST_OVERLAY_TRANSITION,
          detachPreviousScreen: false
        }}
      />
    </FolderStack.Navigator>
  );
};

const TabsNavigator = () => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    // @ts-ignore - React Navigation type mismatch with id prop
    <Tab.Navigator
      id="BottomTab"
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
          bottom: Math.max(insets.bottom + 8, 16),
          height: 68,
          borderRadius: 34,
          backgroundColor: theme.colors.surfaceElevated,
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
          if (route.name === "Profile") iconName = "person";
          
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
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const RootNavigator = () => {
  const { theme } = useTheme();
  return (
    // @ts-ignore - React Navigation type mismatch with id prop
    <RootStack.Navigator
      id="RootStack"
      screenOptions={{
        ...FAST_OVERLAY_TRANSITION,
        presentation: "card",
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.textPrimary,
        cardStyle: { backgroundColor: theme.colors.background }
      }}
    >
      <RootStack.Screen
        name="Tabs"
        component={TabsNavigator}
        options={{ headerShown: false }}
      />
      <RootStack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          headerShown: false
        }}
      />
      <RootStack.Screen
        name="NoteEditor"
        component={NoteEditorScreen}
        options={{
          headerShown: false,
          title: "Note"
        }}
      />
      <RootStack.Screen
        name="QuickNote"
        component={QuickNoteScreen}
        options={{
          headerShown: false,
          title: "Quick Note"
        }}
      />
      <RootStack.Screen
        name="PdfViewer"
        component={PdfViewerScreen}
        options={{ title: "PDF" }}
      />
      <RootStack.Screen
        name="ImageViewer"
        component={ImageViewerScreen}
        options={{ title: "Image" }}
      />
      <RootStack.Screen
        name="SaveSharedFile"
        component={SaveSharedFileScreen}
        options={{ title: "Save File" }}
      />
      <RootStack.Screen
        name="ImportFolderPackage"
        component={ImportFolderPackageScreen}
        options={{
          title: "Import Package",
          presentation: "modal"
        }}
      />
      <RootStack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          headerShown: true,
          title: "Notifications"
        }}
      />
    </RootStack.Navigator>
  );
};

export default RootNavigator;