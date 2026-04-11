"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useQuery, useMutation } from "convex/react";

import { Doc } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";

import { getAvatarUrl, useSession } from "@/lib/session";

import styles from "./results-screen.module.css";

export function ResultsScreen({ room, sessionId }: { room: Doc<"rooms">; sessionId: string }) {
  const leaderboard = useQuery(api.players.leaderboard, { roomId: room._id });
  const nextRoomCode = useQuery(api.rooms.nextRoom, { roomId: room._id });
  const playAgain = useMutation(api.rooms.playAgain);
  const router = useRouter();
  const { displayName, avatar } = useSession();
  const [starting, setStarting] = useState(false);
  const isHost = room.hostId === sessionId;

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
                i === 0 ? styles.first : i === 1 ? styles.second : styles.third
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
              className={`${styles.listRow} ${player.userId === sessionId ? styles.listYou : ""}`}
            >
              <span className={styles.listRank}>#{i + 1}</span>
              <Image
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
          {isHost ? (
            <button
              className={styles.playAgainBtn}
              disabled={starting}
              onClick={async () => {
                setStarting(true);
                const result = await playAgain({
                  roomId: room._id,
                  userId: sessionId,
                  hostName: displayName,
                  hostAvatar: avatar,
                });
                if (result && "roomCode" in result) {
                  router.push(`/room/${result.roomCode}`);
                } else {
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
            <div className={styles.waitingGroup}>
              <div className={styles.waitingDots}>
                <span className={styles.dot} />
                <span className={styles.dot} />
                <span className={styles.dot} />
              </div>
              <span className={styles.waitingMessage}>waiting for host to start a new game</span>
            </div>
          )}
          <Link href="/" className={styles.homeLink}>
            back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
