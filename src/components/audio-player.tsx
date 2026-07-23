"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { useToggle, useReducedMotion } from "@mantine/hooks";

import styles from "./audio-player.module.css";

function formatTime(s: number) {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// number of amplitude samples we keep for the whole clip; we down-sample this
// to however many bars fit the canvas at draw time.
const PEAK_RESOLUTION = 256;
const MIN_PEAK = 0.05;

type Colors = { played: string; unplayed: string };

// deterministic stand-in waveform, used until the real audio decodes and if
// decoding ever fails. it still reads as a plausible, seekable clip.
function fallbackPeaks(src: string): number[] {
  let seed = 0;
  for (let i = 0; i < src.length; i++) seed = (seed + src.charCodeAt(i) * (i + 1)) % 9973;
  return Array.from({ length: PEAK_RESOLUTION }, (_, i) => {
    const t = i / PEAK_RESOLUTION;
    const envelope = Math.sin(t * Math.PI); // fade in and out at the edges
    const detail = Math.abs(Math.sin(i * 0.7 + seed) * Math.sin(i * 0.13 + seed * 0.5));
    return Math.max(MIN_PEAK, envelope * (0.3 + 0.5 * detail));
  });
}

async function decodePeaks(src: string, signal: AbortSignal): Promise<number[]> {
  const response = await fetch(src, { signal });
  const raw = await response.arrayBuffer();
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const context = new AudioCtx();
  try {
    const buffer = await context.decodeAudioData(raw);
    const channel = buffer.getChannelData(0);
    const block = Math.max(1, Math.floor(channel.length / PEAK_RESOLUTION));
    const peaks: number[] = Array.from({ length: PEAK_RESOLUTION });
    let max = 0;
    for (let i = 0; i < PEAK_RESOLUTION; i++) {
      let peak = 0;
      const start = i * block;
      for (let j = 0; j < block; j++) {
        const value = Math.abs(channel[start + j] || 0);
        if (value > peak) peak = value;
      }
      peaks[i] = peak;
      if (peak > max) max = peak;
    }
    const norm = max > 0 ? 1 / max : 1;
    for (let i = 0; i < PEAK_RESOLUTION; i++) peaks[i] = Math.max(MIN_PEAK, peaks[i] * norm);
    return peaks;
  } finally {
    void context.close();
  }
}

// map the stored peaks down to `bars` values, taking the loudest sample per
// bar so short transients stay visible.
function sampleBars(peaks: number[], bars: number): number[] {
  const out: number[] = Array.from({ length: bars });
  const step = peaks.length / bars;
  for (let b = 0; b < bars; b++) {
    let peak = 0;
    const start = Math.floor(b * step);
    const end = Math.max(start + 1, Math.floor((b + 1) * step));
    for (let i = start; i < end; i++) if (peaks[i] > peak) peak = peaks[i];
    out[b] = peak;
  }
  return out;
}

export function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peaksRef = useRef<number[] | null>(null);
  const colorsRef = useRef<Colors>({ played: "#c8f135", unplayed: "#8a8a8a" });
  const sizeRef = useRef({ width: 0, height: 0, dpr: 1 });
  const mutedRef = useRef(false);

  // lazy one-time seed so the canvas has a waveform on the first paint.
  if (peaksRef.current === null) peaksRef.current = fallbackPeaks(src);

  const reducedMotion = useReducedMotion();
  const [playing, setPlaying] = useState(false);
  const [muted, toggleMuted] = useToggle([false, true]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackError, setPlaybackError] = useState("");

  // paint one frame from refs only, so the rAF loop never re-renders react.
  // `pulse` lifts the bar under the playhead while audio is actually playing.
  const draw = useCallback((pulse = false) => {
    const canvas = canvasRef.current;
    const peaks = peaksRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height, dpr } = sizeRef.current;
    if (width === 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const gap = 2;
    const barWidth = 3;
    const step = barWidth + gap;
    const bars = Math.max(16, Math.floor((width + gap) / step));
    const values = sampleBars(peaks, bars);

    const audio = audioRef.current;
    const total = audio?.duration || 0;
    const progress = total ? Math.min(1, (audio?.currentTime || 0) / total) : 0;
    const activeBar = Math.floor(progress * bars);
    const mid = height / 2;
    const rounded = typeof ctx.roundRect === "function";
    const { played, unplayed } = colorsRef.current;

    for (let b = 0; b < bars; b++) {
      const x = b * step;
      let amp = values[b];
      if (pulse && b === activeBar) amp = Math.min(1, amp * 1.35);
      const barHeight = Math.max(2, amp * height);
      const y = mid - barHeight / 2;
      ctx.fillStyle = b <= activeBar ? played : unplayed;
      ctx.beginPath();
      if (rounded) ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
      else ctx.rect(x, y, barWidth, barHeight);
      ctx.fill();
    }

    if (total > 0) {
      const px = Math.min(width - 1, progress * width);
      ctx.fillStyle = played;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(px - 0.5, 0, 1, height);
      ctx.globalAlpha = 1;
    }
  }, []);

  // external system: canvas backing store + theme colors. keep both matched to
  // css and repaint whenever the size or the color tokens change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const readColors = () => {
      const cs = getComputedStyle(canvas);
      colorsRef.current = {
        played: cs.getPropertyValue("--accent").trim() || "#c8f135",
        unplayed: cs.getPropertyValue("--muted2").trim() || "#8a8a8a",
      };
      draw();
    };

    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      draw();
    });
    observer.observe(canvas);

    readColors();
    const contrast = window.matchMedia("(prefers-contrast: more)");
    contrast.addEventListener("change", readColors);

    return () => {
      observer.disconnect();
      contrast.removeEventListener("change", readColors);
    };
  }, [draw]);

  // external system: decode the real clip into peaks, then repaint with the
  // true waveform. the fallback stays if the fetch or decode fails.
  useEffect(() => {
    peaksRef.current = fallbackPeaks(src);
    draw();
    let cancelled = false;
    const controller = new AbortController();
    decodePeaks(src, controller.signal)
      .then((peaks) => {
        // ignore a decode that finished after this clip was replaced.
        if (cancelled) return;
        peaksRef.current = peaks;
        draw();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [src, draw]);

  // external system: the html audio element. rebuilt per clip.
  useEffect(() => {
    const audio = new Audio(src);
    audio.muted = mutedRef.current;
    audioRef.current = audio;

    const onLoadedMetadata = () => setDuration(audio.duration);
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onEnded = () => {
      audio.currentTime = 0;
      setCurrentTime(0);
      setPlaying(false);
      draw();
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

    audio.play().catch(() => {
      // browser blocked autoplay; the user starts it with the play button.
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
  }, [src, draw]);

  // external system: the animation loop. run only while playing with motion on;
  // otherwise a single static frame is enough.
  useEffect(() => {
    if (!playing || reducedMotion) {
      draw();
      return;
    }
    let frame = 0;
    const loop = () => {
      draw(true);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing, reducedMotion, draw]);

  const toggle = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
      setPlaybackError("");
    } catch {
      setPlaybackError("audio could not play. try again.");
    }
  }, []);

  const handleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    if (audioRef.current) audioRef.current.muted = next;
    toggleMuted();
  };

  const seekToPointer = (clientX: number, element: HTMLElement) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = element.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = ratio * duration;
    setCurrentTime(audio.currentTime);
    draw(playing);
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
    setCurrentTime(audio.currentTime);
    draw(playing);
  };

  const progressPercent = duration ? Math.round((currentTime / duration) * 100) : 0;

  return (
    <div className={styles.player}>
      <button
        className={styles.playBtn}
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
          aria-valuenow={progressPercent}
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
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          <canvas ref={canvasRef} className={styles.canvas} />
        </div>

        <div className={styles.timeRow}>
          <span className={styles.time}>{formatTime(currentTime)}</span>
          <span className={styles.time}>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        className={styles.muteBtn}
        onClick={handleMute}
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
