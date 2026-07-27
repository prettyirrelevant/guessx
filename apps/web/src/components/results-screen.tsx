"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { PublicRoom } from "@guessx/game";

import { getAvatarUrl, useSession } from "@/lib/session";
import { useRoomConnection } from "@/lib/room-connection";

import styles from "./results-screen.module.css";

export function ResultsScreen({ room }: { room: PublicRoom }) {
  const { snapshot, command } = useRoomConnection();
  const leaderboard = snapshot?.leaderboard ?? [];
  const nextRoomCode = snapshot?.nextRoomCode;
  const router = useRouter();
  const { displayName, avatar } = useSession();
  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState("");
  const isHost = room.isHost;

  const topScore = leaderboard[0]?.totalScore ?? 0;
  const winners = leaderboard.filter((p) => p.totalScore === topScore);
  const isWinner = winners.some((w) => w.isCurrent);

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
              className={`${styles.podiumSlot} ${i === 0 ? styles.first : ""} ${
                player.isCurrent ? styles.podiumYou : ""
              }`}
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className={styles.podiumRank}>{i === 0 ? "👑" : `#${i + 1}`}</div>
              <Image
                src={getAvatarUrl(player.avatar)}
                alt={player.displayName}
                className={styles.podiumAvatar}
                width={i === 0 ? 64 : 48}
                height={i === 0 ? 64 : 48}
                unoptimized
              />
              <div className={styles.podiumName}>{player.displayName}</div>
              <div className={styles.podiumScore}>{player.totalScore}</div>
              {player.isCurrent && <span className={styles.podiumYouTag}>you</span>}
            </div>
          ))}
        </div>

        {leaderboard.length > 3 && (
          <div className={styles.fullList}>
            {leaderboard.slice(3).map((player, i) => (
              <div
                key={player._id}
                className={`${styles.listRow} ${player.isCurrent ? styles.listYou : ""}`}
              >
                <span className={styles.listRank}>#{i + 4}</span>
                <Image
                  src={getAvatarUrl(player.avatar)}
                  alt={player.displayName}
                  className={styles.listAvatar}
                  width={28}
                  height={28}
                  unoptimized
                />
                <span className={styles.listName}>{player.displayName}</span>
                <span className={styles.listScore}>{player.totalScore}</span>
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          {isHost ? (
            <button
              className={styles.playAgainBtn}
              disabled={starting}
              onClick={async () => {
                setStarting(true);
                setActionError("");
                try {
                  const result = await command("playAgain", {
                    hostName: displayName,
                    hostAvatar: avatar,
                  });
                  if (result && "roomCode" in result) {
                    router.push(`/room/${result.roomCode}`);
                    return;
                  }
                  setActionError(result?.error ?? "could not start another game");
                } catch {
                  setActionError("could not start another game. try again.");
                } finally {
                  setStarting(false);
                }
              }}
            >
              {starting ? "setting up..." : "play again"}
            </button>
          ) : nextRoomCode ? (
            <Link href={`/room/${nextRoomCode}`} className={styles.playAgainBtn}>
              play again
            </Link>
          ) : (
            <div className={styles.waitingGroup} role="status">
              <div className={styles.waitingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
              <span className={styles.waitingMessage}>waiting for host to start a new game</span>
            </div>
          )}
          {actionError && (
            <p className={styles.actionError} role="alert">
              {actionError}
            </p>
          )}
          <Link href="/" className={styles.homeLink}>
            back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
