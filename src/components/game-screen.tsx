"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import { useQuery, useMutation } from "convex/react";

import { Doc, Id } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";

import { getAvatarUrl } from "@/lib/session";
import type { PublicPlayer, PublicRoom } from "@/lib/game-types";

import { TimerBar } from "./timer-bar";
import { RevealScreen } from "./reveal-screen";
import { AudioPlayer } from "./audio-player";

import styles from "./game-screen.module.css";

export function GameScreen({ room, sessionId }: { room: PublicRoom; sessionId: string }) {
  const round = useQuery(api.rounds.get, {
    roomId: room._id,
    roundNumber: room.currentRound,
  });

  const players = useQuery(api.players.list, { roomId: room._id, userId: sessionId });
  const currentPlayer = players?.find((p) => p.isCurrent);

  if (!round || !players || !currentPlayer) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>loading round...</div>
      </div>
    );
  }

  if (round.state === "revealing" || round.state === "complete") {
    return (
      <RevealScreen
        room={room}
        round={round as Doc<"rounds">}
        players={players}
        currentPlayer={currentPlayer}
        sessionId={sessionId}
      />
    );
  }

  return (
    <ActiveRound
      room={room}
      round={round}
      players={players}
      currentPlayer={currentPlayer}
      sessionId={sessionId}
    />
  );
}

function ActiveRound({
  room,
  round,
  players,
  currentPlayer,
  sessionId,
}: {
  room: PublicRoom;
  round: {
    _id: Id<"rounds">;
    options: string[];
    mediaUrl: string;
    startedAt?: number;
    endsAt?: number;
    isFinal: boolean;
    roundNumber: number;
    state: string;
  };
  players: PublicPlayer[];
  currentPlayer: PublicPlayer;
  sessionId: string;
}) {
  const answers = useQuery(api.rounds.answers, { roundId: round._id });
  const submitAnswer = useMutation(api.rounds.submitAnswer);

  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const lockedRef = useRef(false);
  const [showFinalIntro, setShowFinalIntro] = useState(
    () => round.isFinal && Date.now() < (round.startedAt ?? 0),
  );

  // reset state on new round
  useEffect(() => {
    setSelected(null);
    setLocked(false);
    setSubmitError("");
    lockedRef.current = false;
    const remainingIntro = round.isFinal ? Math.max(0, (round.startedAt ?? 0) - Date.now()) : 0;
    setShowFinalIntro(remainingIntro > 0);
    if (remainingIntro === 0) return;
    const timeout = window.setTimeout(() => setShowFinalIntro(false), remainingIntro);
    return () => window.clearTimeout(timeout);
  }, [round._id, round.isFinal, round.startedAt]);

  const handleSelect = useCallback(
    async (option: string) => {
      if (lockedRef.current) return;
      lockedRef.current = true;

      setSelected(option);
      setLocked(true);
      setSubmitError("");

      try {
        const result = await submitAnswer({
          roundId: round._id,
          playerId: currentPlayer._id,
          userId: sessionId,
          selectedOption: option,
        });
        if (result?.error) throw new Error(result.error);
      } catch (cause) {
        lockedRef.current = false;
        setLocked(false);
        setSelected(null);
        setSubmitError(cause instanceof Error ? cause.message : "answer was not submitted");
      }
    },
    [round._id, currentPlayer._id, sessionId, submitAnswer],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || lockedRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, [contenteditable='true']")) return;
      const index = event.key.toLowerCase().charCodeAt(0) - 97;
      if (index < 0 || index >= round.options.length) return;
      event.preventDefault();
      void handleSelect(round.options[index]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSelect, round.options]);

  const answeredPlayerIds = useMemo(
    () => new Set(answers?.filter((a) => "playerId" in a).map((a) => a.playerId) ?? []),
    [answers],
  );

  if (showFinalIntro) {
    return (
      <div className={styles.finalIntro}>
        <div className={styles.finalIntroContent}>
          <div className={styles.finalLabel}>final round</div>
          <div className={styles.finalMultiplier}>2×</div>
          <p className={styles.finalSubtext}>everything counts double. including mistakes.</p>
        </div>
      </div>
    );
  }

  const prompt =
    room.mode === "music"
      ? "name that track"
      : room.mode === "actor"
        ? "who is this?"
        : room.mode === "flag"
          ? "which country?"
          : "which logo?";

  return (
    <div className={styles.container}>
      <header className={styles.status}>
        <div className={styles.statusItem}>
          <span className={styles.statusLabel}>round</span>
          <span className={styles.statusValue}>
            {round.roundNumber}/{room.totalRounds}
          </span>
        </div>
        {round.isFinal && (
          <span className={styles.finalChip}>
            2× <span className={styles.finalChipLabel}>final</span>
          </span>
        )}
        <div className={`${styles.statusItem} ${styles.statusScore}`}>
          <span className={styles.statusValue}>{currentPlayer.totalScore}</span>
          <span className={styles.statusLabel}>pts</span>
        </div>
      </header>

      <TimerBar startedAt={round.startedAt} endsAt={round.endsAt} />

      <main className={styles.stageMain}>
        <p className={styles.prompt}>{prompt}</p>
        {room.mode === "music" ? (
          <AudioPlayer src={round.mediaUrl} />
        ) : room.mode === "actor" ? (
          <div className={styles.actorCard}>
            <Image
              src={round.mediaUrl}
              alt="guess this actor"
              className={styles.actorImg}
              width={400}
              height={500}
            />
          </div>
        ) : room.mode === "flag" ? (
          <div className={styles.flagCard}>
            <Image
              src={round.mediaUrl}
              alt="guess this flag"
              className={styles.flagImg}
              width={480}
              height={320}
            />
          </div>
        ) : (
          <div className={styles.logoCard}>
            <Image
              src={round.mediaUrl}
              alt="guess this logo"
              className={styles.logoImg}
              width={240}
              height={240}
              unoptimized
            />
          </div>
        )}
      </main>

      <div className={styles.lockRow}>
        <div className={styles.lockAvatars}>
          {players.slice(0, 8).map((player) => (
            <Image
              key={player._id}
              src={getAvatarUrl(player.avatar)}
              alt={player.displayName}
              title={player.displayName}
              className={`${styles.lockAvatar} ${
                answeredPlayerIds.has(player._id) ? styles.avatarLocked : styles.avatarWaiting
              }`}
              width={26}
              height={26}
            />
          ))}
          {players.length > 8 && (
            <span className={styles.avatarOverflow}>+{players.length - 8}</span>
          )}
        </div>
        <span className={styles.lockText} aria-live="polite">
          {answeredPlayerIds.size}/{players.length} locked in
        </span>
        {currentPlayer.streak >= 3 && (
          <span className={styles.streakChip}>🔥 {currentPlayer.streak}</span>
        )}
      </div>

      <div className={styles.answers} aria-label="Answer choices">
        {round.options.map((option, i) => {
          const isSelected = selected === option;
          return (
            <button
              key={option}
              className={`${styles.optionBtn} ${isSelected ? styles.optionSelected : ""} ${
                locked && !isSelected ? styles.optionDisabled : ""
              }`}
              onClick={() => handleSelect(option)}
              disabled={locked}
              aria-pressed={isSelected}
              aria-keyshortcuts={String.fromCharCode(65 + i)}
            >
              <span className={styles.optionKey}>{String.fromCharCode(65 + i)}</span>
              <span className={styles.optionText}>{option}</span>
              {isSelected && <Check size={18} className={styles.optionCheck} aria-hidden />}
            </button>
          );
        })}
      </div>
      {submitError && (
        <p className={styles.submitError} role="alert">
          {submitError}. choose again.
        </p>
      )}
    </div>
  );
}
