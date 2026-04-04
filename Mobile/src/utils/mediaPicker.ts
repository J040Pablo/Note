import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

const MEDIA_DIR = `${FileSystem.documentDirectory}media/`;

type CropPreset = "avatar" | "banner" | "folderCover" | "itemSquare" | "free";

interface CropMeta {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  preset: CropPreset;
  aspectRatio: number | null;
}

interface StoredImageResult {
  uri: string;
  crop: CropMeta;
}

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

const resolvePreset = (prefix: string): CropPreset => {
  if (prefix === "avatar") return "avatar";
  if (prefix === "banner") return "banner";
  if (prefix === "folder-banner") return "folderCover";
  if (prefix === "folder-photo") return "itemSquare";
  if (prefix === "file-thumb") return "itemSquare";
  if (prefix === "file-banner") return "banner";
  return "free";
};

const presetAspect = (preset: CropPreset): [number, number] | undefined => {
  if (preset === "avatar") return [1, 1];
  if (preset === "banner") return [16, 6];
  if (preset === "folderCover") return [4, 3];
  if (preset === "itemSquare") return [1, 1];
  return undefined;
};

const maxSizeByPreset = (preset: CropPreset): number => {
  if (preset === "banner") return 1600;
  if (preset === "folderCover") return 1200;
  return 1024;
};

const saveMetaFile = async (targetUri: string, meta: CropMeta): Promise<void> => {
  const sidecar = `${targetUri}.meta.json`;
  await FileSystem.writeAsStringAsync(sidecar, JSON.stringify(meta), {
    encoding: FileSystem.EncodingType.UTF8
  });
};

const pickFromGalleryWithEditor = async (preset: CropPreset): Promise<ImagePicker.ImagePickerAsset | null> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return null;
  }

  const aspect = presetAspect(preset);
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

export const pickAndStoreImageWithCrop = async (prefix: string): Promise<StoredImageResult | null> => {
  const preset = resolvePreset(prefix);

  const editedAsset = await pickFromGalleryWithEditor(preset);
  if (!editedAsset) return null;

  await ensureMediaDir();

  const safeName = sanitizeName(editedAsset.fileName || `image-${Date.now()}.jpg`);
  const extension = extensionOf(safeName || "jpg");
  const targetExt = extension === "png" ? "png" : "jpg";

  const maxSide = maxSizeByPreset(preset);
  const baseWidth = editedAsset.width || maxSide;
  const baseHeight = editedAsset.height || maxSide;
  const shouldResize = Math.max(baseWidth, baseHeight) > maxSide;
  const resizeFactor = shouldResize ? maxSide / Math.max(baseWidth, baseHeight) : 1;

  const optimized = await manipulateAsync(
    editedAsset.uri,
    shouldResize
      ? [{ resize: { width: Math.round(baseWidth * resizeFactor), height: Math.round(baseHeight * resizeFactor) } }]
      : [],
    {
      compress: 0.88,
      format: targetExt === "png" ? SaveFormat.PNG : SaveFormat.JPEG
    }
  );

  const destination = `${MEDIA_DIR}${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}.${targetExt}`;
  await FileSystem.copyAsync({ from: optimized.uri, to: destination });

  const aspect = presetAspect(preset);
  const meta: CropMeta = {
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    preset,
    aspectRatio: aspect ? aspect[0] / aspect[1] : null
  };

  await saveMetaFile(destination, meta);

  return {
    uri: destination,
    crop: meta
  };
};

export const pickAndStoreImage = async (prefix: string): Promise<string | null> => {
  const edited = await pickAndStoreImageWithCrop(prefix);
  if (edited) return edited.uri;

  // Fallback when media-library permission is denied: keep file-based flow.
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
  await saveMetaFile(destination, {
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    preset: resolvePreset(prefix),
    aspectRatio: null
  });
  return destination;
};
