import { Circle, Square, Triangle } from "lucide-react";

import styles from "./preparing-motif.module.css";

// A mode-specific "building your game" motif that previews what you're about to
// play, in place of a generic loader.
export function PreparingMotif({ mode }: { mode: string }) {
  if (mode === "music") {
    return (
      <div className={styles.eq} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.11}s` }} />
        ))}
      </div>
    );
  }

  if (mode === "flag") {
    return (
      <div className={styles.stripes} aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    );
  }

  if (mode === "actor") {
    return (
      <div className={styles.film} aria-hidden>
        <div className={styles.strip}>
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shapes} aria-hidden>
      {[Triangle, Square, Circle].map((Icon, i) => (
        <Icon key={i} size={30} strokeWidth={2.5} style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}
