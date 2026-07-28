"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Github } from "lucide-react";

import styles from "./footer.module.css";

export function Footer() {
  const pathname = usePathname();
  if (pathname.startsWith("/room/")) return null;

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
      <Link href="/how-to-play" className={styles.textLink}>
        how to play
      </Link>
      <span className={styles.dot}>·</span>
      <Link href="/credits" className={styles.textLink}>
        credits
      </Link>
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
