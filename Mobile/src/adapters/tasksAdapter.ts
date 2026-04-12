import type { AppItem, ItemAdapter } from "@domain/items/types";
import type { ID, Task } from "@models/types";
import { useTasksStore } from "@store/useTasksStore";
import { deleteTask, moveTask, reorderTasks, updateTask } from "@services/tasksService";
import { togglePinnedItem } from "@services/appMetaService";
import { Share } from "react-native";

const toItem = (task: Task): AppItem => ({
  kind: "task",
  id: task.id,
  parentId: task.parentId ?? null
});

export const tasksAdapter: ItemAdapter = {
  kind: "task",
  getItems: () => Object.values(useTasksStore.getState().tasks).map(toItem),
  update: async (item: Task) => {
    const updated = await updateTask(item);
    useTasksStore.getState().upsertTask(updated);
  },
  delete: async (id: string) => {
    await deleteTask(id);
    useTasksStore.getState().removeTask(id);
  },
  move: async (id: string, parentId: string | null) => {
    const updated = await moveTask(id as ID, parentId as ID | null);
    useTasksStore.getState().upsertTask(updated);
  },
  reorder: async (ids: string[]) => {
    const orderedIds = ids as ID[];
    useTasksStore.getState().reorderTasksInStore(orderedIds);
    await reorderTasks(orderedIds);
  },
  pin: async (id: string) => {
    await togglePinnedItem("task", id);
  },
  share: async (id: string) => {
    const current = useTasksStore.getState().tasks[id as ID];
    if (!current) return;
    await Share.share({ title: current.text, message: current.text });
  }
};
