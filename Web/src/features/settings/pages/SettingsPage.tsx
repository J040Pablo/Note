import React from "react";
import { useNavigate } from "react-router-dom";
import PageContainer from "../../../components/ui/PageContainer";
import { useAppMode } from "../../../app/mode";
import { disconnectTaskSync } from "../../tasks/sync";

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
      <div style={{ maxWidth: 520 }}>
        <p style={{ color: "#94a3b8", marginTop: 0 }}>
          Saia da sessao atual para voltar para a tela de entrada.
        </p>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            border: "none",
            borderRadius: 10,
            padding: "0.7rem 1rem",
            background: "#ef4444",
            color: "#ffffff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sair
        </button>
      </div>
    </PageContainer>
  );
};

export default SettingsPage;
