import React from "react";
import { Smartphone, Monitor, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAppMode } from "../../../app/mode";
import {
  connectTaskSync,
  disconnectTaskSync,
  getTaskSyncStatus,
  subscribeTaskSyncStatus,
} from "../../tasks/sync";
import styles from "./EntryModePage.module.css";

import { useTranslation } from "react-i18next";
import { AppLogo } from "../../../components/ui";

const EntryModePage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setMode } = useAppMode();

  const [mobileIp, setMobileIp] = React.useState<string>(() => localStorage.getItem("tasks.sync.ip") ?? "192.168.1.107");
  const [mobilePort, setMobilePort] = React.useState<string>(() => localStorage.getItem("tasks.sync.port") ?? "8787");
  const [syncStatus, setSyncStatus] = React.useState(getTaskSyncStatus());

  const pairingUrl = React.useMemo(() => {
    const ip = mobileIp.trim();
    if (!ip) return "";

    const normalizedPort = mobilePort.replace(/\D+/g, "") || "8787";
    return `ws://${ip}:${normalizedPort}`;
  }, [mobileIp, mobilePort]);

  React.useEffect(() => {
    const unsubStatus = subscribeTaskSyncStatus(setSyncStatus);
    return () => {
      unsubStatus();
    };
  }, []);

  const handleStandalone = React.useCallback(() => {
    disconnectTaskSync();
    setMode("standalone");
    navigate("/", { replace: true });
  }, [navigate, setMode]);

  const handleConnectMobile = React.useCallback(() => {
    if (!pairingUrl) return;

    localStorage.setItem("tasks.sync.ip", mobileIp.trim());
    localStorage.setItem("tasks.sync.port", mobilePort.replace(/\D+/g, "") || "8787");
    connectTaskSync(pairingUrl);
  }, [mobileIp, mobilePort, pairingUrl]);

  const handleEnterMobileSync = React.useCallback(() => {
    setMode("mobile-sync");
    navigate("/", { replace: true });
  }, [navigate, setMode]);

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <header className={styles.header}>
          <AppLogo size={80} variant="entry" className={styles.mainLogo} />
          <h1>{t("entryTitle")}</h1>
          <p>{t("entrySubtitle")}</p>
        </header>

        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardIconWrap}>
              <Monitor size={20} />
            </div>
            <h2>{t("useWebOnly")}</h2>
            <p>
              {t("useWebOnlyDescription")}
            </p>
            <ul>
              <li>{t("localDataBrowser")}</li>
              <li>{t("noWebSocket")}</li>
              <li>{t("independentWorkflow")}</li>
            </ul>
            <button type="button" className={styles.primaryButton} onClick={handleStandalone}>
              {t("continueStandalone")}
            </button>
          </article>

          <article className={styles.card}>
            <div className={styles.cardIconWrap}>
              <Smartphone size={20} />
            </div>
            <h2>{t("connectWithMobile")}</h2>
            <p>
              {t("connectWithMobileDescription")}
            </p>

            <div className={styles.inputsRow}>
              <label>
                {t("mobileIpLabel")}
                <input
                  value={mobileIp}
                  onChange={(event) => setMobileIp(event.target.value)}
                  placeholder="192.168.x.x"
                />
              </label>
              <label>
                {t("mobilePortLabel")}
                <input
                  value={mobilePort}
                  onChange={(event) => setMobilePort(event.target.value.replace(/\D+/g, ""))}
                  placeholder="8787"
                />
              </label>
            </div>

            <div className={styles.qrWrap}>
              <div className={styles.pairingMeta}>
                <p className={styles.wsUrl}>{pairingUrl || "ws://<mobile-ip>:8787"}</p>
                <p className={styles.statusLine}>
                  <Link2 size={14} />
                  {t("pairingStatus", { status: t(syncStatus) })}
                </p>
              </div>
            </div>

            <div className={styles.actionsRow}>
              <button type="button" className={styles.secondaryButton} onClick={handleConnectMobile}>
                {t("startPairing")}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleEnterMobileSync}
                disabled={syncStatus !== "connected"}
              >
                {t("enterMobileSyncMode")}
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
};


export default EntryModePage;
