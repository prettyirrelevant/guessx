"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { getAvatarUrl } from "@/lib/session";
import { TimerBar } from "./timer-bar";
import { AudioPlayer } from "./audio-player";
import { RevealScreen } from "./reveal-screen";
import styles from "./game-screen.module.css";

export function GameScreen({
  room,
  sessionId,
}: {
  room: Doc<"rooms">;
  sessionId: string;
}) {
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
  sessionId: string;
}) {
  const answers = useQuery(api.rounds.answers, { roundId: round._id });
  const submitAnswer = useMutation(api.rounds.submitAnswer);

  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [showFinalIntro, setShowFinalIntro] = useState(round.isFinal);

  // reset state on new round
  useEffect(() => {
    setSelected(null);
    setLocked(false);
    if (round.isFinal) {
      setShowFinalIntro(true);
      const t = setTimeout(() => setShowFinalIntro(false), 3000);
      return () => clearTimeout(t);
    }
  }, [round._id, round.isFinal]);

  const handleSelect = useCallback(
    async (option: string) => {
      if (locked) return;

      setSelected(option);
      setLocked(true);

      await submitAnswer({
        roundId: round._id,
        playerId: currentPlayer._id,
        selectedOption: option,
      });
    },
    [locked, round._id, currentPlayer._id, submitAnswer]
  );

  const connectedPlayers = players.filter((p) => p.status === "connected");
  const answeredPlayerIds = new Set(
    answers?.filter((a) => "playerId" in a).map((a) => a.playerId) ?? []
  );
  const hasAnswered = answeredPlayerIds.has(currentPlayer._id);

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
            <p className={styles.placeHint}>where is this?</p>
            <div className={styles.imageWrapper}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={round.mediaUrl}
                alt="guess this place"
                className={styles.placeImage}
              />
            </div>
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
            <span className={styles.optionKey}>
              {String.fromCharCode(65 + i)}
            </span>
            <span className={styles.optionText}>{option}</span>
          </button>
        ))}
      </div>

      <div className={styles.bottomBar}>
        <div className={styles.answeredInfo}>
          <div className={styles.answeredAvatars}>
            {connectedPlayers.map((player) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
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
          </div>
          <span className={styles.answeredText}>
            {answeredPlayerIds.size}/{connectedPlayers.length} locked in
          </span>
        </div>
        {hasAnswered && (
          <span className={styles.lockedBadge}>answer locked</span>
        )}
        {currentPlayer.streak >= 3 && (
          <span className={styles.streakBadge}>
            🔥 {currentPlayer.streak} streak
          </span>
        )}
      </div>
    </div>
  );
}
