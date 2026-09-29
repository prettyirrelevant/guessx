"use client";

import { useSecondsLeft } from "@/lib/room-connection";

import styles from "./timer-bar.module.css";

export function TimerBar({ startedAt, endsAt }: { startedAt?: number; endsAt?: number }) {
  const secondsLeft = useSecondsLeft(endsAt);
  const totalSeconds = startedAt && endsAt ? Math.ceil((endsAt - startedAt) / 1000) : 0;
  const isUrgent = secondsLeft <= 5;
  const isWarning = secondsLeft <= 10 && !isUrgent;

  return (
    <div className={styles.container}>
      <div className={styles.beads}>
        {Array.from({ length: totalSeconds }).map((_, i) => {
          const isActive = i < secondsLeft;

          let stateClass = styles.beadInactive;
          if (isActive) {
            if (isUrgent) stateClass = styles.beadUrgent;
            else if (isWarning) stateClass = styles.beadWarning;
            else stateClass = styles.beadActive;
          }

          return <div key={i} className={`${styles.bead} ${stateClass}`} />;
        })}
      </div>
      <span
        className={`${styles.time} ${isUrgent ? styles.timeUrgent : isWarning ? styles.timeWarning : ""}`}
        role="timer"
        aria-label={`${secondsLeft} seconds left`}
      >
        {secondsLeft}s
      </span>
    </div>
  );
}
