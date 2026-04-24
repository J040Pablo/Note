import React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Folder, Trash2 } from "lucide-react";
import {
  getQuickNoteById,
  createQuickNote,
  updateQuickNote,
  deleteQuickNote,
} from "../../../services/notesService.web";
import { subscribeTaskSyncMessages } from "../../tasks/sync";
import { useAppMode } from "../../../app/mode";
import type { DataQuickNote } from "../../../services/webData";
import QuickRichNoteEditor from "../components/QuickRichNoteEditor";
import { parseQuickRichNoteDocument, serializeQuickRichNoteHtml } from "../../../utils/quickRichNote";
import styles from "./NoteEditorPage.module.css"; // Reuse Note styles for layout

const QuickNoteEditorPage: React.FC = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mode } = useAppMode();
  const isMobileSync = mode === "mobile-sync";
  const isNew = id === "new";

  // Load existing note or start fresh
  const [note, setNote] = React.useState<DataQuickNote | null>(() =>
    isNew ? null : (id ? getQuickNoteById(id) : null)
  );
  
  const [title, setTitle] = React.useState(note?.title ?? "");
  const [content, setContent] = React.useState(() => {
    const current = note?.content ?? "";
    const parsed = parseQuickRichNoteDocument(current);
    return parsed.blocks.map((block) => block.html).join("");
  });
  const [saving, setSaving] = React.useState(false);
  const [lastSavedTitle, setLastSavedTitle] = React.useState(note?.title ?? "");
  const [lastSavedContent, setLastSavedContent] = React.useState(() => {
    const current = note?.content ?? "";
    const parsed = parseQuickRichNoteDocument(current);
    return parsed.blocks.map((block) => block.html).join("");
  });

  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = React.useRef(false);
  const creatingRef = React.useRef(false);

  const folderId = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("folderId") ?? note?.folderId ?? null;
  }, [note]);

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

  const hasPendingChanges = React.useMemo(
    () => title !== lastSavedTitle || content !== lastSavedContent,
    [title, lastSavedTitle, content, lastSavedContent]
  );

  const persistNote = React.useCallback(
    async (options?: { allowCreate?: boolean }) => {
      if (savingRef.current) return;
      if (!note && creatingRef.current) return;
      const allowCreate = options?.allowCreate ?? false;

      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const normalizedTitle = title.trim() || t("quickNote");
      const serializedContent = serializeQuickRichNoteHtml(content);

      if (!note && !title.trim() && !content.trim()) return;
      if (!hasPendingChanges && note) return;
      if (!note && !allowCreate) return;

      savingRef.current = true;
      setSaving(true);

      try {
        if (note) {
          const updated = updateQuickNote(note.id, {
            title: normalizedTitle,
            content: serializedContent,
            text: content,
          });
          if (updated) {
            setNote(updated);
            setLastSavedTitle(updated.title);
            setLastSavedContent(content);
          }
        } else {
          creatingRef.current = true;
          const created = createQuickNote({
            title: normalizedTitle,
            content: serializedContent,
            text: content,
            folderId,
          });
          setNote(created);
          setLastSavedTitle(created.title);
          setLastSavedContent(content);

          window.history.replaceState(null, "", `/quicknotes/${created.id}`);
        }
      } catch (err) {
        console.error("[quick-note] save failed", err);
      } finally {
        creatingRef.current = false;
        savingRef.current = false;
        setSaving(false);
      }
    },
    [content, folderId, hasPendingChanges, isMobileSync, note, title, t]
  );

  React.useEffect(() => {
    if (!hasPendingChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistNote({ allowCreate: true });
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [hasPendingChanges, persistNote]);

  React.useEffect(() => {
    if (!isMobileSync || !note) return;
    const unsub = subscribeTaskSyncMessages((msg) => {
      if (msg.type === "UPSERT_QUICK_NOTE" && msg.payload.id === note.id) {
        const incoming = msg.payload;
        setNote((prev) => {
          if (!prev) return prev;
          if (incoming.updatedAt <= (prev.updatedAt ?? 0)) return prev;
          const incomingContent = parseQuickRichNoteDocument(incoming.content ?? incoming.text ?? "");
          const nextContent = incomingContent.blocks.map((block) => block.html).join("");
          const updated: DataQuickNote = {
            ...prev,
            title: incoming.title ?? t("quickNote"),
            content: serializeQuickRichNoteHtml(nextContent),
            text: nextContent,
            updatedAt: incoming.updatedAt,
          };
          setTitle(updated.title);
          setContent(nextContent);
          setLastSavedTitle(updated.title);
          setLastSavedContent(nextContent);
          return updated;
        });
      }
    });
    return unsub;
  }, [isMobileSync, note, t]);

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
    const confirmed = window.confirm(t("deleteQuickNoteConfirm"));
    if (!confirmed) return;

    deleteQuickNote(note.id);
    navigate(-1);
  }, [navigate, note, t]);

  return (
    <div className={styles.editorPage}>
      <div className={styles.header}>
        <button
          type="button"
          className={styles.backBtn}
          onClick={handleBack}
          title={t("goBack")}
        >
          <ArrowLeft size={18} />
        </button>

        <input
          className={styles.titleInput}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => persistNote({ allowCreate: true })}
          placeholder={t("placeholderQuickNote")}
        />

        <div className={styles.headerActions}>
          {saving && <span className={styles.savingIndicator}>{t("saving")}</span>}
          <button
            type="button"
            className={styles.saveBtn}
            onClick={() => persistNote({ allowCreate: true })}
          >
            <Check size={14} /> {t("save")}
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

      {folderName && (
        <div className={styles.folderBadge}>
          <Folder size={12} /> {folderName}
        </div>
      )}

      <div className={styles.editorBody} style={{ padding: "0 10px", overflowY: "auto" }}>
        <QuickRichNoteEditor
          value={content}
          onChange={(nextValue) => setContent(nextValue)}
          editable
        />
      </div>
    </div>
  );
};

export default QuickNoteEditorPage;
