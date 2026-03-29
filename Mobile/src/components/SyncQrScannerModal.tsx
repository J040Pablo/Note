import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "@hooks/useTheme";
import { Text } from "@components/Text";
import { connectTaskSyncClient, getTaskSyncClientStatus } from "@services/sync/taskSyncClient";

type PermissionState = "granted" | "denied" | "undetermined";
type CameraModule = {
  CameraView: React.ComponentType<any>;
  Camera: {
    requestCameraPermissionsAsync: () => Promise<{ status: string }>;
  };
};

type SyncQrScannerModalProps = {
  visible: boolean;
  onClose: () => void;
};

const SyncQrScannerModal: React.FC<SyncQrScannerModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const [permission, setPermission] = useState<PermissionState>("undetermined");
  const [cameraModule, setCameraModule] = useState<CameraModule | null>(null);
  const [scanned, setScanned] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [statusText, setStatusText] = useState("Point camera to QR code");

  useEffect(() => {
    if (!visible) return;

    setScanned(false);
    setConnecting(false);
    setStatusText("Point camera to QR code");

    try {
      const loaded = require("expo-camera") as CameraModule;
      setCameraModule(loaded);

      loaded.Camera.requestCameraPermissionsAsync()
        .then((result) => {
          setPermission(result.status === "granted" ? "granted" : "denied");
        })
        .catch(() => setPermission("denied"));
    } catch {
      setCameraModule(null);
      setPermission("denied");
      setStatusText("Camera module not found in this build. Rebuild app and reinstall.");
    }
  }, [visible]);

  const canScan = useMemo(() => permission === "granted" && !scanned && !connecting, [permission, scanned, connecting]);

  const handleScanned = async ({ data }: { data: string }) => {
    if (!canScan) return;

    setScanned(true);
    const raw = String(data ?? "").trim();

    if (!/^wss?:\/\//i.test(raw)) {
      setStatusText("Invalid QR: expected ws://IP:PORT");
      return;
    }

    setConnecting(true);
    setStatusText("Connecting...");

    try {
      await connectTaskSyncClient(raw);
      const status = getTaskSyncClientStatus();
      if (status === "connected") {
        setStatusText("Connected successfully ✓");
      } else {
        setStatusText("Connection closed");
      }
    } catch {
      setStatusText("Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}> 
          <Text variant="subtitle">Scan Web QR Pairing</Text>
          <Text muted style={styles.help}>Use QR from Web Tasks page.</Text>

          <View style={[styles.cameraWrap, { borderColor: theme.colors.border }]}> 
            {permission === "granted" && cameraModule?.CameraView ? (
              <cameraModule.CameraView
                style={StyleSheet.absoluteFill}
                onBarcodeScanned={canScan ? handleScanned : undefined}
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              />
            ) : permission === "denied" ? (
              <View style={styles.centered}>
                <Text muted>{cameraModule ? "Camera permission denied" : "Camera unavailable in this build"}</Text>
              </View>
            ) : (
              <View style={styles.centered}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            )}
          </View>

          <Text muted style={styles.status}>{statusText}</Text>

          <View style={styles.actions}>
            <Pressable
              style={[styles.button, { borderColor: theme.colors.border }]}
              onPress={() => {
                if (connecting) return;
                setScanned(false);
                setStatusText("Point camera to QR code");
              }}
            >
              <Text muted>Scan again</Text>
            </Pressable>
            <Pressable
              style={[styles.button, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primaryAlpha20 }]}
              onPress={onClose}
            >
              <Text style={{ color: theme.colors.primary }}>Done</Text>
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
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    padding: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  help: {
    marginTop: 4,
    marginBottom: 10,
  },
  cameraWrap: {
    height: 280,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden"
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  status: {
    marginTop: 10,
  },
  actions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  button: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
});

export default SyncQrScannerModal;
