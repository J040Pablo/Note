import { saveFile, makeFileRef, isFileRef } from "./webFileStore";

/**
 * Detects large Base64 images in Note/Canvas content and migrates them to IndexedDB.
 */
export const migrateContentImages = async (content: string): Promise<string> => {
  if (!content || typeof content !== "string") return content;
  if (!content.includes("data:image/")) return content;

  try {
    const parsed = JSON.parse(content);
    let changed = false;

    // Handle Canvas Elements
    if (parsed.elements && Array.isArray(parsed.elements)) {
      for (const el of parsed.elements) {
        if (el.type === "image" && el.uri && el.uri.startsWith("data:image/") && el.uri.length > 50000) {
          const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          await saveFile(fileId, el.uri);
          el.uri = makeFileRef(fileId);
          changed = true;
        }
      }
    }

    // Handle Note Blocks (BlockEditor)
    if (parsed.blocks && Array.isArray(parsed.blocks)) {
      for (const block of parsed.blocks) {
        if (block.type === "image" && block.uri && block.uri.startsWith("data:image/") && block.uri.length > 50000) {
          const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          await saveFile(fileId, block.uri);
          block.uri = makeFileRef(fileId);
          changed = true;
        }
      }
    }

    return changed ? JSON.stringify(parsed) : content;
  } catch {
    return content;
  }
};

/**
 * Migrates a single field (like imageUrl or bannerUrl) to IndexedDB if it contains a large Base64.
 */
export const migrateSingleImage = async (uri?: string): Promise<string | undefined> => {
  if (!uri || !uri.startsWith("data:image/") || uri.length < 50000) return uri;
  
  const fileId = `field-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await saveFile(fileId, uri);
  return makeFileRef(fileId);
};
