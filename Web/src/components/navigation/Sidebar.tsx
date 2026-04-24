import React from "react";
import {
  ChevronRight,
  Folder,
  House,
  Search,
  Settings,
  SquareCheckBig,
  Moon,
  Sun,
  Languages,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import styles from "./Sidebar.module.css";
import SidebarItem from "./SidebarItem";
import { useTheme } from "../../app/theme";

type NavItem = {
  labelKey: string;
  to: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  {
    labelKey: "home",
    to: "/",
    icon: House,
  },
  {
    labelKey: "search",
    to: "/search",
    icon: Search,
  },
  {
    labelKey: "folders",
    to: "/folders",
    icon: Folder,
  },
  {
    labelKey: "tasks",
    to: "/tasks",
    icon: SquareCheckBig,
  },
  {
    labelKey: "settings",
    to: "/settings",
    icon: Settings,
  },
];

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const toggleLanguage = () => {
    const nextLang = i18n.language === "en" ? "pt-BR" : "en";
    i18n.changeLanguage(nextLang);
  };

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
    >
      <button
        type="button"
        className={styles.edgeToggleButton}
        onClick={onToggle}
        aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
        title={collapsed ? t("expandSidebar") : t("collapseSidebar")}
      >
        <span
          className={`${styles.edgeToggleIcon} ${
            collapsed ? "" : styles.edgeToggleIconExpanded
          }`}
        >
          <ChevronRight size={16} />
        </span>
      </button>

      <div className={styles.brand}>
        <div className={styles.brandMark} aria-hidden="true">
          S
        </div>

        {!collapsed ? (
          <div>
            <p className={styles.brandTitle}>Spectru</p>
            <p className={styles.brandSubtitle}>Desktop</p>
          </div>
        ) : null}
      </div>

      <nav className={styles.nav} aria-label="Main navigation">
        {navItems.map((item) => (
          <SidebarItem
            key={item.to}
            to={item.to}
            label={t(item.labelKey)}
            icon={item.icon}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className={styles.sidebarFooter}>
        <button
          type="button"
          className={`${styles.themeToggle} ${
            collapsed ? styles.themeToggleCollapsed : ""
          }`}
          onClick={toggleLanguage}
          title={i18n.language === "en" ? t("portuguese") : t("english")}
        >
          <Languages className={styles.icon} />
          {!collapsed && (
            <span className={styles.navLabel}>
              {i18n.language === "en" ? "Português" : "English"}
            </span>
          )}
        </button>

        <button
          type="button"
          className={`${styles.themeToggle} ${
            collapsed ? styles.themeToggleCollapsed : ""
          }`}
          onClick={toggleTheme}
          title={theme === "light" ? t("darkMode") : t("lightMode")}
        >
          {theme === "light" ? (
            <Moon className={styles.icon} />
          ) : (
            <Sun className={styles.icon} />
          )}
          {!collapsed && (
            <span className={styles.navLabel}>
              {theme === "light" ? t("darkMode") : t("lightMode")}
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;