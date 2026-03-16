import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

const MEDIA_DIR = `${FileSystem.documentDirectory}media/`;

const ensureMediaDir = async () => {
  const info = await FileSystem.getInfoAsync(MEDIA_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
  }
};

const sanitizeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

const extensionOf = (name: string) => {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "jpg";
};

export const pickAndStoreImage = async (prefix: string): Promise<string | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/*"],
    multiple: false,
    copyToCacheDirectory: true
  });

  if (result.canceled || !result.assets?.[0]) return null;

  await ensureMediaDir();

  const asset = result.assets[0];
  const safeName = sanitizeName(asset.name || `image-${Date.now()}.jpg`);
  const ext = extensionOf(safeName);
  const destination = `${MEDIA_DIR}${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}.${ext}`;

  await FileSystem.copyAsync({ from: asset.uri, to: destination });
  return destination;
};
