/**
 * PencilToolbarModal – Apple Notes-inspired pencil toolbar
 *
 * Features:
 * - Slide-up modal animation from bottom
 * - Color palette selector (horizontal)
 * - Thickness/size presets (visual representation)
 * - Eraser toggle
 * - Undo/Redo buttons
 * - Active selection highlighting
 * - Swipe-down to dismiss
 * - Theme-aware (light/dark)
 * - Touch-friendly design
 */

import React, { useCallback, useEffect, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import ColorPickerButton from "@components/ColorPickerButton";
import { useTheme } from "@hooks/useTheme";

// Constants
const PENCIL_COLORS = ["#111827", "#A78BFA", "#F472B6", "#60A5FA", "#34D399", "#FBBF24", "#FB7185"];
const PENCIL_SIZES = [2, 4, 6, 8, 12];
const PENCIL_OPACITIES = [0.25, 0.45, 0.65, 0.85, 1];
const MODAL_HEIGHT = 196;
const SWIPE_THRESHOLD = 60;

export interface PencilToolbarModalProps {
  visible: boolean;
  onDismiss: () => void;
  currentColor: string;
  onColorChange: (color: string) => void;
  currentSize: number;
  onSizeChange: (size: number) => void;
  currentOpacity: number;
  onOpacityChange: (opacity: number) => void;
  isUsingEraser: boolean;
  activeTool: "pencil" | "transparentPencil" | "eraser" | null;
  onToolToggle: (tool: "eraser" | "pencil" | "transparentPencil") => void;
  onDelete?: () => void;
  colors?: string[];
  sizes?: number[];
  opacities?: number[];
}

const PencilToolbarModal: React.FC<PencilToolbarModalProps> = ({
  visible,
  onDismiss,
  currentColor,
  onColorChange,
  currentSize,
  onSizeChange,
  currentOpacity,
  onOpacityChange,
  isUsingEraser,
  activeTool,
  onToolToggle,
  onDelete,
  colors = PENCIL_COLORS,
  sizes = PENCIL_SIZES,
  opacities = PENCIL_OPACITIES
}) => {
  const { theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(MODAL_HEIGHT)).current;
  const [expanded, setExpanded] = React.useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => Math.abs(gestureState.dy) > 5,
      onPanResponderMove: (evt, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(Math.max(0, MODAL_HEIGHT - gestureState.dy));
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          animateOut();
        } else {
          animateIn();
        }
      }
    })
  ).current;

  const animateIn = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false
    }).start();
  }, [slideAnim]);

  const animateOut = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: MODAL_HEIGHT,
      duration: 300,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: false
    }).start(() => {
      onDismiss();
    });
  }, [slideAnim, onDismiss]);

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(MODAL_HEIGHT);
      animateIn();
    }
  }, [visible]);

  const handleSizeSelect = useCallback(
    (size: number) => {
      if (!isUsingEraser) {
        onSizeChange(size);
      }
    },
    [isUsingEraser, onSizeChange]
  );

  const handleEraserPress = useCallback(() => {
    setExpanded(false);
    onToolToggle(isUsingEraser ? "pencil" : "eraser");
  }, [isUsingEraser, onToolToggle]);

  const handlePencilPress = useCallback(() => {
    setExpanded(true);
    if (isUsingEraser) {
      onToolToggle("pencil");
      return;
    }

    onToolToggle(activeTool === "pencil" ? "transparentPencil" : "pencil");
  }, [activeTool, isUsingEraser, onToolToggle]);

  const handleDeletePress = useCallback(() => {
    if (!onDelete) return;
    Alert.alert("Limpar", "Tem certeza que deseja apagar?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Apagar", style: "destructive", onPress: onDelete }
    ]);
  }, [onDelete]);

  const handleColorOpen = useCallback(() => {
    setExpanded(false);
    if (isUsingEraser) {
      onToolToggle("pencil");
    }
  }, [isUsingEraser, onToolToggle]);

  const handleColorModalDismiss = useCallback(() => {
    setExpanded(false);
  }, []);

  const renderTranslateY = slideAnim.interpolate({
    inputRange: [0, MODAL_HEIGHT],
    outputRange: [0, MODAL_HEIGHT]
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: renderTranslateY }],
          display: visible ? "flex" : "none"
        }
      ]}
      pointerEvents="box-none"
    >
      {expanded && !isUsingEraser && (
        <Pressable
          style={styles.fullScreenBackdrop}
          onPress={() => setExpanded(false)}
          pointerEvents="auto"
        />
      )}
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <View
          {...panResponder.panHandlers}
          style={[
            styles.modalCard,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border
            }
          ]}
        >
            <View style={styles.handleIndicator} />

            <View style={styles.stack}>
              {expanded && !isUsingEraser && (
                <Pressable
                  style={styles.popoverBackdrop}
                  onPress={() => setExpanded(false)}
                >
                  <View style={[styles.popover, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
                    pointerEvents="auto"
                  >
                    <View style={[styles.popoverPointer, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]} />
                    <View style={styles.popoverSection}>
                      <View style={styles.popoverLabelRow}>
                        <Text style={[styles.popoverLabel, { color: theme.colors.textSecondary }]}>Tamanho</Text>
                      </View>
                      <View style={styles.sizeRow}>
                        {sizes.map((size) => {
                          const active = currentSize === size;
                          return (
                            <Pressable
                              key={size}
                              onPress={() => handleSizeSelect(size)}
                              style={[
                                styles.sizeChip,
                                active && { borderColor: theme.colors.primary, backgroundColor: "rgba(59,130,246,0.12)" }
                              ]}
                            >
                              <View style={{ width: Math.max(4, size), height: Math.max(4, size), borderRadius: 999, backgroundColor: active ? theme.colors.primary : theme.colors.textPrimary }} />
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={styles.popoverSeparator} />

                    <View style={styles.popoverSection}>
                      <View style={styles.popoverLabelRow}>
                        <Text style={[styles.popoverLabel, { color: theme.colors.textSecondary }]}>Opacidade</Text>
                        <Text style={[styles.popoverValue, { color: theme.colors.textPrimary }]}>{Math.round(currentOpacity * 100)}%</Text>
                      </View>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.opacityBar}>
                        {opacities.map((opacity) => {
                          const active = currentOpacity === opacity;
                          return (
                            <Pressable
                              key={opacity}
                              onPress={() => onOpacityChange(opacity)}
                              style={[
                                styles.opacityStep,
                                active && { backgroundColor: theme.colors.primary, transform: [{ scaleY: 1.35 }] }
                              ]}
                            />
                          );
                        })}
                      </ScrollView>
                    </View>
                  </View>
                </Pressable>
              )}

              <View style={styles.toolbarRow}>
                <Pressable
                  onPress={handlePencilPress}
                  style={[
                    styles.compactBtn,
                    (activeTool === "pencil" || activeTool === "transparentPencil") && styles.compactBtnActive
                  ]}
                >
                  <Ionicons
                    name="pencil"
                    size={18}
                    color={activeTool === "pencil" || activeTool === "transparentPencil" ? theme.colors.primary : theme.colors.textPrimary}
                    style={{ opacity: activeTool === "transparentPencil" ? 0.45 : 1 }}
                  />
                </Pressable>

                <Pressable onPress={handleEraserPress} style={[styles.compactBtn, isUsingEraser && styles.compactBtnActive]}>
                  <MaterialCommunityIcons name="eraser" size={18} color={isUsingEraser ? "#EF4444" : theme.colors.textPrimary} />
                </Pressable>

                <ColorPickerButton
                  currentColor={currentColor}
                  currentOpacity={currentOpacity}
                  isActive={!isUsingEraser && (activeTool === "pencil" || activeTool === "transparentPencil")}
                  colors={colors}
                  onColorChange={onColorChange}
                  onOpen={handleColorOpen}
                  onDismiss={handleColorModalDismiss}
                />

                <Pressable onPress={handleDeletePress} style={styles.compactBtn}>
                  <Ionicons name="trash-outline" size={18} color={theme.colors.textPrimary} />
                </Pressable>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>
  );
};

const styles = StyleSheet.create({
  fullScreenBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1
  },
  container: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    justifyContent: "flex-end"
  },
  safeArea: {
    paddingHorizontal: 12,
    zIndex: 2
  },
  modalCard: {
    zIndex: 3,
    borderRadius: 18,
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 10,
    minHeight: 70,
    borderTopWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 24
  },
  handleIndicator: {
    alignSelf: "center",
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(148,163,184,0.5)",
    marginBottom: 8
  },
  stack: {
    position: "relative",
    paddingTop: 0
  },
  popoverBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    width: "100%",
    paddingTop: 2
  },
  compactBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center"
  },
  compactBtnActive: {
    backgroundColor: "rgba(59,130,246,0.16)"
  },
  popover: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 54,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 16
  },
  popoverPointer: {
    position: "absolute",
    left: "34%",
    bottom: -9,
    marginLeft: -9,
    width: 18,
    height: 18,
    transform: [{ rotate: "45deg" }],
    borderRightWidth: 1,
    borderBottomWidth: 1
  },
  popoverSection: {
    gap: 8
  },
  popoverLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  popoverLabel: {
    fontSize: 12,
    fontWeight: "600"
  },
  popoverValue: {
    fontSize: 12,
    fontWeight: "700"
  },
  popoverSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,163,184,0.35)"
  },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap"
  },
  sizeChip: {
    minWidth: 36,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)"
  },
  opacityBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 24,
    paddingRight: 2
  },
  opacityStep: {
    width: 36,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.28)"
  }
});

export default PencilToolbarModal;
