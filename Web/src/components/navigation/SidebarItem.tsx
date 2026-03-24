import React from "react";
import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import styles from "./Sidebar.module.css";

type SidebarItemProps = {
  to: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
};

const SidebarItem: React.FC<SidebarItemProps> = ({ to, label, icon: Icon, collapsed }) => {
  return (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        `${styles.navItem} ${collapsed ? styles.navItemCollapsed : ""} ${isActive ? styles.navItemActive : ""}`
      }
    >
      <span className={styles.icon}>
        <Icon size={18} strokeWidth={2} />
      </span>
      {!collapsed ? <span className={styles.navLabel}>{label}</span> : null}
    </NavLink>
  );
};

export default SidebarItem;
