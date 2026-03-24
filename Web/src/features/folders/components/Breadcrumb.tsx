import React from "react";
import { ChevronRight, Home } from "lucide-react";
import styles from "./Breadcrumb.module.css";

type BreadcrumbSegment = {
  id: string | null;
  label: string;
};

type BreadcrumbProps = {
  segments: BreadcrumbSegment[];
  onNavigate: (index: number) => void;
};

const Breadcrumb: React.FC<BreadcrumbProps> = ({ segments, onNavigate }) => {
  return (
    <nav className={styles.root} aria-label="Folder path">
      {segments.map((segment, index) => {
        const isLast = index === segments.length - 1;

        return (
          <React.Fragment key={`${segment.id ?? "home"}-${index}`}>
            <button
              type="button"
              className={`${styles.segment} ${isLast ? styles.current : ""}`}
              onClick={() => onNavigate(index)}
              disabled={isLast}
              aria-current={isLast ? "page" : undefined}
            >
              {index === 0 ? <Home size={14} /> : null}
              <span>{segment.label}</span>
            </button>
            {!isLast ? (
              <span className={styles.separator} aria-hidden="true">
                <ChevronRight size={14} />
              </span>
            ) : null}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default Breadcrumb;
