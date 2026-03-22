"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import Image from "next/image";
import { getAvatarUrl } from "@/lib/session";
import styles from "./results-screen.module.css";

export function ResultsScreen({
  room,
  sessionId,
}: {
  room: Doc<"rooms">;
  sessionId: string;
}) {
  const leaderboard = useQuery(api.players.leaderboard, { roomId: room._id });

  if (!leaderboard) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>loading results...</div>
      </div>
    );
  }

  const topScore = leaderboard[0]?.totalScore ?? 0;
  const winners = leaderboard.filter((p) => p.totalScore === topScore);
  const isWinner = winners.some((w) => w.userId === sessionId);

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <div className={styles.gameOverLabel}>game over</div>
          <h1 className={styles.title}>
            {winners.length > 1
              ? "it's a tie!"
              : isWinner
                ? "you won!"
                : `${winners[0]?.displayName} wins!`}
          </h1>
        </div>

        <div className={styles.podium}>
          {leaderboard.slice(0, 3).map((player, i) => (
            <div
              key={player._id}
              className={`${styles.podiumSlot} ${
                i === 0
                  ? styles.first
                  : i === 1
                    ? styles.second
                    : styles.third
              }`}
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className={styles.podiumRank}>
                {i === 0 ? "👑" : `#${i + 1}`}
              </div>
              <Image
                unoptimized
                src={getAvatarUrl(player.avatar)}
                alt={player.displayName}
                className={styles.podiumAvatar}
                width={i === 0 ? 64 : 48}
                height={i === 0 ? 64 : 48}
              />
              <div className={styles.podiumName}>{player.displayName}</div>
              <div className={styles.podiumScore}>{player.totalScore}</div>
            </div>
          ))}
        </div>

        <div className={styles.fullList}>
          {leaderboard.map((player, i) => (
            <div
              key={player._id}
              className={`${styles.listRow} ${
                player.userId === sessionId ? styles.listYou : ""
              }`}
            >
              <span className={styles.listRank}>#{i + 1}</span>
              <Image
                unoptimized
                src={getAvatarUrl(player.avatar)}
                alt={player.displayName}
                className={styles.listAvatar}
                width={28}
                height={28}
              />
              <span className={styles.listName}>{player.displayName}</span>
              <span className={styles.listScore}>{player.totalScore}</span>
            </div>
          ))}
        </div>

        <div className={styles.actions}>
          <Link href="/" className={styles.homeBtn}>
            play again
          </Link>
        </div>
      </div>
    </div>
  );
}
