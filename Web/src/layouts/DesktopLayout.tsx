import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/navigation/Sidebar";
import "../styles/layout.css";

const DesktopLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  return (
    <div className="desktop-layout">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
      />
      <main
        className={`main-content ${
          sidebarCollapsed ? "main-content--collapsed" : ""
        }`}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default DesktopLayout;