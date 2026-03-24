import React from "react";
import {
  ChevronRight,
  Folder,
  House,
  Search,
  Settings,
  SquareCheckBig,
  type LucideIcon,
} from "lucide-react";
import styles from "./Sidebar.module.css";
import SidebarItem from "./SidebarItem";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  {
    label: "Home",
    to: "/",
    icon: House,
  },
  {
    label: "Search",
    to: "/search",
    icon: Search,
  },
  {
    label: "Folders",
    to: "/folders",
    icon: Folder,
  },
  {
    label: "Tasks",
    to: "/tasks",
    icon: SquareCheckBig,
  },
  {
    label: "Settings",
    to: "/settings",
    icon: Settings,
  },
];

type SidebarProps = {
  collapsed: boolean;
  onToggle: () => void;
};

const Sidebar: React.FC<SidebarProps> = ({ collapsed, onToggle }) => {
  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}
    >
      <button
        type="button"
        className={styles.edgeToggleButton}
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
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
          L
        </div>

        {!collapsed ? (
          <div>
            <p className={styles.brandTitle}>Life Organizer</p>
            <p className={styles.brandSubtitle}>Desktop</p>
          </div>
        ) : null}
      </div>

      <nav className={styles.nav} aria-label="Main navigation">
        {navItems.map((item) => (
          <SidebarItem
            key={item.to}
            to={item.to}
            label={item.label}
            icon={item.icon}
            collapsed={collapsed}
          />
        ))}
      </nav>
    </aside>
  );
};

export default Sidebar;