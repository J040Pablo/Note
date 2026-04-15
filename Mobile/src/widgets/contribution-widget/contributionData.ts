/**
 * contributionData.ts
 *
 * Pure data logic: computes contribution counts from a task list.
 * This module has NO side effects — it is safe to call from any context.
 *
 * Source of truth: SQLite (loaded into Zustand store), read via tasks array.
 * Widget only receives aggregated { date → count } maps — NEVER raw task data.
 */

export type ContributionDay = {
  /** YYYY-MM-DD */
  date: string;
  completedCount: number;
};

export type ContributionMap = Record<string, number>;

// ──────────────────────────────────────────────────────────────────────
// Date helpers (no moment.js / date-fns — zero deps)
// ──────────────────────────────────────────────────────────────────────

/**
 * Returns YYYY-MM-DD for a given Date using local time.
 * Avoids UTC offset bugs that `toISOString()` introduces.
 */
export function toDateKey(date: Date | number | string | null | undefined): string {
  let d: Date;
  if (!date) {
    d = new Date();
  } else if (typeof date === 'string') {
    // If already a YYYY-MM-DD string, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    d = new Date(date);
  } else if (typeof date === 'number') {
    d = new Date(date);
  } else {
    d = date;
  }

  if (isNaN(d.getTime())) return toDateKey(new Date());

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dy = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dy}`;
}

/** Returns the date key for today in local time. */
export function todayKey(): string {
  return toDateKey(new Date());
}

/**
 * Returns an array of date keys for the past `days` days (inclusive of today).
 * Index 0 = oldest, index (days-1) = today.
 */
export function buildDateRange(days: number): string[] {
  const result: string[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    result.push(toDateKey(d));
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Aggregation
// ──────────────────────────────────────────────────────────────────────

export interface MinimalTask {
  completed?: boolean;
  completedDates?: string[];
  scheduledDate?: string | null;
  updatedAt?: number;
}

/**
 * Computes a ContributionMap (date → count) from an array of tasks.
 *
 * Counting rules:
 *  - Recurring task: each date in `completedDates` counts as one completion.
 *  - One-time task (completed=true): uses `scheduledDate` if set, else falls
 *    back to the date derived from `updatedAt`.
 *
 * Only dates within the last `windowDays` days are included.
 */
export function buildContributionMap(
  tasks: MinimalTask[],
  windowDays: number = 70
): ContributionMap {
  const dateRange = buildDateRange(windowDays);
  const validDates = new Set(dateRange);

  // Initialise every key to 0
  const map: ContributionMap = {};
  for (const d of dateRange) {
    map[d] = 0;
  }

  for (const task of tasks) {
    // Recurring tasks: use completedDates array
    const recurringDates = Array.isArray(task.completedDates)
      ? task.completedDates
      : [];

    if (recurringDates.length > 0) {
      for (const raw of recurringDates) {
        const key = toDateKey(raw);
        if (validDates.has(key)) {
          map[key] = (map[key] ?? 0) + 1;
        }
      }
      continue; // don't double-count recurring tasks
    }

    // One-time tasks: must be completed
    if (task.completed) {
      const key = task.scheduledDate
        ? toDateKey(task.scheduledDate)
        : toDateKey(new Date(task.updatedAt ?? Date.now()));

      if (validDates.has(key)) {
        map[key] = (map[key] ?? 0) + 1;
      }
    }
  }

  return map;
}

/**
 * Returns just today's completed task count from a set of tasks.
 * Used for fast incremental updates after a single task completion.
 */
export function countCompletedToday(tasks: MinimalTask[]): number {
  const today = todayKey();
  let count = 0;

  for (const task of tasks) {
    // Recurring
    if (Array.isArray(task.completedDates) && task.completedDates.length > 0) {
      if (task.completedDates.some((d) => toDateKey(d) === today)) {
        count += 1;
      }
      continue;
    }
    // One-time
    if (task.completed) {
      const key = task.scheduledDate
        ? toDateKey(task.scheduledDate)
        : toDateKey(new Date(task.updatedAt ?? Date.now()));
      if (key === today) count += 1;
    }
  }

  return count;
}

/**
 * Converts a ContributionMap to a sorted ContributionDay array.
 */
export function mapToContributionDays(map: ContributionMap): ContributionDay[] {
  return Object.entries(map)
    .map(([date, completedCount]) => ({ date, completedCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
