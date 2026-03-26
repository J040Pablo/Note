export type TaskPriority = "low" | "medium" | "high";

export type TaskItem = {
  id: string;
  title: string;
  completed: boolean;
  priority: TaskPriority;
  dueDate: string | null;
  dueTime: string | null;
  repeatDays: number[];
  order: number;
  createdAt: number;
  updatedAt: number;
};

export type TaskDraft = {
  title: string;
  priority: TaskPriority;
  dueDate: string;
  dueTime: string;
  repeatDays: number[];
  scheduleMode: "selected" | "custom" | "none";
};

export type TaskFilters = {
  date: "all" | "selected" | "no-date";
  priority: "all" | TaskPriority;
  status: "all" | "completed" | "pending";
  query: string;
};
