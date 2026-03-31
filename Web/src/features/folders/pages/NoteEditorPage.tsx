import React from "react";
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
import {
  dispatchEntitySyncEvent,
  subscribeTaskSyncMessages,
} from "../../tasks/sync";
import { useAppMode } from "../../../app/mode";
import type { DataNote } from "../../../services/webData";
import styles from "./NoteEditorPage.module.css";

const NoteEditorPage: React.FC = () => {
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

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const normalizedTitle = title.trim() || "Untitled";
      const serialized = serializeCanvasNoteContent(document);

      if (!note && !title.trim() && document.elements.length === 0) {
        return;
      }

      if (!hasPendingChanges && note) return;
      if (!note && !allowCreate) return;

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

          if (isMobileSync) {
            dispatchEntitySyncEvent({
              type: "UPSERT_NOTE",
              payload: { ...saved, updatedAt: Date.now() },
            });
          }
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

          if (isMobileSync) {
            dispatchEntitySyncEvent({
              type: "UPSERT_NOTE",
              payload: { ...saved, updatedAt: Date.now() },
            });
          }

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
    [document, folderId, hasPendingChanges, isMobileSync, note, title]
  );

  // Autosave with debounce
  React.useEffect(() => {
    if (!hasPendingChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistNote({ allowCreate: true });
    }, 220);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [hasPendingChanges, persistNote]);

  // Sync incoming updates
  React.useEffect(() => {
    if (!isMobileSync || !note) return;
    const unsub = subscribeTaskSyncMessages((msg) => {
      if (msg.type === "UPSERT_NOTE" && msg.payload.id === note.id) {
        const incoming = msg.payload;
        setNote((prev) => {
          if (!prev) return prev;
          if (incoming.updatedAt <= (prev.updatedAt ?? 0)) return prev;
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
      }
    });
    return unsub;
  }, [isMobileSync, note]);

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
    const confirmed = window.confirm("Delete this note?");
    if (!confirmed) return;

    deleteNote(note.id);
    if (isMobileSync) {
      dispatchEntitySyncEvent({
        type: "DELETE_NOTE",
        payload: { id: note.id },
      });
    }
    navigate(-1);
  }, [isMobileSync, navigate, note]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.editorPage} style={{ maxWidth: "none", paddingBottom: 0, display: "flex", flexDirection: "column", height: "100vh" }}>
      <div className={styles.header} style={{ padding: "12px 24px" }}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={handleBack}
          title="Go back"
        >
          <ArrowLeft size={18} />
        </button>

        <input
          className={styles.titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => persistNote({ allowCreate: true })}
          placeholder="Note title..."
        />

        {folderName && (
          <div className={styles.folderBadge} style={{ marginBottom: 0, marginRight: "12px" }}>
            <Folder size={12} /> {folderName}
          </div>
        )}

        <div className={styles.headerActions}>
          {saving && <span className={styles.savingIndicator}>Saving...</span>}
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => persistNote({ allowCreate: true })}
          >
            <Check size={14} /> Save
          </button>
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={handleDelete}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className={styles.editorBody} style={{ flex: 1, margin: 0, minHeight: 0 }}>
        <CanvasEditor document={document} onChange={setDocument} />
      </div>
    </div>
  );
};

export default NoteEditorPage;
