import Link from "next/link";
import type { Metadata } from "next";

import styles from "../error.module.css";

export const metadata: Metadata = {
  title: "offline — guessX",
  robots: { index: false },
};

export default function Offline() {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>
          guess<span className={styles.titleX}>X</span>
        </h1>
        <p className={styles.message}>you are offline</p>
        <p className={styles.hint}>guessX needs a connection to play. reconnect and try again.</p>
        <div className={styles.actions}>
          <Link href="/" className={styles.homeLink}>
            try again
          </Link>
        </div>
      </div>
    </div>
  );
}
