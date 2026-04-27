/**
 * IndexedDB storage for large files (images/assets) on the Web.
 * Avoids localStorage quota limits (5MB) by storing blobs/base64 in a dedicated store.
 */

const DB_NAME = "note.web.files.v1";
const STORE_NAME = "files";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

const getDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onerror = (event) => {
      console.error("[webFileStore] Database error:", (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });

  return dbPromise;
};

export type StoredFile = {
  id: string;
  data: string; // Base64 or Blob URL (though we prefer base64 for persistence across sessions if not using true blobs)
  mimeType?: string;
  updatedAt: number;
};

/**
 * Saves a file to IndexedDB.
 */
export const saveFile = async (id: string, data: string, mimeType?: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put({ id, data, mimeType, updatedAt: Date.now() });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Retrieves a file from IndexedDB.
 */
export const getFile = async (id: string): Promise<StoredFile | null> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Deletes a file from IndexedDB.
 */
export const deleteFile = async (id: string): Promise<void> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Generates a unique secure local reference for a file.
 */
export const makeFileRef = (id: string) => `webfile://${id}`;

/**
 * Checks if a string is a local webfile reference.
 */
export const isFileRef = (uri: string) => typeof uri === "string" && uri.startsWith("webfile://");

/**
 * Extracts the ID from a webfile reference.
 */
export const getFileIdRef = (uri: string) => uri.replace("webfile://", "");

/**
 * Lists all file IDs in the store.
 */
export const getAllFileIds = async (): Promise<string[]> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAllKeys();

    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  });
};
