import { getDB, runDbWrite } from "@db/database";
import { getAllFiles } from "@services/filesService";
import { getAllFolders } from "@services/foldersService";
import { getAllNotes } from "@services/notesService";
import { getAllTasks } from "@services/tasksService";

const PROFILE_KEY = "profile_state_v1";

export type ProfileSectionType = "folder" | "files" | "notes";

export interface ProfileUser {
  id: string;
  name: string;
  username: string;
  bio: string;
  avatar: string;
  banner: string;
  updatedAt: number;
}

export interface ProfileSectionItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUri?: string;
  refId?: string;
}

export interface ProfileSection {
  id: string;
  title: string;
  type: ProfileSectionType;
  itemIds: string[];
}

export interface ProfileState {
  version: 1;
  user: ProfileUser;
  sections: ProfileSection[];
  contributions: Record<string, number>;
  meta: {
    localUpdatedAt: number;
    syncState: "local-only" | "pending-sync" | "synced";
  };
}

const uuid = (): string =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });

const dateKeyFromTimestamp = (value: number): string => {
  const date = new Date(value);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const clampContribution = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.round(value)));
};

const DEFAULT_STATE = (): ProfileState => {
  const now = Date.now();
  return {
    version: 1,
    user: {
      id: uuid(),
      name: "Seu Nome",
      username: "username",
      bio: "Escreva sua bio aqui.\nEstilo README, com múltiplas linhas.",
      avatar: "",
      banner: "",
      updatedAt: now
    },
    sections: [
      { id: uuid(), title: "Programação", type: "folder", itemIds: [] },
      { id: uuid(), title: "Projetos", type: "files", itemIds: [] },
      { id: uuid(), title: "Anotações", type: "notes", itemIds: [] }
    ],
    contributions: {},
    meta: {
      localUpdatedAt: now,
      syncState: "local-only"
    }
  };
};

const parseProfileState = (raw: string | null): ProfileState => {
  if (!raw) return DEFAULT_STATE();
  try {
    const parsed = JSON.parse(raw) as Partial<ProfileState>;
    const fallback = DEFAULT_STATE();

    const user = parsed.user
      ? {
          id: typeof parsed.user.id === "string" && parsed.user.id ? parsed.user.id : fallback.user.id,
          name: typeof parsed.user.name === "string" ? parsed.user.name : fallback.user.name,
          username: typeof parsed.user.username === "string" ? parsed.user.username : fallback.user.username,
          bio: typeof parsed.user.bio === "string" ? parsed.user.bio : fallback.user.bio,
          avatar: typeof parsed.user.avatar === "string" ? parsed.user.avatar : "",
          banner: typeof parsed.user.banner === "string" ? parsed.user.banner : "",
          updatedAt: Number(parsed.user.updatedAt ?? fallback.user.updatedAt)
        }
      : fallback.user;

    const sections = Array.isArray(parsed.sections)
      ? parsed.sections
          .filter((section): section is ProfileSection => {
            return (
              !!section &&
              typeof section.id === "string" &&
              typeof section.title === "string" &&
              (section.type === "folder" || section.type === "files" || section.type === "notes")
            );
          })
          .map((section) => ({
            ...section,
            itemIds: Array.isArray(section.itemIds) ? section.itemIds.map(String) : []
          }))
      : fallback.sections;

    const contributions: Record<string, number> = {};
    if (parsed.contributions && typeof parsed.contributions === "object") {
      Object.entries(parsed.contributions).forEach(([key, value]) => {
        contributions[key] = clampContribution(Number(value));
      });
    }

    return {
      version: 1,
      user,
      sections: sections.length > 0 ? sections : fallback.sections,
      contributions,
      meta: {
        localUpdatedAt: Number(parsed.meta?.localUpdatedAt ?? fallback.meta.localUpdatedAt),
        syncState:
          parsed.meta?.syncState === "pending-sync" || parsed.meta?.syncState === "synced"
            ? parsed.meta.syncState
            : "local-only"
      }
    };
  } catch {
    return DEFAULT_STATE();
  }
};

const writeProfileState = async (state: ProfileState): Promise<void> => {
  await runDbWrite(
    "INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    PROFILE_KEY,
    JSON.stringify(state)
  );
};

const buildTaskContributions = async (): Promise<Record<string, number>> => {
  const tasks = await getAllTasks();
  const map: Record<string, number> = {};

  tasks.forEach((task) => {
    const completedDates = Array.isArray(task.completedDates) ? task.completedDates : [];
    completedDates.forEach((dayKey) => {
      map[dayKey] = (map[dayKey] ?? 0) + 1;
    });

    if (task.completed && completedDates.length === 0) {
      const fallbackDay = task.scheduledDate || dateKeyFromTimestamp(task.updatedAt || Date.now());
      map[fallbackDay] = (map[fallbackDay] ?? 0) + 1;
    }
  });

  return map;
};

const mergeContributions = (local: Record<string, number>, tasks: Record<string, number>): Record<string, number> => {
  const merged: Record<string, number> = { ...local };
  Object.entries(tasks).forEach(([day, amount]) => {
    merged[day] = Math.max(clampContribution(merged[day] ?? 0), clampContribution(amount));
  });
  return merged;
};

export const getProfileState = async (): Promise<ProfileState> => {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM app_meta WHERE key = ?", PROFILE_KEY);
  const current = parseProfileState(row?.value ?? null);

  const taskContrib = await buildTaskContributions();
  const mergedContributions = mergeContributions(current.contributions, taskContrib);

  if (JSON.stringify(mergedContributions) !== JSON.stringify(current.contributions)) {
    const nextState: ProfileState = {
      ...current,
      contributions: mergedContributions,
      meta: {
        ...current.meta,
        localUpdatedAt: Date.now(),
        syncState: "pending-sync"
      }
    };
    await writeProfileState(nextState);
    return nextState;
  }

  return current;
};

export const saveProfileState = async (state: ProfileState): Promise<ProfileState> => {
  const nextState: ProfileState = {
    ...state,
    version: 1,
    meta: {
      ...state.meta,
      localUpdatedAt: Date.now(),
      syncState: "pending-sync"
    },
    user: {
      ...state.user,
      updatedAt: Date.now()
    }
  };

  await writeProfileState(nextState);
  return nextState;
};

export const createEmptySection = (type: ProfileSectionType = "folder"): ProfileSection => ({
  id: uuid(),
  title: type === "folder" ? "Nova seção" : type === "files" ? "Arquivos" : "Anotações",
  type,
  itemIds: []
});

export const buildSectionItems = async (
  section: ProfileSection,
  limit = 10
): Promise<ProfileSectionItem[]> => {
  if (section.type === "folder") {
    const folders = (await getAllFolders()).filter((folder) => folder.parentId == null);
    const orderedIds = section.itemIds.length > 0 ? section.itemIds : folders.map((folder) => folder.id);
    const byId = new Map(folders.map((folder) => [folder.id, folder]));

    return orderedIds
      .map((id) => byId.get(id))
      .filter((folder): folder is NonNullable<typeof folder> => !!folder)
      .slice(0, limit)
      .map((folder) => ({
        id: folder.id,
        title: folder.name,
        subtitle: folder.description || "Pasta",
        imageUri: folder.photoPath ?? folder.bannerPath ?? undefined,
        refId: folder.id
      }));
  }

  if (section.type === "files") {
    const files = await getAllFiles();
    const orderedIds = section.itemIds.length > 0 ? section.itemIds : files.map((file) => file.id);
    const byId = new Map(files.map((file) => [file.id, file]));

    return orderedIds
      .map((id) => byId.get(id))
      .filter((file): file is NonNullable<typeof file> => !!file)
      .slice(0, limit)
      .map((file) => ({
        id: file.id,
        title: file.name,
        subtitle: file.type.toUpperCase(),
        imageUri: file.thumbnailPath ?? file.bannerPath ?? (file.type === "image" ? file.path : undefined),
        refId: file.id
      }));
  }

  const notes = await getAllNotes();
  const orderedIds = section.itemIds.length > 0 ? section.itemIds : notes.map((note) => note.id);
  const byId = new Map(notes.map((note) => [note.id, note]));

  return orderedIds
    .map((id) => byId.get(id))
    .filter((note): note is NonNullable<typeof note> => !!note)
    .slice(0, limit)
    .map((note) => ({
      id: note.id,
      title: note.title,
      subtitle: (note.content || "").slice(0, 56),
      refId: note.id
    }));
};
