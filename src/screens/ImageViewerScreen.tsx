import React from "react";
import { View, StyleSheet, Image } from "react-native";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "@navigation/RootNavigator";

type ImageRoute = RouteProp<RootStackParamList, "ImageViewer">;

const ImageViewerScreen: React.FC = () => {
  const route = useRoute<ImageRoute>();
  const fileUri = route.params.path.startsWith("file://") ? route.params.path : `file://${route.params.path}`;

  return (
    <Screen style={styles.screen}>
      <Text variant="subtitle" numberOfLines={1} style={styles.title}>
        {route.params.name}
      </Text>
      <View style={styles.imageWrap}>
        <Image source={{ uri: fileUri }} style={styles.image} resizeMode="contain" />
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create({
  screen: {
    paddingTop: 0
  },
  title: {
    marginBottom: 8
  },
  imageWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden"
  },
  image: {
    width: "100%",
    height: "100%"
  }
});

export default ImageViewerScreen;
