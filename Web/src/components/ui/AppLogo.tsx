import React from "react";
import styles from "./AppLogo.module.css";
import logo from "../../../assets/icon.png";

type AppLogoProps = {
  size?: number | string;
  className?: string;
  variant?: "sidebar" | "entry" | "header" | "default";
};

const AppLogo: React.FC<AppLogoProps> = ({ 
  size, 
  className = "", 
  variant = "default" 
}) => {
  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
  };

  return (
    <div 
      className={`${styles.logoContainer} ${styles[variant]} ${className}`} 
      style={containerStyle}
    >
      <img 
        src={logo} 
        alt="Spectru Logo" 
        className={styles.logoImage}
      />
    </div>
  );
};

export default AppLogo;
