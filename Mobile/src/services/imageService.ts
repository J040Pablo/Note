import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

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

const resolveAspectRatio = (type: string): [number, number] | undefined => {
  if (type === "avatar" || type === "folder-photo" || type === "file-thumb") return [1, 1];
  if (type === "banner" || type === "folder-banner" || type === "file-banner" || type === "user-banner") return [16, 6];
  return undefined;
};

const maxSizeByType = (type: string): number => {
  if (type === "banner" || type === "folder-banner" || type === "file-banner" || type === "user-banner") return 1600;
  return 1024;
};

const pickFromGallery = async (type: string): Promise<ImagePicker.ImagePickerAsset | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const aspect = resolveAspectRatio(type);
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect,
    quality: 1,
    selectionLimit: 1,
    exif: false
  });

  if (result.canceled || !result.assets?.[0]) return null;
  return result.assets[0];
};

export const pickAndSaveImage = async (type: string): Promise<string | null> => {
  const asset = await pickFromGallery(type);
  if (!asset) return null;

  await ensureMediaDir();

  const safeName = sanitizeName(asset.fileName || `image-${Date.now()}.jpg`);
  const extension = extensionOf(safeName || "jpg");
  const targetExt = extension === "png" ? "png" : "jpg";

  const maxSide = maxSizeByType(type);
  const baseWidth = asset.width || maxSide;
  const baseHeight = asset.height || maxSide;
  const shouldResize = Math.max(baseWidth, baseHeight) > maxSide;
  const resizeFactor = shouldResize ? maxSide / Math.max(baseWidth, baseHeight) : 1;

  const optimized = await manipulateAsync(
    asset.uri,
    shouldResize
      ? [{ resize: { width: Math.round(baseWidth * resizeFactor), height: Math.round(baseHeight * resizeFactor) } }]
      : [],
    {
      compress: 0.88,
      format: targetExt === "png" ? SaveFormat.PNG : SaveFormat.JPEG
    }
  );

  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const destination = `${MEDIA_DIR}${type}-${timestamp}-${random}.${targetExt}`;
  
  await FileSystem.copyAsync({ from: optimized.uri, to: destination });

  return destination;
};

export const deleteImage = async (uri: string | null): Promise<void> => {
  if (!uri || !uri.startsWith(MEDIA_DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
    const metaPath = `${uri}.meta.json`;
    await FileSystem.deleteAsync(metaPath, { idempotent: true });
  } catch {
    // Silently ignore deletion errors
  }
};

export const imageExists = async (uri: string | null): Promise<boolean> => {
  if (!uri) return false;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
};

export const validateImagePath = async (uri: string | null): Promise<string | null> => {
  if (!uri) return null;
  const exists = await imageExists(uri);
  return exists ? uri : null;
};
