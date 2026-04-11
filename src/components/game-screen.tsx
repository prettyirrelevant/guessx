"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";
import { useTimeout } from "@mantine/hooks";

import { Doc, Id } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";

import { getAvatarUrl } from "@/lib/session";

import { TimerBar } from "./timer-bar";
import { RevealScreen } from "./reveal-screen";
import { AudioPlayer } from "./audio-player";

import styles from "./game-screen.module.css";

export function GameScreen({ room, sessionId }: { room: Doc<"rooms">; sessionId: string }) {
  const round = useQuery(api.rounds.get, {
    roomId: room._id,
    roundNumber: room.currentRound,
  });

  const players = useQuery(api.players.list, { roomId: room._id });
  const currentPlayer = players?.find((p) => p.userId === sessionId);

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
      />
    );
  }

  return <ActiveRound room={room} round={round} players={players} currentPlayer={currentPlayer} />;
}

function ActiveRound({
  room,
  round,
  players,
  currentPlayer,
}: {
  room: Doc<"rooms">;
  round: {
    _id: Id<"rounds">;
    options: string[];
    mediaUrl: string;
    mediaTitle?: string;
    mediaArtist?: string;
    startedAt?: number;
    endsAt?: number;
    isFinal: boolean;
    roundNumber: number;
    state: string;
  };
  players: Doc<"players">[];
  currentPlayer: Doc<"players">;
}) {
  const answers = useQuery(api.rounds.answers, { roundId: round._id });
  const submitAnswer = useMutation(api.rounds.submitAnswer);

  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  const [showFinalIntro, setShowFinalIntro] = useState(round.isFinal);

  const { start: startFinalIntro, clear: clearFinalIntro } = useTimeout(
    () => setShowFinalIntro(false),
    3000,
  );

  // reset state on new round
  useEffect(() => {
    setSelected(null);
    setLocked(false);
    lockedRef.current = false;
    if (round.isFinal) {
      setShowFinalIntro(true);
      startFinalIntro();
    }
    return clearFinalIntro;
  }, [round._id, round.isFinal, startFinalIntro, clearFinalIntro]);

  const handleSelect = useCallback(
    async (option: string) => {
      if (lockedRef.current) return;
      lockedRef.current = true;

      setSelected(option);
      setLocked(true);

      await submitAnswer({
        roundId: round._id,
        playerId: currentPlayer._id,
        selectedOption: option,
      });
    },
    [round._id, currentPlayer._id, submitAnswer],
  );

  const connectedPlayers = useMemo(
    () => players.filter((p) => p.status === "connected"),
    [players],
  );
  const answeredPlayerIds = useMemo(
    () => new Set(answers?.filter((a) => "playerId" in a).map((a) => a.playerId) ?? []),
    [answers],
  );

  if (showFinalIntro) {
    return (
      <div className={styles.finalIntro}>
        <div className={styles.finalIntroContent}>
          <div className={styles.finalLabel}>final round</div>
          <div className={styles.finalMultiplier}>2x points</div>
          <p className={styles.finalSubtext}>everything counts double. including mistakes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.roundInfo}>
          <span className={styles.roundLabel}>round</span>
          <span className={styles.roundNumber}>
            {round.roundNumber}/{room.totalRounds}
          </span>
        </div>
        {round.isFinal && <span className={styles.finalBadge}>2x</span>}
        <div className={styles.scoreInfo}>
          <span className={styles.scoreValue}>{currentPlayer.totalScore}</span>
          <span className={styles.scoreLabel}>pts</span>
        </div>
      </div>

      <TimerBar startedAt={round.startedAt} endsAt={round.endsAt} />

      <div className={styles.mediaSection}>
        {room.mode === "music" ? (
          <div className={styles.audioWrapper}>
            <p className={styles.audioHint}>name that track</p>
            <AudioPlayer src={round.mediaUrl} />
          </div>
        ) : (
          <div className={styles.placeSection}>
            <p className={styles.placeHint}>
              {room.mode === "actor"
                ? "who is this?"
                : room.mode === "flag"
                  ? "which country?"
                  : "where is this?"}
            </p>
            {room.mode === "actor" ? (
              <div className={styles.actorImageWrapper}>
                <Image
                  src={round.mediaUrl}
                  alt="guess this actor"
                  className={styles.actorImage}
                  width={400}
                  height={500}
                />
              </div>
            ) : room.mode === "flag" ? (
              <div className={styles.flagImageWrapper}>
                <Image
                  src={round.mediaUrl}
                  alt="guess this flag"
                  className={styles.flagImage}
                  width={480}
                  height={320}
                />
              </div>
            ) : (
              <div className={styles.imageWrapper}>
                <Image
                  src={round.mediaUrl}
                  alt="guess this place"
                  className={styles.placeImage}
                  fill
                  unoptimized
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.options}>
        {round.options.map((option, i) => (
          <button
            key={option}
            className={`${styles.optionBtn} ${
              selected === option ? styles.optionSelected : ""
            } ${locked && selected !== option ? styles.optionDisabled : ""}`}
            onClick={() => handleSelect(option)}
            disabled={locked}
          >
            <span className={styles.optionKey}>{String.fromCharCode(65 + i)}</span>
            <span className={styles.optionText}>{option}</span>
          </button>
        ))}
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.answeredInfo}>
          <div className={styles.answeredAvatars}>
            {connectedPlayers.slice(0, 8).map((player) => (
              <Image
                key={player._id}
                src={getAvatarUrl(player.avatar)}
                alt={player.displayName}
                title={player.displayName}
                className={`${styles.answeredAvatar} ${
                  answeredPlayerIds.has(player._id) ? styles.avatarLocked : styles.avatarWaiting
                }`}
                width={28}
                height={28}
              />
            ))}
            {connectedPlayers.length > 8 && (
              <span className={styles.avatarOverflow}>+{connectedPlayers.length - 8}</span>
            )}
          </div>
          <span className={styles.answeredText}>
            {answeredPlayerIds.size}/{connectedPlayers.length} locked in
          </span>
        </div>
        {currentPlayer.streak >= 3 && (
          <span className={styles.streakBadge}>🔥 {currentPlayer.streak} streak</span>
        )}
      </div>
    </div>
  );
}
