import * as FileSystem from "expo-file-system/legacy";

const MEDIA_DIR = `${FileSystem.documentDirectory}media/`;

export const cleanupDeletedImages = async () => {
  try {
    const files = await FileSystem.readDirectoryAsync(MEDIA_DIR);
    for (const file of files) {
      if (file.endsWith(".meta.json")) continue;
      
      const metaPath = `${MEDIA_DIR}${file}.meta.json`;
      try {
        await FileSystem.getInfoAsync(metaPath);
      } catch {
        // Se não tem .meta.json correspondente, pode estar órfã, mas mantém por segurança
      }
    }
  } catch {
    // Diretório pode não existir ainda
  }
};

export const ensureMediaDirExists = async () => {
  try {
    const info = await FileSystem.getInfoAsync(MEDIA_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
    }
  } catch {
    await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  }
};
