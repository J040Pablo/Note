import React from "react";
import { useNavigate } from "react-router-dom";
import { Download, Upload, LogOut, Check, AlertTriangle } from "lucide-react";
import PageContainer from "../../../components/ui/PageContainer";
import { useAppMode } from "../../../app/mode";
import { disconnectTaskSync } from "../../tasks/sync";
import { exportCompleteBackup, importBackupFile } from "../../../services/backupService";
import { importCompleteStore } from "../../../services/webData";
import { subscribeSyncBridge } from "../../../services/syncBridge";
import styles from "./SettingsPage.module.css";

import { useTranslation } from "react-i18next";

const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clearMode } = useAppMode();
  const [loading, setLoading] = React.useState(false);
  const [successMsg, setSuccessMsg] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleLogout = React.useCallback(() => {
    const confirmed = window.confirm(t("logoutConfirm"));
    if (!confirmed) return;

    disconnectTaskSync();
    clearMode();
    navigate("/entry", { replace: true });
  }, [clearMode, navigate, t]);

  const handleExport = async () => {
    try {
      setLoading(true);
      setSuccessMsg(null);
      await exportCompleteBackup();
      setSuccessMsg(t("backupExportSuccess"));
    } catch (err) {
      alert(t("backupExportError"));
    } finally {
      setLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(t("backupImportConfirm"));
    if (!confirmed) {
      e.target.value = "";
      return;
    }

    try {
      setLoading(true);
      setSuccessMsg(null);
      
      const data = await importBackupFile(file);
      
      // Save current state to sessionStorage as temporary safety fallback
      const current = localStorage.getItem("note.web.data.v1");
      if (current) {
        sessionStorage.setItem("note.web.data.v1.undo", current);
      }

      importCompleteStore(data);
      setSuccessMsg(t("backupImportSuccess"));
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);

    } catch (err) {
      alert(err instanceof Error ? err.message : t("backupImportError"));
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <PageContainer title={t("settings")} subtitle={t("settingsSubtitle")}>
      <div className={styles.container}>
        
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("backupRestore")}</h2>
          <p className={styles.description}>
            {t("backupDescription")}
          </p>
          
          <div className={styles.actions}>
            <button 
              className={styles.button} 
              onClick={handleExport}
              disabled={loading}
            >
              <Download size={18} />
              {loading ? t("exporting") : t("exportBackup")}
            </button>

            <button 
              className={styles.button} 
              onClick={handleImportClick}
              disabled={loading}
            >
              <Upload size={18} />
              {loading ? t("importing") : t("importBackup")}
            </button>
            <input 
              type="file" 
              className={styles.hideInput} 
              ref={fileInputRef} 
              accept=".zip" 
              onChange={handleFileChange}
            />
          </div>

          {successMsg && (
            <div style={{ color: "#059669", display: "flex", alignItems: "center", gap: "8px", fontSize: "0.9rem", marginTop: "8px" }}>
              <Check size={16} /> {successMsg}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("sessionSection")}</h2>
          <p className={styles.description}>
            {t("sessionDescription")}
          </p>
          <div className={styles.actions}>
            <button
              type="button"
              onClick={handleLogout}
              className={styles.logoutButton}
            >
              <LogOut size={18} style={{ marginRight: "8px", verticalAlign: "middle" }} />
              {t("logoutButton")}
            </button>
          </div>
        </section>
      </div>
    </PageContainer>
  );
};

export default SettingsPage;
