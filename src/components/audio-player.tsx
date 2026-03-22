"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import styles from "./audio-player.module.css";

export function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      audio.pause();
    } else {
      audio.play().catch(() => {
        // browser blocked autoplay, user needs to click
      });
    }
    setPlaying(!playing);
  }, [playing]);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.addEventListener("loadedmetadata", () => {
      setDuration(audio.duration);
    });

    audio.addEventListener("timeupdate", () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    });

    audio.addEventListener("ended", () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    });

    audio.play().then(() => {
      setPlaying(true);
    }).catch(() => {
      // browser blocked autoplay, user needs to click
    });

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  return (
    <div className={styles.player}>
      <button
        className={`${styles.playBtn} ${playing ? styles.playing : ""}`}
        onClick={toggle}
        aria-label={playing ? "pause" : "play"}
      >
        {playing ? <Pause size={22} /> : <Play size={22} />}
      </button>

      <div className={styles.controls}>
        <div className={styles.waveform} onClick={handleSeek}>
          <div className={styles.waveTrack}>
            <div
              className={styles.waveFill}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {/* decorative wave bars */}
          <div className={styles.waveBars}>
            {Array.from({ length: 32 }).map((_, i) => {
              const height = 20 + Math.sin(i * 0.8) * 15 + Math.random() * 10;
              const filled = i / 32 <= progress;
              return (
                <div
                  key={i}
                  className={`${styles.waveBar} ${filled ? styles.waveBarFilled : ""} ${playing ? styles.waveBarAnimated : ""}`}
                  style={{
                    height: `${height}%`,
                    animationDelay: playing ? `${i * 30}ms` : undefined,
                  }}
                />
              );
            })}
          </div>
        </div>

        <div className={styles.timeRow}>
          <span className={styles.time}>{formatTime(currentTime)}</span>
          <span className={styles.time}>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        className={styles.muteBtn}
        onClick={() => setMuted(!muted)}
        aria-label={muted ? "unmute" : "mute"}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
    </div>
  );
}
