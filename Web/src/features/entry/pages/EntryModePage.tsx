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

const EntryModePage: React.FC = () => {
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
          <h1>Choose how you want to use Spectru</h1>
          <p>Use web-only local data, or pair with your phone for real-time sync.</p>
        </header>

        <div className={styles.grid}>
          <article className={styles.card}>
            <div className={styles.cardIconWrap}>
              <Monitor size={20} />
            </div>
            <h2>Use Web App Only</h2>
            <p>
              Run everything in the browser with local-first storage. No mobile connection required.
            </p>
            <ul>
              <li>Local data on this browser</li>
              <li>No WebSocket connection</li>
              <li>Independent web workflow</li>
            </ul>
            <button type="button" className={styles.primaryButton} onClick={handleStandalone}>
              Continue in Standalone Mode
            </button>
          </article>

          <article className={styles.card}>
            <div className={styles.cardIconWrap}>
              <Smartphone size={20} />
            </div>
            <h2>Connect with Mobile</h2>
            <p>
              Open the mobile app, display its pairing QR/URL, then connect this browser to that ws:// address.
            </p>

            <div className={styles.inputsRow}>
              <label>
                Mobile IP
                <input
                  value={mobileIp}
                  onChange={(event) => setMobileIp(event.target.value)}
                  placeholder="192.168.x.x"
                />
              </label>
              <label>
                Port
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
                  Status: {syncStatus}
                </p>
              </div>
            </div>

            <div className={styles.actionsRow}>
              <button type="button" className={styles.secondaryButton} onClick={handleConnectMobile}>
                Start Pairing
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleEnterMobileSync}
                disabled={syncStatus !== "connected"}
              >
                Enter Mobile Sync Mode
              </button>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
};

export default EntryModePage;
