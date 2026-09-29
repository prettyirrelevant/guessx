import styles from "./loading-dots.module.css";

export function LoadingDots({ label }: { label?: string }) {
  return (
    <span
      className={styles.dots}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </span>
  );
}
