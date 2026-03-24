import React from "react";
import styles from "./PageContainer.module.css";
import Header from "./Header";

type PageContainerProps = {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
};

const PageContainer: React.FC<PageContainerProps> = ({
  title,
  subtitle,
  action,
  children,
}) => {
  return (
    <section className={styles.page}>
      <Header title={title} subtitle={subtitle} action={action} />

      <div>{children}</div>
    </section>
  );
};

export default PageContainer;
