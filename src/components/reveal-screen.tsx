"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Check, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { getAvatarUrl } from "@/lib/session";
import styles from "./reveal-screen.module.css";

export function RevealScreen({
  room,
  round,
  players,
  currentPlayer,
}: {
  room: Doc<"rooms">;
  round: Doc<"rounds">;
  players: Doc<"players">[];
  currentPlayer: Doc<"players">;
}) {
  const answers = useQuery(api.rounds.answers, { roundId: round._id });

  if (!answers || !("selectedOption" in (answers[0] ?? {}))) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>revealing answers...</div>
      </div>
    );
  }

  const fullAnswers = answers as Doc<"answers">[];
  const correctAnswer = round.correctAnswer;

  // build player results sorted by position (correct first, then wrong, then no answer)
  const playerResults = players.map((player) => {
    const answer = fullAnswers.find((a) => a.playerId === player._id);
    return { player, answer };
  }).sort((a, b) => {
    if (a.answer?.correct && !b.answer?.correct) return -1;
    if (!a.answer?.correct && b.answer?.correct) return 1;
    if (a.answer && b.answer) return a.answer.submittedAt - b.answer.submittedAt;
    if (a.answer && !b.answer) return -1;
    if (!a.answer && b.answer) return 1;
    return 0;
  });

  const answerTitle =
    room.mode === "music" && round.mediaTitle
      ? `${round.mediaTitle}${round.mediaArtist ? ` — ${round.mediaArtist}` : ""}`
      : correctAnswer;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.roundLabel}>
          round {round.roundNumber}/{room.totalRounds}
        </span>
        <span className={styles.revealLabel}>
          {round.state === "revealing" ? "revealing..." : "results"}
        </span>
      </div>

      <div className={styles.answerReveal}>
        <span className={styles.answerLabel}>the answer</span>
        <span className={styles.answerTitle}>{answerTitle}</span>
      </div>

      <div className={styles.playerResults}>
        {playerResults.map(({ player, answer }, i) => {
          const isCorrect = answer?.correct;
          const noAnswer = !answer;

          return (
            <div
              key={player._id}
              className={`${styles.resultCard} ${
                isCorrect ? styles.resultCorrect : noAnswer ? styles.resultSkipped : styles.resultWrong
              }`}
              style={{ animationDelay: `${i * 0.08}s` }}
            >
              <div className={styles.resultLeft}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getAvatarUrl(player.avatar)}
                  alt={player.displayName}
                  className={styles.resultAvatar}
                  width={36}
                  height={36}
                />
                <div className={styles.resultInfo}>
                  <span className={styles.resultName}>
                    {player.displayName}
                    {player._id === currentPlayer._id && (
                      <span className={styles.youTag}>you</span>
                    )}
                  </span>
                  <span className={styles.resultPick}>
                    {noAnswer
                      ? "didn't answer"
                      : answer.selectedOption === correctAnswer
                        ? "correct"
                        : answer.selectedOption}
                  </span>
                </div>
              </div>

              <div className={styles.resultRight}>
                {answer?.position && (
                  <span className={styles.resultPosition}>
                    #{answer.position}
                  </span>
                )}
                <div className={`${styles.resultIcon} ${
                  isCorrect ? styles.iconCorrect : noAnswer ? styles.iconSkipped : styles.iconWrong
                }`}>
                  {isCorrect ? <Check size={14} /> : noAnswer ? <span>—</span> : <X size={14} />}
                </div>
                <span className={`${styles.resultPoints} ${
                  isCorrect ? styles.pointsPositive : noAnswer ? styles.pointsZero : styles.pointsNegative
                }`}>
                  {noAnswer
                    ? "0"
                    : `${answer.pointsAwarded > 0 ? "+" : ""}${answer.pointsAwarded}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.standings}>
        <div className={styles.standingsLabel}>standings</div>
        {[...players]
          .sort((a, b) => b.totalScore - a.totalScore)
          .map((player, i) => (
            <div
              key={player._id}
              className={`${styles.standingRow} ${
                player._id === currentPlayer._id ? styles.standingYou : ""
              }`}
            >
              <span className={styles.standingRank}>#{i + 1}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getAvatarUrl(player.avatar)}
                alt={player.displayName}
                className={styles.standingAvatar}
                width={24}
                height={24}
              />
              <span className={styles.standingName}>{player.displayName}</span>
              {player.streak >= 3 && (
                <span className={styles.streakIndicator}>
                  🔥{player.streak}
                </span>
              )}
              <span className={styles.standingScore}>
                {player.totalScore}
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}
