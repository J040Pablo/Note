import "react-native-gesture-handler";
import { registerRootComponent } from "expo";
import { Platform, UIManager } from "react-native";
import App from "./App";

const isFabric = !!global.nativeFabricUIManager;
if (Platform.OS === "android" && isFabric && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental = () => {};
}

// Register the main component so Expo can run it
registerRootComponent(App);

