import React from "react";
import styles from "./Header.module.css";

type HeaderProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
};

const Header: React.FC<HeaderProps> = ({ title, subtitle, action }) => {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.title}>{title}</h1>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  );
};

export default Header;
