"use client";

import { useState, useEffect } from "react";
import styles from "./timer-bar.module.css";

export function TimerBar({
  startedAt,
  endsAt,
}: {
  startedAt?: number;
  endsAt?: number;
}) {
  const [progress, setProgress] = useState(1);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!startedAt || !endsAt) return;

    const total = endsAt - startedAt;

    const update = () => {
      const now = Date.now();
      const elapsed = now - startedAt;
      const remaining = Math.max(0, 1 - elapsed / total);
      setProgress(remaining);
      setSecondsLeft(Math.ceil(Math.max(0, (endsAt - now) / 1000)));
    };

    update();
    const interval = setInterval(update, 50);
    return () => clearInterval(interval);
  }, [startedAt, endsAt]);

  const isUrgent = secondsLeft <= 5;

  return (
    <div className={styles.container}>
      <div className={styles.track}>
        <div
          className={`${styles.fill} ${isUrgent ? styles.urgent : ""}`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className={`${styles.time} ${isUrgent ? styles.timeUrgent : ""}`}>
        {secondsLeft}s
      </span>
    </div>
  );
}
