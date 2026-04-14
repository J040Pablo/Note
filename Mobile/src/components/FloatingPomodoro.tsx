import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  View,
  type PanResponderGestureState
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import { usePomodoroStore } from "@store/usePomodoroStore";

const BUTTON_SIZE = 62;
const EDGE_MARGIN = 10;
const BOTTOM_RESERVED = 110;
const TOP_RESERVED = 60;
const PANEL_WIDTH = 230;
const CLOSE_ZONE_Y_OFFSET = 100;
const CLOSE_ZONE_RADIUS = 130;

const formatTime = (totalSeconds: number): string => {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const getBounds = () => {
  const { width, height } = Dimensions.get("window");
  return {
    maxX: width - BUTTON_SIZE - EDGE_MARGIN,
    maxY: height - BUTTON_SIZE - BOTTOM_RESERVED
  };
};

const FloatingPomodoro: React.FC = () => {
  const { theme } = useTheme();

  const isVisible = usePomodoroStore((state) => state.isVisible);
  const isRunning = usePomodoroStore((state) => state.isRunning);
  const mode = usePomodoroStore((state) => state.mode);
  const timeLeft = usePomodoroStore((state) => state.timeLeft);
  const isExpanded = usePomodoroStore((state) => state.isExpanded);
  const position = usePomodoroStore((state) => state.position);

  const start = usePomodoroStore((state) => state.start);
  const pause = usePomodoroStore((state) => state.pause);
  const reset = usePomodoroStore((state) => state.reset);
  const seekBackward = usePomodoroStore((s) => s.seekBackward);
  const seekForward = usePomodoroStore((s) => s.seekForward);
  const toggleMode = usePomodoroStore((state) => state.toggleMode);
  const toggleExpanded = usePomodoroStore((state) => state.toggleExpanded);
  const setPosition = usePomodoroStore((state) => state.setPosition);
  const closePomodoro = usePomodoroStore((state) => state.closePomodoro);

  const [isDragging, setIsDragging] = useState(false);
  const [isCloseZoneActive, setIsCloseZoneActive] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [windowWidth, setWindowWidth] = useState(Dimensions.get("window").width);
  const [windowHeight, setWindowHeight] = useState(Dimensions.get("window").height);

  const pan = useRef(new Animated.ValueXY()).current;
  const panelAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const dragStartRef = useRef(position);
  const positionRef = useRef(position);
  const moveRafRef = useRef<number | null>(null);
  const closeZoneActiveRef = useRef(false);
  const isExpandedRef = useRef(isExpanded);
  const windowHeightRef = useRef(windowHeight);
  const windowWidthRef = useRef(windowWidth);
  const closePomodoroRef = useRef(closePomodoro);
  const scale = useRef(new Animated.Value(0.8)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const dragOpacity = useRef(new Animated.Value(1)).current;
  const wasNearCloseRef = useRef(false);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetIdleTimer = () => {
    setIsIdle(false);

    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }

    idleTimeoutRef.current = setTimeout(() => {
      setIsIdle(true);
    }, 3000);
  };

  useEffect(() => {
    positionRef.current = position;

    if (position.x < 0 || position.y < 0) {
      const { width, height } = Dimensions.get("window");
      const safeX = Math.max(10, width - 80);
      const safeY = Math.max(60, height - 160);
      setPosition(safeX, safeY);
    }
  }, [position]);

  useEffect(() => {
    isExpandedRef.current = isExpanded;
  }, [isExpanded]);

  useEffect(() => {
    windowHeightRef.current = windowHeight;
  }, [windowHeight]);

  useEffect(() => {
    windowWidthRef.current = windowWidth;
  }, [windowWidth]);

  useEffect(() => {
    closePomodoroRef.current = closePomodoro;
  }, [closePomodoro]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    scale.setValue(0.8);
    opacity.setValue(0);

    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        friction: 8,
        tension: 120
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true
      })
    ]).start();
  }, [isVisible, opacity, scale]);

  useEffect(() => {
    const toScale = isCloseZoneActive ? 1.28 : isDragging ? 1.1 : 1;
    const toOpacity = isCloseZoneActive ? 0.9 : 1;

    Animated.parallel([
      Animated.spring(dragScale, {
        toValue: toScale,
        useNativeDriver: true,
        friction: 9,
        tension: 130
      }),
      Animated.timing(dragOpacity, {
        toValue: toOpacity,
        duration: 120,
        useNativeDriver: true
      })
    ]).start();
  }, [dragOpacity, dragScale, isCloseZoneActive, isDragging]);

  useEffect(() => {
    if (isDragging) {
      return;
    }
    pan.setValue(positionRef.current);
  }, [isDragging, pan]);

  useEffect(() => {
    Animated.spring(panelAnim, {
      toValue: isExpanded ? 1 : 0,
      useNativeDriver: true,
      friction: 8,
      tension: 110
    }).start();
  }, [isExpanded, panelAnim]);

  useEffect(() => {
    return () => {
      if (moveRafRef.current != null) {
        cancelAnimationFrame(moveRafRef.current);
      }

      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    resetIdleTimer();
  }, []);

  useEffect(() => {
    const subscription = Dimensions.addEventListener("change", ({ window }) => {
      setWindowWidth(window.width);
      setWindowHeight(window.height);
      const bounds = getBounds();
      const currentPosition = positionRef.current;
      const safeX = clamp(currentPosition.x, EDGE_MARGIN, bounds.maxX);
      const safeY = clamp(currentPosition.y, TOP_RESERVED, bounds.maxY);
      if (safeX !== currentPosition.x || safeY !== currentPosition.y) {
        setPosition(safeX, safeY);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [setPosition]);

  const finalizePosition = (gestureState: PanResponderGestureState) => {
    const bounds = getBounds();
    const currentY = clamp(dragStartRef.current.y + gestureState.dy, TOP_RESERVED, bounds.maxY);
    const currentX = clamp(dragStartRef.current.x + gestureState.dx, EDGE_MARGIN, bounds.maxX);

    const snapX = currentX + BUTTON_SIZE / 2 < bounds.maxX / 2 ? EDGE_MARGIN : bounds.maxX;
    setPosition(snapX, currentY);
    Animated.spring(pan, {
      toValue: { x: snapX, y: currentY },
      useNativeDriver: false,
      friction: 8,
      tension: 120
    }).start();
  };

  const handleBubblePress = () => {
    resetIdleTimer();

    if (!isExpanded) {
      toggleExpanded();
      return;
    }

    toggleExpanded();
  };

  const handleStartPause = () => {
    resetIdleTimer();
    if (isRunning) {
      pause();
      return;
    }
    start();
  };

  const handleSeekBackward = () => {
    resetIdleTimer();
    seekBackward();
  };

  const handleSeekForward = () => {
    resetIdleTimer();
    seekForward();
  };

  const handleReset = () => {
    resetIdleTimer();
    reset();
  };

  const handleToggleMode = () => {
    resetIdleTimer();
    toggleMode();
  };

  const handleClosePomodoro = () => {
    resetIdleTimer();
    closePomodoro();
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isExpandedRef.current,
      onMoveShouldSetPanResponder: (_, gesture) => !isExpandedRef.current && (Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5),
      onPanResponderGrant: () => {
        resetIdleTimer();
        dragStartRef.current = { ...positionRef.current };
        setIsDragging(true);
        wasNearCloseRef.current = false;
        if (closeZoneActiveRef.current) {
          closeZoneActiveRef.current = false;
          setIsCloseZoneActive(false);
        }
      },
      onPanResponderMove: (_, gestureState) => {
        if (moveRafRef.current != null) {
          cancelAnimationFrame(moveRafRef.current);
        }

        moveRafRef.current = requestAnimationFrame(() => {
          const bounds = getBounds();
          const nextX = clamp(dragStartRef.current.x + gestureState.dx, EDGE_MARGIN, bounds.maxX);
          const nextY = clamp(dragStartRef.current.y + gestureState.dy, TOP_RESERVED, bounds.maxY);

          const centerX = windowWidthRef.current / 2;
          const closeY = windowHeightRef.current - CLOSE_ZONE_Y_OFFSET;
          const dx = gestureState.moveX - centerX;
          const dy = gestureState.moveY - closeY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const nearCloseZone = distance < CLOSE_ZONE_RADIUS;

          if (nearCloseZone) {
            const targetX = centerX - BUTTON_SIZE / 2;
            const targetY = closeY;

            if (!wasNearCloseRef.current) {
              Vibration.vibrate(20);
              Animated.spring(pan, {
                toValue: { x: targetX, y: targetY },
                tension: 120,
                friction: 10,
                useNativeDriver: false
              }).start();
            }

            wasNearCloseRef.current = true;
          } else {
            pan.setValue({ x: nextX, y: nextY });
            wasNearCloseRef.current = false;
          }

          if (nearCloseZone !== closeZoneActiveRef.current) {
            closeZoneActiveRef.current = nearCloseZone;
            setIsCloseZoneActive(nearCloseZone);
          }
        });
      },
      onPanResponderRelease: (_, gestureState) => {
        if (moveRafRef.current != null) {
          cancelAnimationFrame(moveRafRef.current);
          moveRafRef.current = null;
        }

        const movedEnough = Math.abs(gestureState.dx) > 4 || Math.abs(gestureState.dy) > 4;
        const centerX = windowWidthRef.current / 2;
        const closeY = windowHeightRef.current - CLOSE_ZONE_Y_OFFSET;
        const dx = gestureState.moveX - centerX;
        const dy = gestureState.moveY - closeY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const isOverCloseZone = distance < CLOSE_ZONE_RADIUS;

        if (isOverCloseZone) {
          Animated.timing(pan, {
            toValue: {
              x: centerX - BUTTON_SIZE / 2,
              y: closeY
            },
            duration: 150,
            useNativeDriver: false
          }).start(() => {
            closePomodoroRef.current();
            Vibration.vibrate(40);
          });

          setIsDragging(false);
          wasNearCloseRef.current = false;
          if (closeZoneActiveRef.current) {
            closeZoneActiveRef.current = false;
          }
          setIsCloseZoneActive(false);
          return;
        }

        if (movedEnough) {
          finalizePosition(gestureState);
        } else {
          Animated.spring(pan, {
            toValue: positionRef.current,
            useNativeDriver: false,
            friction: 8,
            tension: 120
          }).start();
        }

        setIsDragging(false);
        wasNearCloseRef.current = false;
        if (closeZoneActiveRef.current) {
          closeZoneActiveRef.current = false;
        }
        setIsCloseZoneActive(false);
      },
      onPanResponderTerminate: (_, gestureState) => {
        if (moveRafRef.current != null) {
          cancelAnimationFrame(moveRafRef.current);
          moveRafRef.current = null;
        }
        finalizePosition(gestureState);
        setIsDragging(false);
        wasNearCloseRef.current = false;
        if (closeZoneActiveRef.current) {
          closeZoneActiveRef.current = false;
        }
        setIsCloseZoneActive(false);
      }
    })
  ).current;

  const isRightSide = positionRef.current.x > windowWidth / 2;
  const panelPositionStyle = isRightSide ? { right: BUTTON_SIZE + 10 } : { left: BUTTON_SIZE + 10 };

  const formattedTime = useMemo(() => formatTime(timeLeft), [timeLeft]);
  const modeLabel = mode === "focus" ? "Focus" : "Break";
  const bubbleBackground = "#111827";
  const bubbleBorder = "rgba(255,255,255,0.18)";
  const statusDotColor = isRunning ? "#22c55e" : "#9ca3af";

  if (!isVisible) {
    return null;
  }

  return (
    <>
      <Animated.View
        style={[
          styles.wrapper,
          {
            transform: [...pan.getTranslateTransform()]
          }
        ]}
        pointerEvents="box-none"
      >
        <Animated.View
          style={{
            transform: [{ scale }, { scale: dragScale }],
            opacity: Animated.multiply(opacity, dragOpacity)
          }}
        >
        {isExpanded && (
          <Animated.View
            style={[
              styles.panel,
              panelPositionStyle,
              {
                backgroundColor: theme.colors.card,
                borderColor: theme.colors.border,
                transform: [
                  {
                    scale: panelAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1]
                    })
                  }
                ],
                opacity: panelAnim
              }
            ]}
          >
            <View style={styles.panelHeader}>
              <View />
              <Pressable onPress={toggleExpanded} style={[styles.panelCloseButton, { borderColor: theme.colors.border }]}>
                <Ionicons name="close" size={16} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <Text style={styles.modeLabel}>{modeLabel}</Text>

            <View style={styles.centerBlock}>
              <View style={styles.seekRow}>
                <TouchableOpacity onPress={handleSeekBackward}>
                  <Ionicons name="play-back" size={24} color="#fff" />
                </TouchableOpacity>

                <Text style={styles.timeBig}>{formattedTime}</Text>

                <TouchableOpacity onPress={handleSeekForward}>
                  <Ionicons name="play-forward" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity onPress={handleStartPause} style={styles.mainButton}>
                <Text style={styles.mainButtonText}>{isRunning ? "Pause" : "Start"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.controlsRow}>
              <Pressable onPress={handleReset} style={[styles.controlButton, { borderColor: theme.colors.border }]}>
                <Ionicons name="refresh" size={16} color={theme.colors.textPrimary} />
                <Text variant="caption">Reset</Text>
              </Pressable>
              <Pressable onPress={handleToggleMode} style={[styles.controlButton, { borderColor: theme.colors.border }]}> 
                <Ionicons name="repeat" size={16} color={theme.colors.textPrimary} />
                <Text variant="caption">Switch</Text>
              </Pressable>
            </View>

            <View style={styles.controlsRow}>
              <Pressable
                onPress={handleClosePomodoro}
                style={[styles.controlButton, { borderColor: theme.colors.border }]}
              >
                <Ionicons name="eye-off-outline" size={16} color={theme.colors.textPrimary} />
                <Text variant="caption">Hide</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        <View {...panResponder.panHandlers}>
          <Animated.View
            style={[
              styles.bubble,
              {
                backgroundColor: bubbleBackground,
                borderColor: bubbleBorder,
                shadowColor: theme.colors.textPrimary,
                opacity: isIdle && !isDragging ? 0.5 : 1
              }
            ]}
          >
            <Pressable onPress={handleBubblePress} onPressIn={resetIdleTimer} style={styles.bubblePressable}>
              <Ionicons name={isRunning ? "pause" : "play"} size={18} color="#FFFFFF" />
              <Text variant="caption" style={{ color: "#FFFFFF", marginTop: 1, fontWeight: "700" }}>
                {formattedTime}
              </Text>
              <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
            </Pressable>
          </Animated.View>
        </View>
        </Animated.View>
      </Animated.View>

      {isDragging && (
        <View
          pointerEvents="none"
          style={[
            styles.closeZone,
            isCloseZoneActive && styles.closeZoneActive
          ]}
        >
          <Ionicons name="close" size={22} color="#ef4444" />
        </View>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    zIndex: 9999
  },
  bubble: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 16
  },
  bubblePressable: {
    width: "100%",
    height: "100%",
    borderRadius: BUTTON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    position: "relative"
  },
  statusDot: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4
  },
  panel: {
    position: "absolute",
    bottom: 0,
    width: PANEL_WIDTH,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    elevation: 18
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2
  },
  panelCloseButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center"
  },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8
  },
  centerBlock: {
    alignItems: "center",
    marginVertical: 10
  },
  modeLabel: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 6
  },
  seekRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: 160,
    marginVertical: 10
  },
  timeBig: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "700"
  },
  mainButton: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: "#333"
  },
  mainButtonText: {
    color: "#fff",
    fontSize: 14
  },
  controlButton: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6
  },
  closeZone: {
    position: "absolute",
    bottom: 40,
    alignSelf: "center",
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "rgba(255,0,0,0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(239,68,68,0.45)",
    transform: [{ scale: 1 }],
    opacity: 0.9
  },
  closeZoneActive: {
    transform: [{ scale: 1.1 }],
    opacity: 1,
    backgroundColor: "#ff4444",
    borderColor: "rgba(255,80,80,0.9)",
    shadowColor: "#ff4444",
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14
  }
});

export default FloatingPomodoro;
