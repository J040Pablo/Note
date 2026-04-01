import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  View
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";

const COLOR_MODAL_HEIGHT = 320;

interface ColorPickerButtonProps {
  currentColor: string;
  currentOpacity: number;
  isActive: boolean;
  colors: string[];
  onColorChange: (color: string) => void;
  onOpen?: () => void;
  onDismiss: () => void;
}

const hslToHex = (h: number, s: number, l: number): string => {
  const hue = h / 360;
  const sat = s / 100;
  const light = l / 100;

  const hueToRgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r: number;
  let g: number;
  let b: number;

  if (sat === 0) {
    r = light;
    g = light;
    b = light;
  } else {
    const q = light < 0.5 ? light * (1 + sat) : light + sat - light * sat;
    const p = 2 * light - q;
    r = hueToRgb(p, q, hue + 1 / 3);
    g = hueToRgb(p, q, hue);
    b = hueToRgb(p, q, hue - 1 / 3);
  }

  const toHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const buildSpectrumPalette = (): string[] => {
  const grayscale = [
    "#FFFFFF",
    "#F3F4F6",
    "#E5E7EB",
    "#D1D5DB",
    "#9CA3AF",
    "#6B7280",
    "#4B5563",
    "#374151",
    "#1F2937",
    "#111827",
    "#000000"
  ];

  const hues = [0, 18, 36, 54, 72, 102, 138, 180, 210, 240, 270, 300, 330];
  const rows = [44, 54, 64, 74, 84];

  const spectrum = rows.flatMap((lightness) =>
    hues.map((hue) => hslToHex(hue, 90, lightness))
  );

  return [...grayscale, ...spectrum];
};

const ColorPickerButton: React.FC<ColorPickerButtonProps> = ({
  currentColor,
  currentOpacity,
  isActive,
  colors,
  onColorChange,
  onOpen,
  onDismiss
}) => {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(COLOR_MODAL_HEIGHT)).current;

  const palette = useMemo(() => {
    const merged = [...colors, ...buildSpectrumPalette()];
    return merged.filter((color, index) => merged.indexOf(color) === index);
  }, [colors]);

  const animateIn = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true
    }).start();
  }, [slideAnim]);

  const closeModal = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: COLOR_MODAL_HEIGHT,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(() => {
      setVisible(false);
      onDismiss();
    });
  }, [onDismiss, slideAnim]);

  const openModal = useCallback(() => {
    onOpen?.();
    setVisible(true);
  }, [onOpen]);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(COLOR_MODAL_HEIGHT);
      animateIn();
    }
  }, [animateIn, slideAnim, visible]);

  return (
    <>
      <Pressable
        onPress={openModal}
        style={[
          styles.compactBtn,
          styles.colorButton,
          {
            borderColor: isActive ? theme.colors.primary : "rgba(148,163,184,0.5)",
            borderWidth: isActive ? 2 : 1
          }
        ]}
      >
        <View style={styles.colorSwatchContainer}>
          {currentOpacity < 1 && (
            <View style={styles.checkerboard} pointerEvents="none">
              <View style={styles.checkerRow}>
                <View style={styles.checkerCellLight} />
                <View style={styles.checkerCellDark} />
              </View>
              <View style={styles.checkerRow}>
                <View style={styles.checkerCellDark} />
                <View style={styles.checkerCellLight} />
              </View>
            </View>
          )}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: currentColor, opacity: currentOpacity }]} />
        </View>
      </Pressable>

      <Modal
        transparent
        visible={visible}
        onRequestClose={closeModal}
        animationType="none"
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeModal} />
          <Animated.View
            style={[
              styles.colorModal,
              {
                transform: [{ translateY: slideAnim }],
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border
              }
            ]}
          >
            <View style={styles.handleIndicator} />

            <View style={styles.headerRow}>
              <Text style={[styles.headerTitle, { color: theme.colors.textPrimary }]}>Colors</Text>
              <Pressable onPress={closeModal} hitSlop={10}>
                <Ionicons name="close-circle" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.paletteGrid}>
              {palette.map((color) => {
                const selected = color === currentColor;
                return (
                  <Pressable
                    key={color}
                    onPress={() => onColorChange(color)}
                    style={[
                      styles.colorCell,
                      {
                        borderColor: selected ? theme.colors.primary : "rgba(148,163,184,0.45)",
                        borderWidth: selected ? 2 : 1
                      }
                    ]}
                  >
                    <View style={styles.cellSwatch}>
                      {currentOpacity < 1 && (
                        <View style={styles.checkerboard} pointerEvents="none">
                          <View style={styles.checkerRow}>
                            <View style={styles.checkerCellLight} />
                            <View style={styles.checkerCellDark} />
                          </View>
                          <View style={styles.checkerRow}>
                            <View style={styles.checkerCellDark} />
                            <View style={styles.checkerCellLight} />
                          </View>
                        </View>
                      )}
                      <View style={[StyleSheet.absoluteFillObject, { backgroundColor: color, opacity: currentOpacity }]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.opacityInfoRow}>
              <Text style={[styles.opacityLabel, { color: theme.colors.textSecondary }]}>Opacidade</Text>
              <Text style={[styles.opacityValue, { color: theme.colors.textPrimary }]}>{Math.round(currentOpacity * 100)}%</Text>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  compactBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  colorButton: {
    backgroundColor: "transparent"
  },
  colorSwatchContainer: {
    width: 18,
    height: 18,
    borderRadius: 4,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)"
  },
  checkerboard: {
    ...StyleSheet.absoluteFillObject
  },
  checkerRow: {
    flex: 1,
    flexDirection: "row"
  },
  checkerCellLight: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.75)"
  },
  checkerCellDark: {
    flex: 1,
    backgroundColor: "rgba(148,163,184,0.5)"
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end"
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)"
  },
  colorModal: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 18,
    minHeight: COLOR_MODAL_HEIGHT
  },
  handleIndicator: {
    alignSelf: "center",
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(148,163,184,0.5)",
    marginBottom: 10
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "700"
  },
  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6
  },
  colorCell: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center"
  },
  cellSwatch: {
    width: 18,
    height: 18,
    borderRadius: 4,
    overflow: "hidden"
  },
  opacityInfoRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  opacityLabel: {
    fontSize: 12,
    fontWeight: "600"
  },
  opacityValue: {
    fontSize: 12,
    fontWeight: "700"
  }
});

export default ColorPickerButton;
