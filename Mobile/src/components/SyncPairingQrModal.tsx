import React, { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View, Image, Animated, ActivityIndicator, Platform, Share, Clipboard } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import { getTaskSyncServerUrl, startTaskSyncServer } from "@services/sync/taskSyncServer";
import { isExpoGo } from "@utils/runtimeEnv";

type SyncPairingQrModalProps = {
  visible: boolean;
  onClose: () => void;
};

const WEBSITE_URL = "https://spectru-web.vercel.app";
const QR_API_URL = `https://quickchart.io/qr?size=300&text=${encodeURIComponent(WEBSITE_URL)}&margin=2`;

const SyncPairingQrModal: React.FC<SyncPairingQrModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const [url, setUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    const loadUrl = async () => {
      setLoading(true);
      setError("");

      if (isExpoGo) {
        if (!mounted) return;
        setUrl("");
        setError("Web pairing server is unavailable in Expo Go. Use development build.");
        setLoading(false);
        return;
      }

      const existing = getTaskSyncServerUrl();
      if (existing) {
        if (!mounted) return;
        setUrl(existing);
        setLoading(false);
        return;
      }

      try {
        const result = await startTaskSyncServer();
        if (!mounted) return;
        if (result?.url) {
          setUrl(result.url);
        } else {
          setError("Could not start local pairing server.");
        }
      } catch {
        if (!mounted) return;
        setError("Could not start local pairing server.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadUrl();

    return () => {
      mounted = false;
    };
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(shimmerAnim, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      shimmerAnim.setValue(0);
    }
  }, [visible, shimmerAnim]);

  const shimmerOpacity = shimmerAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 0.3],
  });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              shadowColor: "#000",
              shadowOpacity: 0.15,
              shadowRadius: 10,
              elevation: 5,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
               <Text style={[styles.title, { color: theme.colors.textPrimary }]}>Pareamento</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={styles.webSiteCard}>
               <View style={styles.webSiteHeader}>
                  <Ionicons name="globe-outline" size={20} color={theme.colors.secondary} />
                  <View style={{ flex: 1 }}>
                     <Text style={[styles.urlLabel, { color: theme.colors.secondary, marginBottom: 0 }]}>SITE WEB</Text>
                     <Text variant="caption" muted>Abra no computador para conectar</Text>
                  </View>
               </View>
               
               <View style={[styles.urlBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.secondary + '33', marginTop: 12 }]}>
                  <Text selectable style={[styles.urlText, { color: theme.colors.textPrimary }]}>{WEBSITE_URL}</Text>
                  <Pressable 
                    onPress={() => Clipboard.setString(WEBSITE_URL)}
                    style={({ pressed }) => [styles.copyBtn, { backgroundColor: pressed ? theme.colors.border : 'transparent' }]}
                  >
                    <Ionicons name="copy-outline" size={16} color={theme.colors.textSecondary} />
                  </Pressable>
               </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.qrSection}>
               <View style={styles.qrHeader}>
                   <Ionicons name="scan-outline" size={16} color={theme.colors.textSecondary} />
                   <Text style={[styles.qrTitle, { color: theme.colors.textPrimary }]}>Pareamento por QR Code</Text>
                   <View style={[styles.emBreveBadge, { backgroundColor: theme.colors.primaryAlpha20 }]}>
                      <Text style={[styles.emBreveText, { color: theme.colors.primary }]}>EM BREVE</Text>
                   </View>
               </View>

               <View style={styles.qrBoxOuter}>
                  <View style={[styles.qrWrapper, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}>
                    <Image source={{ uri: QR_API_URL }} style={styles.qrImage} resizeMode="contain" />
                    <Animated.View style={[styles.shimmerOverlay, { backgroundColor: theme.colors.primaryAlpha20, opacity: shimmerOpacity }]} />
                  </View>
               </View>

               <View style={[styles.urlHero, { marginTop: 24, width: '100%' }]}>
                  <Text style={[styles.urlLabel, { color: theme.colors.primary, textAlign: 'center' }]}>URL DE CONEXÃO</Text>
                  <View style={[styles.urlBox, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.primaryAlpha20 }]}>
                      {loading ? (
                        <ActivityIndicator size="small" color={theme.colors.primary} />
                      ) : url ? (
                        <Text selectable style={[styles.urlText, { color: theme.colors.textPrimary }]}>{url}</Text>
                      ) : (
                        <Text style={[styles.urlError, { color: theme.colors.danger }]}>{error || "Não foi possível carregar a URL"}</Text>
                      )}
                  </View>
                  <Text variant="caption" muted style={{ marginTop: 6, textAlign: 'center' }}>
                    Use este endereço no campo de pareamento do site.
                  </Text>
               </View>
            </View>


            <Pressable
              onPress={onClose}
              style={[
                styles.button,
                {
                  backgroundColor: theme.colors.primary,
                },
              ]}
            >
              <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>Fechar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    paddingBottom: 24,
    overflow: "hidden",
  },
  header: {
    paddingTop: 20,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
     flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  closeBtn: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
  },
  webSiteCard: {
    marginBottom: 20,
  },
  webSiteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  urlHero: {
    marginBottom: 24,
  },
  urlLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  urlBox: {
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  urlText: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.5,
  },
  urlError: {
    fontSize: 12,
    textAlign: "center",
  },
  copyBtn: {
    position: 'absolute',
    right: 8,
    padding: 8,
    borderRadius: 8,
  },
  divider: {
    height: 1,
    backgroundColor: "rgba(0,0,0,0.05)",
    marginBottom: 24,
  },
  qrSection: {
    marginBottom: 24,
    alignItems: "center",
  },
  qrHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  qrTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  emBreveBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  emBreveText: {
    fontSize: 9,
    fontWeight: "800",
  },
  qrBoxOuter: {
    alignItems: "center",
    justifyContent: "center",
  },
  qrWrapper: {
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  qrImage: {
    width: 140,
    height: 140,
    opacity: 0.3,
  },
  shimmerOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
  },
  button: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
});

export default SyncPairingQrModal;
