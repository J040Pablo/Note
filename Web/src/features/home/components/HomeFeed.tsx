import React from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Folder, CheckSquare, type LucideIcon } from "lucide-react";

import { getAllTasks, toggleTaskForDate } from "../../../services/tasksService.web";
import { getAllNotes, getAllQuickNotes } from "../../../services/notesService.web";
import { getFolders } from "../../../services/webData";
import { getPinnedItems, getRecentItems, togglePinnedItem, addRecentOpen } from "../../../services/appMetaService.web";
import { useAppMode } from "../../../app/mode";
import { subscribeSyncBridge } from "../../../services/syncBridge";
import { quickRichNoteDocToText } from "../../../utils/quickRichNote";

import QuickAccessSection from "./sections/QuickAccessSection";
import MyFoldersSection from "./sections/MyFoldersSection";
import TaskOverviewSection from "./sections/TaskOverviewSection";
import TodayTasksSection from "./sections/TodayTasksSection";

import styles from "./HomeFeed.module.css";

const toDateKey = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const HomeFeed: React.FC = () => {
  const navigate = useNavigate();
  const { mode } = useAppMode();
  const isMobileSync = mode === "mobile-sync";

  const [tasks, setTasks] = React.useState(() => getAllTasks());
  const [folders, setFolders] = React.useState(() => getFolders());
  const [notes, setNotes] = React.useState(() => getAllNotes());
  const [quickNotes, setQuickNotes] = React.useState(() => getAllQuickNotes());
  const [pinned, setPinned] = React.useState(() => getPinnedItems());
  const [recent, setRecent] = React.useState(() => getRecentItems());

  const refreshData = React.useCallback(() => {
    setTasks(getAllTasks());
    setFolders(getFolders());
    setNotes(getAllNotes());
    setQuickNotes(getAllQuickNotes());
    setPinned(getPinnedItems());
    setRecent(getRecentItems());
  }, []);

  React.useEffect(() => {
    const unsub = subscribeSyncBridge(() => refreshData());
    return () => unsub();
  }, [refreshData]);

  // Calculations
  const todayKey = toDateKey(new Date());
  const todayTasks = React.useMemo(() => 
    tasks.filter(t => t.scheduledDate === todayKey || (t.repeatDays && t.repeatDays.length > 0)),
    [tasks, todayKey]
  );

  const completedToday = React.useMemo(() => 
    todayTasks.filter(t => t.completedDates?.includes(todayKey)).length,
    [todayTasks, todayKey]
  );

  const totalTasks = tasks.length;
  const totalCompleted = tasks.filter(t => t.completed).length;

  const quickAccessItems = React.useMemo(() => {
    // 1. Get pinned items first
    const pinnedItems = pinned.map(p => {
      if (p.type === "folder") {
        const folder = folders.find(f => f.id === p.id);
        if (!folder) return null;
        return {
          id: folder.id,
          type: "folder" as const,
          label: folder.name,
          subtitle: "Folder",
          icon: Folder,
          isPinned: true
        };
      }
      if (p.type === "note") {
        const note = notes.find(n => n.id === p.id) || quickNotes.find(q => q.id === p.id);
        if (!note) return null;
        const title = (note as any).title || "Quick Note";
        const text = (note as any).content || (note as any).text || "";
        return {
          id: note.id,
          type: "note" as const,
          label: title,
          subtitle: quickRichNoteDocToText(text).slice(0, 40),
          icon: FileText,
          isPinned: true
        };
      }
      return null;
    }).filter(Boolean);

    // 2. Get recent items that aren't already pinned
    const pinnedIds = new Set(pinnedItems.map(p => p?.id));
    const recentItems = recent.filter(r => !pinnedIds.has(r.id)).map(r => {
      if (r.type === "folder") {
        const folder = folders.find(f => f.id === r.id);
        if (!folder) return null;
        return {
          id: folder.id,
          type: "folder" as const,
          label: folder.name,
          subtitle: "Folder",
          icon: Folder,
          isPinned: false
        };
      }
      if (r.type === "note") {
        const note = notes.find(n => n.id === r.id) || quickNotes.find(q => q.id === r.id);
        if (!note) return null;
        const title = (note as any).title || "Note";
        const text = (note as any).content || (note as any).text || "";
        return {
          id: note.id,
          type: "note" as const,
          label: title,
          subtitle: quickRichNoteDocToText(text).slice(0, 40),
          icon: FileText,
          isPinned: false
        };
      }
      return null;
    }).filter(Boolean);

    // Combine and limit to 4
    return [...pinnedItems, ...recentItems].slice(0, 4) as any[];
  }, [pinned, recent, folders, notes, quickNotes]);

  // Handlers
  const handleToggleTask = React.useCallback((id: string) => {
    toggleTaskForDate(id, todayKey);
    refreshData();
  }, [todayKey, refreshData]);

  const handleTogglePin = React.useCallback((type: any, id: string) => {
    togglePinnedItem(type, id);
    refreshData();
  }, [refreshData]);

  const handleItemClick = React.useCallback((item: any) => {
    if (item.type === "folder") {
      addRecentOpen("folder", item.id);
      navigate(`/folders?id=${item.id}`);
    } else {
      addRecentOpen("note", item.id);
      const isQuick = quickNotes.some(q => q.id === item.id);
      navigate(isQuick ? `/quicknotes/${item.id}` : `/notes/${item.id}`);
    }
  }, [navigate, quickNotes]);

  return (
    <div className={styles.grid}>
      <QuickAccessSection 
        items={quickAccessItems} 
        onItemClick={handleItemClick}
        onTogglePin={handleTogglePin}
      />
      
      <MyFoldersSection 
        folders={folders.map(f => ({
          id: f.id,
          name: f.name,
          notes: notes.filter(n => n.parentId === f.id).length
        }))}
        onFolderClick={(id) => navigate(`/folders?id=${id}`)}
      />

      <TaskOverviewSection 
        total={totalTasks} 
        completed={totalCompleted} 
        todayCount={todayTasks.length} 
      />

      <TodayTasksSection 
        tasks={todayTasks.map(t => ({
          id: t.id,
          text: t.title,
          completed: t.completedDates?.includes(todayKey) ?? false
        }))}
        onToggle={handleToggleTask}
      />
    </div>
  );
};

export default HomeFeed;