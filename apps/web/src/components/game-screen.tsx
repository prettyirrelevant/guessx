"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import type { ActiveRound, PublicAnswer, PublicPlayer, PublicRoom } from "@guessx/game";

import { getAvatarUrl } from "@/lib/session";
import { useRoomConnection } from "@/lib/room-connection";
import { mediaLoader, useRoundMedia } from "@/lib/media";

import { TimerBar } from "./timer-bar";
import { RevealScreen } from "./reveal-screen";
import { LoadingDots } from "./loading-dots";
import { AudioPlayer } from "./audio-player";

import styles from "./game-screen.module.css";

export function GameScreen({ room }: { room: PublicRoom }) {
  const { snapshot } = useRoomConnection();
  const round = snapshot?.round;
  const players = snapshot?.players;
  const currentPlayer = players?.find((player) => player.isCurrent);

  if (!round || !players || !currentPlayer) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingState}>loading round...</div>
      </div>
    );
  }

  if (round.state === "revealing" || round.state === "complete") {
    return (
      <RevealScreen room={room} round={round} players={players} currentPlayer={currentPlayer} />
    );
  }
  if (round.state !== "active" && round.state !== "pending") return null;

  return (
    <ActiveRound
      room={room}
      round={round}
      players={players}
      currentPlayer={currentPlayer}
      answers={snapshot?.answers ?? []}
    />
  );
}

const PROMPTS: Record<PublicRoom["mode"], string> = {
  music: "name that track",
  actor: "who is this?",
  flag: "which country?",
  place: "which logo?",
};

function ActiveRound({
  room,
  round,
  players,
  currentPlayer,
  answers,
}: {
  room: PublicRoom;
  round: ActiveRound;
  players: PublicPlayer[];
  currentPlayer: PublicPlayer;
  answers: PublicAnswer[];
}) {
  const { command, serverNow } = useRoomConnection();
  const media = useRoundMedia(mediaLoader, round.media);
  const [started, setStarted] = useState(() => serverNow() >= (round.startedAt ?? 0));
  const [selected, setSelected] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const lockedRef = useRef(false);

  useEffect(() => {
    setSelected(null);
    setSubmitError("");
    lockedRef.current = false;
    const remaining = (round.startedAt ?? 0) - serverNow();
    setStarted(remaining <= 0);
    if (remaining <= 0) return;
    const timeout = window.setTimeout(() => setStarted(true), remaining);
    return () => window.clearTimeout(timeout);
  }, [round._id, round.startedAt, serverNow]);

  const answeredPlayerIds = useMemo(
    () => new Set(answers.map((answer) => answer.playerId)),
    [answers],
  );
  const locked = selected !== null || answeredPlayerIds.has(currentPlayer._id);

  const handleSelect = useCallback(
    async (option: string) => {
      if (lockedRef.current) return;
      lockedRef.current = true;
      setSelected(option);
      setSubmitError("");

      const result = await command("submitAnswer", { roundId: round._id, selectedOption: option });
      if (!result.error || result.error === "already answered") return;
      lockedRef.current = false;
      setSelected(null);
      setSubmitError(result.error);
    },
    [round._id, command],
  );

  useEffect(() => {
    if (!started) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || lockedRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, [contenteditable='true']")) return;
      const index = event.key.toLowerCase().charCodeAt(0) - 97;
      if (event.key.length !== 1 || index < 0 || index >= round.options.length) return;
      event.preventDefault();
      void handleSelect(round.options[index]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSelect, round.options, started]);

  if (!started) {
    return <LeadIn round={round} totalRounds={room.totalRounds} />;
  }

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
        <p className={styles.prompt}>{PROMPTS[room.mode]}</p>
        <Media mode={room.mode} {...media} />
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
              unoptimized
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

function LeadIn({ round, totalRounds }: { round: ActiveRound; totalRounds: number }) {
  return (
    <div className={styles.finalIntro}>
      <div className={styles.finalIntroContent} role="status">
        <div className={styles.finalLabel}>
          {round.isFinal ? "final round" : `round ${round.roundNumber} of ${totalRounds}`}
        </div>
        {round.isFinal ? (
          <>
            <div className={styles.finalMultiplier}>2×</div>
            <p className={styles.finalSubtext}>everything counts double. including mistakes.</p>
          </>
        ) : (
          <div className={styles.leadInTitle}>get ready</div>
        )}
      </div>
    </div>
  );
}

function Media({
  mode,
  source,
  failed,
  retry,
}: {
  mode: PublicRoom["mode"];
  source?: string;
  failed: boolean;
  retry: () => void;
}) {
  if (mode === "music" && source) return <AudioPlayer src={source} />;

  const cardClass =
    mode === "actor" ? styles.actorCard : mode === "flag" ? styles.flagCard : styles.logoCard;
  const imageClass =
    mode === "actor" ? styles.actorImg : mode === "flag" ? styles.flagImg : styles.logoImg;

  return (
    <div className={mode === "music" ? styles.mediaStatusCard : cardClass}>
      {source && mode !== "music" ? (
        <Image
          src={source}
          alt=""
          className={imageClass}
          width={mode === "actor" ? 421 : 480}
          height={mode === "actor" ? 632 : 320}
          draggable={false}
          unoptimized
        />
      ) : failed ? (
        <button type="button" className={styles.mediaRetry} onClick={retry}>
          media did not load. tap to retry
        </button>
      ) : (
        <LoadingDots label="loading" />
      )}
    </div>
  );
}
