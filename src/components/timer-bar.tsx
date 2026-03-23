"use client";

import { useState, useEffect } from "react";
import { useInterval } from "@mantine/hooks";

import styles from "./timer-bar.module.css";

export function TimerBar({ startedAt, endsAt }: { startedAt?: number; endsAt?: number }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);

  const { start, stop } = useInterval(() => {
    if (endsAt) {
      setSecondsLeft(Math.ceil(Math.max(0, (endsAt - Date.now()) / 1000)));
    }
  }, 200);

  useEffect(() => {
    if (!startedAt || !endsAt) {
      stop();
      return;
    }

    setTotalSeconds(Math.ceil((endsAt - startedAt) / 1000));
    setSecondsLeft(Math.ceil(Math.max(0, (endsAt - Date.now()) / 1000)));
    start();

    return stop;
  }, [startedAt, endsAt, start, stop]);

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
      >
        {secondsLeft}s
      </span>
    </div>
  );
}
