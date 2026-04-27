import { getFile, isFileRef, getFileIdRef } from "./webFileStore";

/**
 * Resolves a URI to a renderable image source.
 * Handles:
 * - webfile:// references (resolved from IndexedDB)
 * - data:image/ base64
 * - http/https URLs
 * - Rejects file:// with a fallback
 */
export const resolveImageUri = async (uri: string | undefined): Promise<string | undefined> => {
  if (!uri) return undefined;

  // Handle local IndexedDB references
  if (isFileRef(uri)) {
    const fileId = getFileIdRef(uri);
    const stored = await getFile(fileId);
    return stored?.data;
  }

  // Handle standard renderable URIs
  if (uri.startsWith("data:image/") || uri.startsWith("http://") || uri.startsWith("https://") || uri.startsWith("blob:")) {
    return uri;
  }

  // Rejection/Fallback for file://
  if (uri.startsWith("file://")) {
    console.warn("[imageResolver] Cannot render mobile local file on web:", uri);
    return undefined; // Or a specific broken image placeholder
  }

  return uri;
};

/**
 * Sync version for checking if a URI is likely renderable (without loading data).
 */
export const isBrowserRenderableImageUri = (uri: string | undefined): boolean => {
  if (!uri) return false;
  return (
    uri.startsWith("data:image/") ||
    uri.startsWith("http://") ||
    uri.startsWith("https://") ||
    uri.startsWith("blob:") ||
    isFileRef(uri)
  );
};
