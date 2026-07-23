import Link from "next/link";

import styles from "./error.module.css";

export default function NotFound() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <p className={styles.code}>404</p>
        <p className={`${styles.message} ${styles.lead}`}>page not found</p>
        <Link href="/" className={styles.homeLink}>
          back to home
        </Link>
      </div>
    </div>
  );
}
