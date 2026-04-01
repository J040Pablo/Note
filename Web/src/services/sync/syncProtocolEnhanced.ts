/**
 * Enhanced Sync Protocol with validators and better type conversions
 * (Web version - mirrors Mobile's syncProtocolEnhanced.ts)
 */

// ============= TYPES =============

export type SyncPriority = "low" | "medium" | "high";

export interface SyncTask {
  id: string;
  text?: string;
  title: string;
  completed: boolean;
  priority: SyncPriority;
  date: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  repeatDays?: number[];
  completedDates?: string[];
  order?: number;
  createdAt?: number;
  parentId?: string | null;
  noteId?: string | null;
  updatedAt: number;
}

export interface SyncNote {
  id: string;
  parentId: string | null;
  folderId?: string | null;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncQuickNote {
  id: string;
  title: string;
  content: string;
  text?: string;
  folderId?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface SyncFolder {
  id: string;
  parentId: string | null;
  name: string;
  description?: string;
  color?: string;
  createdAt: number;
  updatedAt: number;
  imageUrl?: string;
  bannerUrl?: string;
}

// ============= PRIORITY CONVERSION =============

export const toSyncPriority = (value: 0 | 1 | 2 | number): SyncPriority => {
  const num = Number(value);
  if (num <= 0) return "low";
  if (num >= 2) return "high";
  return "medium";
};

export const fromSyncPriority = (value?: SyncPriority | string | number): 0 | 1 | 2 => {
  if (value === "low" || value === 0) return 0;
  if (value === "high" || value === 2) return 2;
  return 1;
};

// ============= VALIDATORS =============

export interface ValidationError {
  field: string;
  message: string;
}

export const validateSyncTask = (task: unknown): ValidationError[] => {
  const errors: ValidationError[] = [];
  
  if (!task || typeof task !== "object") {
    errors.push({ field: "root", message: "Task must be an object" });
    return errors;
  }

  const t = task as Record<string, unknown>;

  // Required fields
  if (!t.id || typeof t.id !== "string") {
    errors.push({ field: "id", message: "Task id is required and must be a string" });
  }

  if (!t.title && !t.text) {
    errors.push({ field: "title", message: "Task must have title or text" });
  }

  if (typeof t.title !== "undefined" && typeof t.title !== "string") {
    errors.push({ field: "title", message: "Task title must be a string" });
  }

  if (typeof t.completed !== "boolean") {
    errors.push({ field: "completed", message: "Task completed must be a boolean" });
  }

  // Priority validation
  if (!["low", "medium", "high"].includes(String(t.priority))) {
    errors.push({ field: "priority", message: "Priority must be low, medium, or high" });
  }

  // Date format validation (YYYY-MM-DD)
  if (t.scheduledDate && typeof t.scheduledDate === "string") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.scheduledDate)) {
      errors.push({ field: "scheduledDate", message: "scheduledDate must be YYYY-MM-DD format" });
    }
  }

  // Time format validation (HH:mm)
  if (t.scheduledTime && typeof t.scheduledTime === "string") {
    if (!/^\d{2}:\d{2}$/.test(t.scheduledTime)) {
      errors.push({ field: "scheduledTime", message: "scheduledTime must be HH:mm format" });
    }
  }

  // Array validations
  if (t.repeatDays && !Array.isArray(t.repeatDays)) {
    errors.push({ field: "repeatDays", message: "repeatDays must be an array" });
  } else if (Array.isArray(t.repeatDays)) {
    if (!t.repeatDays.every((d) => typeof d === "number" && d >= 0 && d <= 6)) {
      errors.push({ field: "repeatDays", message: "repeatDays must contain numbers 0-6" });
    }
  }

  if (t.completedDates && !Array.isArray(t.completedDates)) {
    errors.push({ field: "completedDates", message: "completedDates must be an array" });
  } else if (Array.isArray(t.completedDates)) {
    if (!t.completedDates.every((d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d))) {
      errors.push({ field: "completedDates", message: "completedDates must be YYYY-MM-DD format" });
    }
  }

  // Timestamp
  if (!t.updatedAt || typeof t.updatedAt !== "number" || !Number.isFinite(t.updatedAt)) {
    errors.push({ field: "updatedAt", message: "updatedAt is required and must be a valid number" });
  }

  return errors;
};

export const validateSyncNote = (note: unknown): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!note || typeof note !== "object") {
    errors.push({ field: "root", message: "Note must be an object" });
    return errors;
  }

  const n = note as Record<string, unknown>;

  if (!n.id || typeof n.id !== "string") {
    errors.push({ field: "id", message: "Note id is required and must be a string" });
  }

  if (!n.title || typeof n.title !== "string") {
    errors.push({ field: "title", message: "Note title is required and must be a string" });
  }

  if (typeof n.content !== "string") {
    errors.push({ field: "content", message: "Note content must be a string" });
  }

  if (!n.updatedAt || typeof n.updatedAt !== "number") {
    errors.push({ field: "updatedAt", message: "Note updatedAt is required and must be a number" });
  }

  return errors;
};

export const validateSyncQuickNote = (note: unknown): ValidationError[] => {
  const errors: ValidationError[] = [];

  if (!note || typeof note !== "object") {
    errors.push({ field: "root", message: "QuickNote must be an object" });
    return errors;
  }

  const n = note as Record<string, unknown>;

  if (!n.id || typeof n.id !== "string") {
    errors.push({ field: "id", message: "QuickNote id is required and must be a string" });
  }

  if (typeof n.content !== "string" && typeof n.text !== "string") {
    errors.push({ field: "content", message: "QuickNote must have content or text" });
  }

  if (!n.updatedAt || typeof n.updatedAt !== "number") {
    errors.push({ field: "updatedAt", message: "QuickNote updatedAt is required and must be a number" });
  }

  return errors;
};

// ============= VALIDATION WITH LOGGING =============

export const validateAndLog = (entity: unknown, type: "task" | "note" | "quickNote"): boolean => {
  let errors: ValidationError[] = [];

  switch (type) {
    case "task":
      errors = validateSyncTask(entity);
      break;
    case "note":
      errors = validateSyncNote(entity);
      break;
    case "quickNote":
      errors = validateSyncQuickNote(entity);
      break;
  }

  if (errors.length > 0) {
    console.warn(`[Sync] Validation errors for ${type}:`, errors);
    return false;
  }

  return true;
};
