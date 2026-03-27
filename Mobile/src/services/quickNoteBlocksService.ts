import { useQuickNotesStore } from "@store/useQuickNotesStore";
import type { ID, QuickNote } from "@models/types";

export const QUICK_NOTE_ROOT_BLOCK_ID = "quick-root-block";

interface QuickNoteHtmlBlock {
  id: string;
  html: string;
}

interface QuickNoteBlockDocument {
  version: 1;
  type: "quick-rich-blocks";
  blocks: QuickNoteHtmlBlock[];
}

const isBlockDocument = (value: unknown): value is QuickNoteBlockDocument => {
  if (!value || typeof value !== "object") return false;
  const doc = value as QuickNoteBlockDocument;
  return doc.version === 1 && doc.type === "quick-rich-blocks" && Array.isArray(doc.blocks);
};

const parseQuickNoteBlocks = (raw: string): QuickNoteBlockDocument => {
  if (!raw?.trim()) {
    return {
      version: 1,
      type: "quick-rich-blocks",
      blocks: [{ id: QUICK_NOTE_ROOT_BLOCK_ID, html: "" }]
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (isBlockDocument(parsed)) return parsed;
  } catch {
    // Legacy format (plain/html) falls through to root block wrapper.
  }

  return {
    version: 1,
    type: "quick-rich-blocks",
    blocks: [{ id: QUICK_NOTE_ROOT_BLOCK_ID, html: raw }]
  };
};

const serializeQuickNoteBlocks = (doc: QuickNoteBlockDocument): string => JSON.stringify(doc);

export const getQuickNoteEditorHtml = (raw: string): string => {
  const doc = parseQuickNoteBlocks(raw);
  return doc.blocks.map((block) => block.html).join("");
};

/**
 * Updates only one block in a quick note document inside the store, preserving
 * all other blocks and avoiding full-document replacement in the editor pipeline.
 */
export const updateQuickNoteBlock = (noteId: ID, blockId: string, newContent: string): QuickNote | null => {
  const store = useQuickNotesStore.getState();
  const current = store.quickNotes[noteId];
  if (!current) return null;

  const parsed = parseQuickNoteBlocks(current.content);
  const targetIndex = parsed.blocks.findIndex((block) => block.id === blockId);
  const nextBlocks =
    targetIndex >= 0
      ? parsed.blocks.map((block, index) => (index === targetIndex ? { ...block, html: newContent } : block))
      : [...parsed.blocks, { id: blockId, html: newContent }];

  const nextDoc: QuickNoteBlockDocument = { ...parsed, blocks: nextBlocks };
  const nextNote: QuickNote = {
    ...current,
    content: serializeQuickNoteBlocks(nextDoc),
    updatedAt: Date.now()
  };

  store.upsertQuickNote(nextNote);
  return nextNote;
};

/**
 * Generic function requested for block-based updates, can be used by Note/Quick Note flows.
 * Here we route to quick-note store semantics.
 */
export const updateNoteBlock = (noteId: ID, blockId: string, newContent: string): QuickNote | null => {
  return updateQuickNoteBlock(noteId, blockId, newContent);
};

