import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View, ActivityIndicator, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import { getTaskSyncServerUrl, startTaskSyncServer } from "@services/sync/taskSyncServer";
import { isExpoGo } from "@utils/runtimeEnv";

type SyncPairingQrModalProps = {
  visible: boolean;
  onClose: () => void;
};

const SyncPairingQrModal: React.FC<SyncPairingQrModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
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

  const qrUrl = useMemo(() => {
    if (!url) return "";
    return `https://quickchart.io/qr?size=260&text=${encodeURIComponent(url)}`;
  }, [url]);

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <View style={styles.headerRow}>
            <Text variant="subtitle">Pair Web to Mobile</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close-outline" size={22} color={theme.colors.textPrimary} />
            </Pressable>
          </View>

          <Text muted style={styles.help}>Open Web app, use this URL/QR, then connect from Web.</Text>

          <View style={[styles.qrWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}> 
            {loading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : url ? (
              <View style={styles.qrInner}>
                <View style={[styles.qrImageFrame, { borderColor: theme.colors.border }]}> 
                  <Image source={{ uri: qrUrl }} style={{ width: 220, height: 220 }} resizeMode="contain" />
                </View>
                <Text selectable numberOfLines={2} style={[styles.urlText, { color: theme.colors.textPrimary }]}>
                  {url}
                </Text>
              </View>
            ) : (
              <Text muted>{error || "Could not prepare pairing URL."}</Text>
            )}
          </View>

          {!!error && <Text style={{ color: theme.colors.danger, marginTop: 8 }}>{error}</Text>}

          <Pressable
            onPress={onClose}
            style={[styles.doneButton, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryAlpha20 }]}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: "600" }}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    padding: 12
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  help: {
    marginTop: 4,
    marginBottom: 10
  },
  qrWrap: {
    minHeight: 290,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 12
  },
  qrInner: {
    alignItems: "center",
    gap: 10
  },
  qrImageFrame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden"
  },
  urlText: {
    fontSize: 12,
    textAlign: "center"
  },
  doneButton: {
    marginTop: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 9
  }
});

export default SyncPairingQrModal;
