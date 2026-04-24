import React, { useState, useCallback } from "react";
import { Modal, View, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Text } from "./Text";
import { useTheme, spacing } from "@hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import { exportCompleteBackup, importCompleteBackup } from "@services/backupService";
import * as DocumentPicker from "expo-document-picker";
import { AppAlertModal } from "./AppAlertModal";
import { error as logError } from "@utils/logger";

interface BackupModalProps {
  visible: boolean;
  onClose: () => void;
}

export const BackupModal: React.FC<BackupModalProps> = ({ visible, onClose }) => {
  const { theme } = useTheme();
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "success" | "error" | "warning" | "info";
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "info"
  });

  const showAlert = (title: string, message: string, type: any = "info", onConfirm?: () => void, cancelLabel?: string) => {
    setAlert({ 
      visible: true, 
      title, 
      message, 
      type, 
      onConfirm: onConfirm || (() => setAlert(prev => ({ ...prev, visible: false }))),
      cancelLabel 
    });
  };

  const handleExport = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await exportCompleteBackup();
      showAlert("Sucesso", "Backup exportado com sucesso.", "success");
    } catch (err) {
      showAlert("Erro", "Não foi possível exportar o backup.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (loading) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/zip",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;
      const file = result.assets[0];

      showAlert(
        "Confirmação Crítica",
        "Isso apagará todos os dados atuais e substituirá pelo backup importado. Deseja continuar?",
        "warning",
        async () => {
          setAlert(prev => ({ ...prev, visible: false }));
          setLoading(true);
          try {
            await importCompleteBackup(file.uri);
            showAlert("Sucesso", "Backup restaurado com sucesso.", "success");
          } catch (err) {
            showAlert("Erro", "Não foi possível importar este backup.", "error");
          } finally {
            setLoading(false);
          }
        },
        "Cancelar"
      );
    } catch (err) {
      logError("[backup-modal] picker error", err);
      showAlert("Erro", "Não foi possível abrir o seletor de arquivos.", "error");
    }
  };

  return (
    <>
      <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <Pressable style={styles.dismissArea} onPress={onClose} />
          <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
            <View style={styles.header}>
              <Text variant="subtitle">Backup & Restore</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
              </Pressable>
            </View>

            <Text muted style={styles.description}>
              O backup salva todos os seus dados (pastas, notas, tarefas e arquivos) em um único arquivo ZIP para restauração futura.
            </Text>

            <View style={styles.actions}>
              <Pressable 
                onPress={handleExport}
                disabled={loading}
                style={[styles.actionButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
              >
                <Ionicons name="cloud-download-outline" size={20} color={theme.colors.primary} />
                <View style={styles.actionText}>
                  <Text style={styles.actionTitle}>Exportar backup completo</Text>
                  <Text variant="caption" muted>Gera um arquivo .zip para salvar</Text>
                </View>
                {loading && <ActivityIndicator size="small" color={theme.colors.primary} />}
              </Pressable>

              <Pressable 
                onPress={handleImport}
                disabled={loading}
                style={[styles.actionButton, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated }]}
              >
                <Ionicons name="cloud-upload-outline" size={20} color={theme.colors.secondary} />
                <View style={styles.actionText}>
                  <Text style={styles.actionTitle}>Importar backup</Text>
                  <Text variant="caption" muted>Substitui todos os dados atuais</Text>
                </View>
              </Pressable>
            </View>

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={{ marginTop: spacing.sm, color: theme.colors.primary }}>Processando...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <AppAlertModal
        visible={alert.visible}
        title={alert.title}
        message={alert.message}
        type={alert.type as any}
        confirmLabel={alert.type === "warning" ? "Importar e substituir" : "OK"}
        cancelLabel={alert.cancelLabel}
        onConfirm={alert.onConfirm}
        onCancel={() => setAlert(prev => ({ ...prev, visible: false }))}
        loading={loading}
      />
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end"
  },
  dismissArea: {
    flex: 1
  },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: spacing.md,
    paddingBottom: 40
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm
  },
  closeButton: {
    padding: 4
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.lg
  },
  actions: {
    gap: spacing.md
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.md
  },
  actionText: {
    flex: 1
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: "600"
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.7)",
    justifyContent: "center",
    alignItems: "center",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    zIndex: 10
  }
});
