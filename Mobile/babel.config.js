module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
          alias: {
            "@components": "./src/components",
            "@screens": "./src/screens",
            "@navigation": "./src/navigation",
            "@store": "./src/store",
            "@database": "./src/database",
            "@db": "./src/db",
            "@models": "./src/models",
            "@services": "./src/services",
            "@hooks": "./src/hooks",
            "@utils": "./src/utils",
            "@engines": "./src/engines",
            "@domain": "./src/domain",
            "@adapters": "./src/adapters",
            "@config": "./src/config"
          }
        }
      ],
      "react-native-reanimated/plugin"
    ]
  };
};

