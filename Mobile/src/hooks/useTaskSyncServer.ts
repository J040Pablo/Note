import { useEffect } from "react";
import { startTaskSyncServer, stopTaskSyncServer } from "@services/sync/taskSyncServer";
import { isExpoGo, shouldLogDev } from "@utils/runtimeEnv";

export const useTaskSyncServer = () => {
  useEffect(() => {
    if (isExpoGo) {
      if (shouldLogDev) {
        console.info("[sync] Skipping local WebSocket server in Expo Go.");
      }
      return;
    }

    let mounted = true;

    startTaskSyncServer()
      .then((result) => {
        if (!mounted || !result?.url) return;
        if (shouldLogDev) {
          console.info(`[sync] connect web client at ${result.url}`);
        }
      })
      .catch((error) => {
        console.warn("[sync] failed to start", error);
      });

    return () => {
      mounted = false;
      stopTaskSyncServer();
    };
  }, []);
};
