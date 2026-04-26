import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  House,
  Search,
  Folder,
  SquareCheckBig,
  Settings,
  Languages,
  Moon,
  Sun,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../../../app/theme";

const iconPng = "/icon.png";
import styles from "./AnimatedHomeMenu.module.css";

interface AnimatedHomeMenuProps {
  onBack?: () => void;
}

const navItems = [
  { labelKey: "home",     to: "/",        Icon: House          },
  { labelKey: "search",   to: "/search",  Icon: Search         },
  { labelKey: "folders",  to: "/folders", Icon: Folder         },
  { labelKey: "tasks",    to: "/tasks",   Icon: SquareCheckBig },
  { labelKey: "settings", to: "/settings",Icon: Settings       },
];

const AnimatedHomeMenu: React.FC<AnimatedHomeMenuProps> = ({ onBack }) => {
  const navigate        = useNavigate();
  const { t, i18n }    = useTranslation();
  const { theme, toggleTheme } = useTheme();

  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);

  const hideTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── All hover state lives on the wrapper only ──────────────────
  const handleWrapperEnter = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    setIsHovered(true);
    setMenuOpen(true);
  }, []);

  const handleWrapperLeave = useCallback(() => {
    // 220 ms is enough to cross the bridge + small gap
    hideTimer.current = setTimeout(() => {
      setIsHovered(false);
      setMenuOpen(false);
    }, 220);
  }, []);

  // Close on ESC or outside click ────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenuOpen(false); setIsHovered(false); }
    };
    const onPointer = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setIsHovered(false);
      }
    };
    window.addEventListener("keydown",   onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown",   onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [menuOpen]);

  const toggleLanguage = () => {
    const nextLang = i18n.language === "en" ? "pt-BR" : "en";
    i18n.changeLanguage(nextLang);
  };

  const handleNav = (to: string) => {
    setMenuOpen(false);
    setIsHovered(false);
    if (onBack) onBack();
    navigate(to);
  };

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      onMouseEnter={handleWrapperEnter}
      onMouseLeave={handleWrapperLeave}
    >
      {/* ── Animated Button ──────────────────────────────────────── */}
      <button
        className={`${styles.homeBtn} ${isHovered ? styles.homeBtnHovered : ""}`}
        onClick={() => setMenuOpen(v => !v)}
        aria-label="Menu principal"
        aria-haspopup="true"
        aria-expanded={menuOpen}
      >
        {/* House icon — fades out on hover */}
        <House
          size={20}
          className={`${styles.houseIcon} ${isHovered ? styles.houseIconHidden : ""}`}
        />
        {/* Logo — fades in on hover */}
        <img
          src={iconPng}
          alt="Spectru"
          className={`${styles.logoImg} ${isHovered ? styles.logoImgVisible : ""}`}
          draggable={false}
        />
      </button>

      {/* Transparent bridge — fills the gap so hover stays active */}
      <div className={styles.hoverBridge} aria-hidden="true" />

      {/* ── Dropdown ─────────────────────────────────────────────── */}
      <div
        className={`${styles.dropdown} ${menuOpen ? styles.dropdownOpen : ""}`}
        aria-hidden={!menuOpen}
      >
        {/* Brand header */}
        <div className={styles.dropdownBrand}>
          <img src={iconPng} alt="Spectru" className={styles.brandLogo} draggable={false} />
          <span className={styles.brandName}>Spectru</span>
        </div>

        <div className={styles.separator} />

        {navItems.map(({ labelKey, to, Icon }) => (
          <button key={to} className={styles.menuItem} onClick={() => handleNav(to)}>
            <Icon size={16} strokeWidth={1.8} />
            <span>{t(labelKey)}</span>
          </button>
        ))}

        <div className={styles.separator} />

        <button className={styles.menuItem} onClick={toggleLanguage}>
          <Languages size={16} strokeWidth={1.8} />
          <span>{i18n.language === "en" ? "Português" : "English"}</span>
        </button>
        <button className={styles.menuItem} onClick={toggleTheme}>
          {theme === "light"
            ? <Moon size={16} strokeWidth={1.8} />
            : <Sun  size={16} strokeWidth={1.8} />}
          <span>{theme === "light" ? t("darkMode") : t("lightMode")}</span>
        </button>
      </div>
    </div>
  );
};

export default AnimatedHomeMenu;
