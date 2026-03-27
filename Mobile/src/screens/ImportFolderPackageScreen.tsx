import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import JSZip from "jszip";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@components/Layout";
import { Text } from "@components/Text";
import { useTheme } from "@hooks/useTheme";
import { useFeedback } from "@components/FeedbackProvider";
import type { RootStackParamList } from "@navigation/RootNavigator";
import { folderPackageManifestSchema, importFolderPackage, type PackageConflictResolution, type PackageProgressEvent } from "@services/folderPackageService";
import { useAppStore } from "@store/useAppStore";
import type { Folder, ID } from "@models/types";

type Nav = NativeStackNavigationProp<RootStackParamList, "ImportFolderPackage">;

type WizardStep = "pick_file" | "analyzing" | "conflicts" | "importing" | "summary";

interface ProgressState {
  step: PackageProgressEvent["step"];
  progress: number;
  message: string;
  processed: number;
  total: number;
}

interface AnalyzeSummary {
  rootFolderName: string;
  folders: number;
  notes: number;
  quickNotes: number;
  files: number;
  assets: number;
}

interface ImportSummary {
  folders: number;
  notes: number;
  quickNotes: number;
  files: number;
}

const buildFolderDepthMap = (folders: Folder[]): Record<ID, number> => {
  const parentMap = new Map(folders.map((folder) => [folder.id, folder.parentId]));
  const memo: Record<ID, number> = {};

  const getDepth = (id: ID): number => {
    if (memo[id] !== undefined) return memo[id];
    const parent = parentMap.get(id);
    if (!parent) {
      memo[id] = 0;
      return 0;
    }
    memo[id] = Math.min(12, getDepth(parent) + 1);
    return memo[id];
  };

  for (const folder of folders) getDepth(folder.id);
  return memo;
};

const readManifestFromUri = async (fileUri: string) => {
  if (fileUri.endsWith(".json")) {
    const raw = await FileSystem.readAsStringAsync(fileUri);
    return folderPackageManifestSchema.parse(JSON.parse(raw));
  }

  const info = await FileSystem.getInfoAsync(fileUri);
  if (info.exists && info.isDirectory) {
    const raw = await FileSystem.readAsStringAsync(`${fileUri}/manifest.json`);
    return folderPackageManifestSchema.parse(JSON.parse(raw));
  }

  if (!fileUri.endsWith(".zip")) {
    throw new Error("Formato nao suportado. Use ZIP, pasta ou manifest.json.");
  }

  const b64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const entry = zip.file("manifest.json");
  if (!entry) throw new Error("manifest.json nao encontrado no pacote.");
  const manifestRaw = await entry.async("string");
  return folderPackageManifestSchema.parse(JSON.parse(manifestRaw));
};

const ImportFolderPackageScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { showToast } = useFeedback();
  const foldersMap = useAppStore((s) => s.folders);

  const [step, setStep] = useState<WizardStep>("pick_file");
  const [selectedFileUri, setSelectedFileUri] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeSummary | null>(null);
  const [conflictResolution, setConflictResolution] = useState<PackageConflictResolution>("create_new");
  const [destinationFolderId, setDestinationFolderId] = useState<ID | null>(null);
  const [progress, setProgress] = useState<ProgressState>({
    step: "analyzing",
    progress: 0,
    message: "Aguardando importacao...",
    processed: 0,
    total: 0
  });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ImportSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef(false);

  const folders = useMemo(
    () => Object.values(foldersMap).sort((a, b) => a.name.localeCompare(b.name)),
    [foldersMap]
  );
  const depthMap = useMemo(() => buildFolderDepthMap(folders), [folders]);

  useEffect(() => {
    // Reset cancel flag whenever screen mounts.
    cancelRef.current = false;
    return () => {
      cancelRef.current = true;
    };
  }, []);

  const pickPackage = async () => {
    try {
      setBusy(true);
      setWarnings([]);
      setErrors([]);
      setResult(null);
      setStep("analyzing");
      setProgress({
        step: "analyzing",
        progress: 0.05,
        message: "Selecionando pacote...",
        processed: 0,
        total: 0
      });

      const picker = await DocumentPicker.getDocumentAsync({
        type: ["application/zip", "application/json", "application/octet-stream", "*/*"],
        copyToCacheDirectory: true,
        multiple: false
      });
      if (picker.canceled || !picker.assets?.[0]) {
        setStep("pick_file");
        return;
      }

      const picked = picker.assets[0];
      setSelectedFileUri(picked.uri);
      setSelectedFileName(picked.name || picked.uri.split("/").pop() || "package.zip");
      setProgress({
        step: "analyzing",
        progress: 0.2,
        message: "Lendo manifest e contando itens...",
        processed: 0,
        total: 0
      });

      // Preview/analyze before import: wizard conflict step depends on this.
      const manifest = await readManifestFromUri(picked.uri);
      setAnalysis({
        rootFolderName: manifest.rootFolder.name,
        folders: manifest.folders.length,
        notes: manifest.notes.length,
        quickNotes: manifest.quickNotes.length,
        files: manifest.files.length,
        assets: manifest.assetRefs.length
      });
      setProgress({
        step: "analyzing",
        progress: 1,
        message: "Analise concluida.",
        processed: manifest.folders.length + manifest.notes.length + manifest.quickNotes.length + manifest.files.length,
        total: manifest.folders.length + manifest.notes.length + manifest.quickNotes.length + manifest.files.length
      });
      setStep("conflicts");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao analisar pacote.";
      showToast("Pacote invalido", "error");
      setErrors([message]);
      setStep("summary");
    } finally {
      setBusy(false);
    }
  };

  const startImport = async () => {
    if (!selectedFileUri) return;
    try {
      setBusy(true);
      setStep("importing");
      setWarnings([]);
      setErrors([]);
      setResult(null);
      cancelRef.current = false;

      const imported = await importFolderPackage(selectedFileUri, destinationFolderId, {
        conflictResolution,
        signal: {
          isCancelled: () => cancelRef.current
        },
        onMessage: (message, tone = "success") => showToast(message, tone),
        onProgress: (event) => {
          setProgress({
            step: event.step,
            progress: event.progress,
            message: event.message,
            processed: event.processed ?? 0,
            total: event.total ?? 0
          });
        }
      });

      setWarnings(imported.warnings);
      setErrors(imported.errors);
      setResult({
        folders: imported.importedFolders.length,
        notes: imported.importedNotes.length,
        quickNotes: imported.importedQuickNotes.length,
        files: imported.importedFiles.length
      });
      setStep("summary");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao importar pacote.";
      setErrors((prev) => [...prev, message]);
      setStep("summary");
      showToast("Falha ao importar pacote", "error");
    } finally {
      setBusy(false);
    }
  };

  const cancelImport = () => {
    // The service checks this signal between stages and loops.
    cancelRef.current = true;
    showToast("Cancelando importacao...");
    if (!busy) {
      navigation.goBack();
    }
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text variant="title">Import Folder Package</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="close" size={22} color={theme.colors.textPrimary} />
        </Pressable>
      </View>
      <Text muted style={styles.sub}>
        Wizard para importar estrutura completa de pastas, notes, quick notes e arquivos.
      </Text>

      {step === "pick_file" && (
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={styles.sectionTitle}>1) Selecionar pacote</Text>
          <Text muted>Escolha ZIP, pasta ou manifest.json para iniciar.</Text>
          <Pressable
            onPress={pickPackage}
            style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }, busy && styles.disabled]}
            disabled={busy}
          >
            {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : <Text style={{ color: theme.colors.onPrimary }}>Escolher pacote</Text>}
          </Pressable>
        </View>
      )}

      {step === "analyzing" && (
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={styles.sectionTitle}>Analisando pacote</Text>
          <Text muted>{progress.message}</Text>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.colors.primary, width: `${Math.round(progress.progress * 100)}%` }]} />
          </View>
          <Text muted>{Math.round(progress.progress * 100)}%</Text>
          <Pressable onPress={cancelImport} style={styles.secondaryBtn}>
            <Text muted>Cancelar</Text>
          </Pressable>
        </View>
      )}

      {step === "conflicts" && (
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={styles.sectionTitle}>2) Resoluccao de conflitos</Text>
          {!!analysis && (
            <View style={styles.summaryBox}>
              <Text>Pacote: {selectedFileName}</Text>
              <Text muted>Root: {analysis.rootFolderName}</Text>
              <Text muted>
                {analysis.folders} folders • {analysis.notes} notes • {analysis.quickNotes} quick notes • {analysis.files} files • {analysis.assets} assets
              </Text>
            </View>
          )}

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Destino</Text>
          <Pressable
            onPress={() => setDestinationFolderId(null)}
            style={[
              styles.destinationRow,
              { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
              destinationFolderId === null && { borderColor: theme.colors.primary, borderWidth: 1.5 }
            ]}
          >
            <Text>Root (sem pasta pai)</Text>
          </Pressable>
          <FlatList
            data={folders}
            keyExtractor={(item) => item.id}
            style={styles.destinationList}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setDestinationFolderId(item.id)}
                style={[
                  styles.destinationRow,
                  { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated, paddingLeft: 10 + depthMap[item.id] * 12 },
                  destinationFolderId === item.id && { borderColor: theme.colors.primary, borderWidth: 1.5 }
                ]}
              >
                <Text numberOfLines={1}>{item.name}</Text>
              </Pressable>
            )}
          />

          <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Estrategia</Text>
          {(["create_new", "rename", "replace"] as const).map((mode) => (
            <Pressable
              key={mode}
              onPress={() => setConflictResolution(mode)}
              style={[
                styles.conflictBtn,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceElevated },
                conflictResolution === mode && { borderColor: theme.colors.primary, borderWidth: 1.5 }
              ]}
            >
              <Text>{mode}</Text>
            </Pressable>
          ))}

          <View style={styles.actionsRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.secondaryBtn}>
              <Text muted>Cancelar</Text>
            </Pressable>
            <Pressable onPress={startImport} style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}>
              <Text style={{ color: theme.colors.onPrimary }}>Iniciar importacao</Text>
            </Pressable>
          </View>
        </View>
      )}

      {step === "importing" && (
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={styles.sectionTitle}>Importando pacote</Text>
          <Text muted>{progress.message}</Text>
          <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}>
            <View style={[styles.progressFill, { backgroundColor: theme.colors.primary, width: `${Math.round(progress.progress * 100)}%` }]} />
          </View>
          <Text muted>
            {Math.round(progress.progress * 100)}%{" "}
            {progress.total > 0 ? `• ${progress.processed}/${progress.total} itens` : ""}
          </Text>
          <Pressable onPress={cancelImport} style={styles.secondaryBtn}>
            <Text muted>Cancelar importacao</Text>
          </Pressable>
        </View>
      )}

      {step === "summary" && (
        <View style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <Text style={styles.sectionTitle}>Resumo final</Text>
          {!!result && (
            <Text muted>
              Importados: {result.folders} folders • {result.notes} notes • {result.quickNotes} quick notes • {result.files} files
            </Text>
          )}
          {!!warnings.length && (
            <View style={styles.listBlock}>
              <Text style={styles.warnTitle}>Warnings ({warnings.length})</Text>
              {warnings.slice(0, 6).map((item, index) => (
                <Text key={`w-${index}`} muted numberOfLines={2}>- {item}</Text>
              ))}
            </View>
          )}
          {!!errors.length && (
            <View style={styles.listBlock}>
              <Text style={styles.errorTitle}>Erros ({errors.length})</Text>
              {errors.slice(0, 6).map((item, index) => (
                <Text key={`e-${index}`} muted numberOfLines={2}>- {item}</Text>
              ))}
            </View>
          )}
          <View style={styles.actionsRow}>
            <Pressable onPress={() => navigation.goBack()} style={styles.secondaryBtn}>
              <Text muted>Fechar</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setStep("pick_file");
                setSelectedFileUri(null);
                setSelectedFileName(null);
                setAnalysis(null);
                setWarnings([]);
                setErrors([]);
                setResult(null);
              }}
              style={[styles.primaryBtn, { backgroundColor: theme.colors.primary }]}
            >
              <Text style={{ color: theme.colors.onPrimary }}>Importar outro</Text>
            </Pressable>
          </View>
        </View>
      )}
    </Screen>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sub: {
    marginTop: 6,
    marginBottom: 12
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 12,
    gap: 8
  },
  sectionTitle: {
    fontWeight: "700"
  },
  summaryBox: {
    gap: 3
  },
  progressTrack: {
    width: "100%",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 6
  },
  progressFill: {
    height: "100%",
    borderRadius: 999
  },
  destinationList: {
    maxHeight: 220
  },
  destinationRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 6
  },
  conflictBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  actionsRow: {
    marginTop: 6,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10
  },
  primaryBtn: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center"
  },
  secondaryBtn: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center"
  },
  listBlock: {
    marginTop: 4,
    gap: 2
  },
  warnTitle: {
    fontWeight: "700"
  },
  errorTitle: {
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.6
  }
});

export default ImportFolderPackageScreen;

