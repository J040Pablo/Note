import React from "react";
import { useTranslation } from "react-i18next";

import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Folder, Trash2 } from "lucide-react";
import CanvasEditor from "../components/CanvasEditor";
import {
  parseCanvasNoteContent,
  serializeCanvasNoteContent,
  createEmptyCanvasNote,
  type CanvasNoteDocument,
} from "../../../utils/noteContent";
import {
  getNoteById,
  createNote,
  updateNote,
  deleteNote,
} from "../../../services/notesService.web";
import { subscribeSyncBridge } from "../../../services/syncBridge";
import { useAppMode } from "../../../app/mode";
import type { DataNote } from "../../../services/webData";
import styles from "./NoteEditorPage.module.css";

const NoteEditorPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mode } = useAppMode();
  const isMobileSync = mode === "mobile-sync";
  const isNew = id === "new";

  // Load existing note or start fresh
  const [note, setNote] = React.useState<DataNote | null>(() =>
    isNew ? null : (id ? getNoteById(id) : null)
  );
  const [title, setTitle] = React.useState(note?.title ?? "");
  const [document, setDocument] = React.useState<CanvasNoteDocument>(() => {
    if (note?.content) {
      return parseCanvasNoteContent(note.content);
    }
    return createEmptyCanvasNote();
  });
  const [saving, setSaving] = React.useState(false);
  const [isInteracting, setIsInteracting] = React.useState(false);
  
  const [lastSavedTitle, setLastSavedTitle] = React.useState(note?.title ?? "");
  const [lastSavedContent, setLastSavedContent] = React.useState(
    note?.content ?? ""
  );

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = React.useRef(false);
  const creatingRef = React.useRef(false);

  // Derive folderId from URL search params
  const folderId = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("folderId") ?? note?.folderId ?? note?.parentId ?? null;
  }, [note]);

  // Get folder name for badge
  const folderName = React.useMemo(() => {
    if (!folderId) return null;
    try {
      const { getFolders } = require("../../../services/webData");
      const folders = getFolders();
      const folder = folders.find((f: { id: string; name: string }) => f.id === folderId);
      return folder?.name ?? null;
    } catch {
      return null;
    }
  }, [folderId]);

  const currentContent = React.useMemo(
    () => serializeCanvasNoteContent(document),
    [document]
  );

  const hasPendingChanges = React.useMemo(
    () => title !== lastSavedTitle || currentContent !== lastSavedContent,
    [title, lastSavedTitle, currentContent, lastSavedContent]
  );

  // ─── Persist ──────────────────────────────────────────────────────────────

  const persistNote = React.useCallback(
    async (options?: { allowCreate?: boolean }) => {
      if (savingRef.current) return;
      if (!note && creatingRef.current) return;
      const allowCreate = options?.allowCreate ?? false;

      const normalizedTitle = title.trim() || t("untitled");
      const serialized = currentContent;

      if (!note && !title.trim() && document.elements.length === 0) {
        return;
      }

      if (!hasPendingChanges && note) return;
      if (!note && !allowCreate) return;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      savingRef.current = true;
      setSaving(true);

      try {
        if (note) {
          const saved = updateNote({
            ...note,
            title: normalizedTitle,
            content: serialized,
          });
          setNote(saved);
          setLastSavedTitle(saved.title);
          setLastSavedContent(saved.content);
        } else {
          creatingRef.current = true;
          const saved = createNote({
            title: normalizedTitle,
            content: serialized,
            folderId: folderId,
          });
          setNote(saved);
          setLastSavedTitle(saved.title);
          setLastSavedContent(saved.content);

          // Update URL to real note ID without adding history entry
          window.history.replaceState(null, "", `/notes/${saved.id}`);
        }
      } catch (err) {
        console.error("[note] save failed", err);
      } finally {
        creatingRef.current = false;
        savingRef.current = false;
        setSaving(false);
      }
    },
    [document, folderId, hasPendingChanges, note, title, t, currentContent]
  );

  // Autosave with debounce
  React.useEffect(() => {
    if (!hasPendingChanges || isInteracting) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistNote({ allowCreate: true });
    }, 1000); // 1s debounce for stability

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [hasPendingChanges, isInteracting, persistNote]);

  // Sync incoming updates
  React.useEffect(() => {
    if (!isMobileSync || !note) return;
    const unsub = subscribeSyncBridge((event) => {
      if (event.type === "NOTE_DELETE" && event.id === note.id) {
        navigate(-1);
        return;
      }

      if (event.type !== "NOTE_UPSERT" || event.note.id !== note.id) return;
      
      // Safety: Ignore remote updates if user is actively editing
      if (isInteracting) return;

      const incoming = event.note;
      setNote((prev) => {
        if (!prev) return prev;
        if ((incoming.updatedAt ?? 0) <= (prev.updatedAt ?? 0)) return prev;

        // One final check: if incoming content matches our local current content, skip
        if (incoming.content === currentContent && incoming.title === title) return prev;

        const updated = {
          ...prev,
          title: incoming.title,
          content: incoming.content,
          updatedAt: incoming.updatedAt,
        };

        setTitle(incoming.title);
        setDocument(parseCanvasNoteContent(incoming.content));
        setLastSavedTitle(incoming.title);
        setLastSavedContent(incoming.content);
        return updated;
      });
    });
    return unsub;
  }, [isMobileSync, note, isInteracting, title, currentContent]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleBack = React.useCallback(() => {
    if (hasPendingChanges) {
      persistNote({ allowCreate: true });
    }
    navigate(-1);
  }, [hasPendingChanges, navigate, persistNote]);

  const handleDelete = React.useCallback(() => {
    if (!note) {
      navigate(-1);
      return;
    }
    const confirmed = window.confirm(t("deleteNoteConfirm"));
    if (!confirmed) return;

    deleteNote(note.id);
    navigate(-1);
  }, [navigate, note, t]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.editorPage} style={{ maxWidth: "none", paddingBottom: 0, display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className={styles.editorBody} style={{ flex: 1, margin: 0, minHeight: 0, height: "100vh" }}>
        <CanvasEditor 
          document={document} 
          onChange={setDocument} 
          onInteractionChange={setIsInteracting}
          title={title}
          onTitleChange={setTitle}
          onTitleBlur={() => persistNote({ allowCreate: true })}
          onBack={handleBack}
          saving={saving}
          folderName={folderName}
          noteId={note?.id}
        />
      </div>
    </div>
  );
};

export default NoteEditorPage;
