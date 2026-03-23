"use client";

import { Github } from "lucide-react";

import styles from "./footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <span className={styles.credit}>
        made by{" "}
        <a
          href="https://x.com/eniolawtf"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.author}
        >
          @eniolawtf
        </a>
      </span>
      <span className={styles.dot}>·</span>
      <div className={styles.links}>
        <a
          href="https://github.com/prettyirrelevant/guessx"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.link}
          aria-label="GitHub"
        >
          <Github size={18} />
        </a>
      </div>
    </footer>
  );
}
