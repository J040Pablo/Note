export interface FolderColorOption {
  key: string;
  label: string;
  value: string;
  hex: string;
}

export const FOLDER_COLOR_OPTIONS: FolderColorOption[] = [
  { key: "white", label: "White", value: "white", hex: "#FFFFFF" },
  { key: "light-gray", label: "Light Gray", value: "light-gray", hex: "#F3F4F6" },
  { key: "gray", label: "Gray", value: "gray", hex: "#9CA3AF" },
  { key: "dark-gray", label: "Dark Gray", value: "dark-gray", hex: "#4B5563" },
  { key: "black", label: "Black", value: "black", hex: "#000000" },
  { key: "blue", label: "Blue", value: "blue", hex: "#3B82F6" },
  { key: "green", label: "Green", value: "green", hex: "#22C55E" },
  { key: "purple", label: "Purple", value: "purple", hex: "#8B5CF6" },
  { key: "indigo", label: "Indigo", value: "indigo", hex: "#6366F1" },
  { key: "sky", label: "Sky", value: "sky", hex: "#0EA5E9" },
  { key: "orange", label: "Orange", value: "orange", hex: "#F97316" },
  { key: "red", label: "Red", value: "red", hex: "#EF4444" },
  { key: "yellow", label: "Yellow", value: "yellow", hex: "#FACC15" },
  { key: "pink", label: "Pink", value: "pink", hex: "#E879F9" }
];

export const FOLDER_COLOR_HEX: Record<string, string> = Object.fromEntries(
  FOLDER_COLOR_OPTIONS.map((option) => [option.value, option.hex])
);

export const getFolderColorHex = (color: string | null | undefined, fallback: string): string => {
  if (!color) return fallback;
  return FOLDER_COLOR_HEX[color] ?? fallback;
};
