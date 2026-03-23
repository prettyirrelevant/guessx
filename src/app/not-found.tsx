import Link from "next/link";

import styles from "./error.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          guess<span className={styles.titleX}>X</span>
        </h1>
        <p className={styles.code}>404</p>
        <p className={styles.message}>page not found</p>
        <p className={styles.hint}>this page doesn&apos;t exist or may have been moved.</p>
        <Link href="/" className={styles.homeLink}>
          back to home
        </Link>
      </div>
    </div>
  );
}
