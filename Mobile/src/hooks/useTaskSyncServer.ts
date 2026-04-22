import { useEffect } from "react";
import { startTaskSyncServer, stopTaskSyncServer } from "@services/sync/taskSyncServer";
import { isExpoGo, shouldLogDev } from "@utils/runtimeEnv";
import { log, warn, error as logError } from '@utils/logger';

export const useTaskSyncServer = () => {
  useEffect(() => {
    if (isExpoGo) {
      if (shouldLogDev) {
        log("[sync] Skipping local WebSocket server in Expo Go.");
      }
      return;
    }

    let mounted = true;

    startTaskSyncServer()
      .then((result) => {
        if (!mounted || !result?.url) return;
        if (shouldLogDev) {
          log(`[sync] connect web client at ${result.url}`);
        }
      })
      .catch((error) => {
        warn("[sync] failed to start", error);
      });

    return () => {
      mounted = false;
      stopTaskSyncServer();
    };
  }, []);
};
