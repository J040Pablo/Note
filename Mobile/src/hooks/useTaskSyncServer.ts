import { useEffect } from "react";
import { startTaskSyncServer, stopTaskSyncServer } from "@services/sync/taskSyncServer";
import { isExpoGo, shouldLogDev } from "@utils/runtimeEnv";
import { log, warn, error as logError } from '@utils/logger';

export const useTaskSyncServer = () => {
  useEffect(() => {
    if (isExpoGo) {
      return;
    }

    let mounted = true;

    startTaskSyncServer()
      .then((result) => {
        if (!mounted || !result?.url) return;
      })
      .catch((error) => {
      });

    return () => {
      mounted = false;
      stopTaskSyncServer();
    };
  }, []);
};
