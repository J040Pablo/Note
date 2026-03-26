import Constants from "expo-constants";

export const isExpoGo =
  Constants.executionEnvironment === "storeClient" ||
  Constants.appOwnership === "expo";

export const shouldLogDev = __DEV__;
