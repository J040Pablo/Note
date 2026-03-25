import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from "react-native";
import { Camera, CameraView } from "expo-camera";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";

type QRScannerProps = {
  onClose: () => void;
  onScan: (data: string) => void;
};

const QRScanner: React.FC<QRScannerProps> = ({ onClose, onScan }) => {
  const { theme } = useTheme();
  const [permission, setPermission] = useState<"granted" | "denied" | "undetermined">("undetermined");
  const [scanned, setScanned] = useState(false);
  const [statusText, setStatusText] = useState("Point camera to a QR code");

  useEffect(() => {
    setScanned(false);
    setStatusText("Point camera to a QR code");

    Camera.requestCameraPermissionsAsync()
      .then((result) => {
        setPermission(result.status === "granted" ? "granted" : "denied");
      })
      .catch(() => {
        setPermission("denied");
      });
  }, []);

  const canScan = useMemo(() => permission === "granted" && !scanned, [permission, scanned]);

  const handleScan = async ({ data }: { data: string }) => {
    if (!canScan) return;

    setScanned(true);
    const scannedUrl = String(data ?? "").trim();
    console.log("QR scanned:", scannedUrl);
    onScan(scannedUrl);

    if (!/^wss?:\/\//i.test(scannedUrl)) {
      setStatusText("Invalid QR. Expected ws://IP:PORT");
      return;
    }

    setStatusText("QR scanned ✓");
    onClose();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission === "granted" ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={canScan ? handleScan : undefined}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          />
        ) : (
          <View style={[styles.permissionFallback, { backgroundColor: theme.colors.background }]}>
            {permission === "undetermined" ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : (
              <Text muted>Camera permission denied</Text>
            )}
          </View>
        )}

        <View style={styles.overlay}>
          <View style={[styles.topBar, { backgroundColor: "rgba(0,0,0,0.55)" }]}> 
            <Text style={{ color: "#fff", flex: 1 }}>Scan QR</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={{ color: "#fff" }}>Close</Text>
            </Pressable>
          </View>

          <View style={[styles.statusBar, { backgroundColor: "rgba(0,0,0,0.55)" }]}> 
            <Text style={{ color: "#fff" }}>{statusText}</Text>
            {scanned && (
              <Pressable
                style={[styles.scanAgainBtn, { borderColor: "rgba(255,255,255,0.45)" }]}
                onPress={() => {
                  setScanned(false);
                  setStatusText("Point camera to a QR code");
                }}
              >
                <Text style={{ color: "#fff" }}>Scan again</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  permissionFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  topBar: {
    marginTop: 44,
    marginHorizontal: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.45)",
  },
  statusBar: {
    marginBottom: 24,
    marginHorizontal: 12,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  scanAgainBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});

export default QRScanner;
