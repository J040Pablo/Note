import { useEffect } from "react";
import { startTaskSyncServer, stopTaskSyncServer } from "@services/sync/taskSyncServer";

export const useTaskSyncServer = () => {
  useEffect(() => {
    let mounted = true;

    startTaskSyncServer()
      .then((result) => {
        if (!mounted || !result?.url) return;
        console.log(`[sync] connect web client at ${result.url}`);
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
