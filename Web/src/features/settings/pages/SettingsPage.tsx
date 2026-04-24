import React from "react";
import { useNavigate } from "react-router-dom";
import PageContainer from "../../../components/ui/PageContainer";
import { useAppMode } from "../../../app/mode";
import { disconnectTaskSync } from "../../tasks/sync";
import styles from "./SettingsPage.module.css";

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { clearMode } = useAppMode();

  const handleLogout = React.useCallback(() => {
    const confirmed = window.confirm("Tem certeza que deseja sair?");
    if (!confirmed) return;

    // Garante encerramento de sessao local e desconexao de sync.
    disconnectTaskSync();
    clearMode();
    navigate("/entry", { replace: true });
  }, [clearMode, navigate]);

  return (
    <PageContainer title="Settings" subtitle="Account and app session">
      <div className={styles.container}>
        <p className={styles.description}>
          Saia da sessao atual para voltar para a tela de entrada.
        </p>

        <button
          type="button"
          onClick={handleLogout}
          className={styles.logoutButton}
        >
          Sair
        </button>
      </div>
    </PageContainer>
  );
};

export default SettingsPage;
