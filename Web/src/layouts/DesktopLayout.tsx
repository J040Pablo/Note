import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/navigation/Sidebar";
import "../styles/layout.css";

const DesktopLayout: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const location = useLocation();

  const isCanvasEditorRoute = location.pathname.startsWith("/notes/");

  return (
    <div className="desktop-layout">
      {!isCanvasEditorRoute && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((current) => !current)}
        />
      )}
      <main
        className={`main-content ${
          (sidebarCollapsed && !isCanvasEditorRoute) ? "main-content--collapsed" : ""
        }`}
        style={isCanvasEditorRoute ? { marginLeft: 0, padding: 0 } : {}}
      >
        <Outlet />
      </main>
    </div>
  );
};

export default DesktopLayout;