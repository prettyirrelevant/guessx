"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { useToggle } from "@mantine/hooks";

import styles from "./audio-player.module.css";

function formatTime(s: number) {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// stable wave bar heights computed once per mount
const WAVE_BAR_HEIGHTS = Array.from({ length: 32 }, (_, i) => {
  const pseudo = Math.abs(Math.sin(i * 2.1) * 43758.5453) % 1;
  return 20 + Math.sin(i * 0.8) * 15 + pseudo * 10;
});

export function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, toggleMuted] = useToggle([false, true]);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackError, setPlaybackError] = useState("");

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      await audio.play();
      setPlaying(true);
      setPlaybackError("");
    } catch {
      setPlaying(false);
      setPlaybackError("audio could not play. try again.");
    }
  }, []);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? audio.currentTime / audio.duration : 0);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onError = () => {
      setPlaying(false);
      setPlaybackError("audio preview is unavailable.");
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("error", onError);

    audio
      .play()
      .then(() => {
        setPlaying(true);
      })
      .catch(() => {
        // browser blocked autoplay, user needs to click
      });

    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("error", onError);
      audio.pause();
      audio.src = "";
    };
  }, [src]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = muted;
    }
  }, [muted]);

  const seekToPointer = (clientX: number, element: HTMLDivElement) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;

    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
  };

  const handleSeekKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    let nextTime = audio.currentTime;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextTime -= 5;
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") nextTime += 5;
    else if (event.key === "Home") nextTime = 0;
    else if (event.key === "End") nextTime = duration;
    else return;
    event.preventDefault();
    audio.currentTime = Math.max(0, Math.min(duration, nextTime));
  };

  return (
    <div className={styles.player}>
      <button
        className={`${styles.playBtn} ${playing ? styles.playing : ""}`}
        onClick={() => void toggle()}
        aria-label={playing ? "pause" : "play"}
      >
        {playing ? <Pause size={22} /> : <Play size={22} />}
      </button>

      <div className={styles.controls}>
        <div
          className={styles.waveform}
          role="slider"
          aria-label="seek"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          tabIndex={0}
          onKeyDown={handleSeekKey}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            seekToPointer(event.clientX, event.currentTarget);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              seekToPointer(event.clientX, event.currentTarget);
            }
          }}
          onPointerUp={(event) => {
            seekToPointer(event.clientX, event.currentTarget);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <div className={styles.waveTrack}>
            <div className={styles.waveFill} style={{ width: `${progress * 100}%` }} />
          </div>
          {/* decorative wave bars */}
          <div className={styles.waveBars}>
            {WAVE_BAR_HEIGHTS.map((height, i) => {
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
        onClick={() => toggleMuted()}
        aria-label={muted ? "unmute" : "mute"}
        aria-pressed={muted}
      >
        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
      </button>
      {playbackError && (
        <span className={styles.srError} role="alert">
          {playbackError}
        </span>
      )}
    </div>
  );
}
