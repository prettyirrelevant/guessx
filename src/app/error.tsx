"use client";

import Link from "next/link";

import styles from "./error.module.css";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          guess<span className={styles.titleX}>X</span>
        </h1>
        <p className={styles.message}>something went wrong</p>
        <p className={styles.hint}>
          an unexpected error occurred. you can try again or head back home.
        </p>
        <div className={styles.actions}>
          <button className={styles.retryBtn} onClick={reset}>
            try again
          </button>
          <Link href="/" className={styles.homeLink}>
            back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
