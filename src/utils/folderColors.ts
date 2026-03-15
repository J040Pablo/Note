export const FOLDER_COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6",
  green: "#22C55E",
  purple: "#8B5CF6",
  orange: "#F97316",
  red: "#EF4444",
  yellow: "#FACC15"
};

export const getFolderColorHex = (color: string | null | undefined, fallback: string): string => {
  if (!color) return fallback;
  return FOLDER_COLOR_HEX[color] ?? fallback;
};
