import React from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { useTheme } from "@hooks/useTheme";

type PdfRoute = RouteProp<RootStackParamList, "PdfViewer">;

const PdfViewerScreen: React.FC = () => {
  const route = useRoute<PdfRoute>();
  const { theme } = useTheme();

  const fileUri = route.params.path.startsWith("file://") ? route.params.path : `file://${route.params.path}`;

  return (
    <Screen style={styles.screen}>
      <View style={styles.header}>
        <Text variant="subtitle" numberOfLines={1}>
          {route.params.name}
        </Text>
      </View>
      <View style={[styles.viewerWrap, { borderColor: theme.colors.border }]}> 
        <WebView
          source={{ uri: fileUri }}
          style={styles.viewer}
          originWhitelist={["*"]}
          allowFileAccess
          allowingReadAccessToURL={fileUri}
          startInLoadingState
          scalesPageToFit
          setBuiltInZoomControls
          setDisplayZoomControls={false}
        />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0
  },
  header: {
    marginBottom: 8
  },
  viewerWrap: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden"
  },
  viewer: {
    flex: 1
  }
});

export default PdfViewerScreen;
