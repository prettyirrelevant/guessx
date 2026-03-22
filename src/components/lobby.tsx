"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Check, Shield } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import Image from "next/image";
import { getAvatarUrl } from "@/lib/session";
import styles from "./lobby.module.css";

export function Lobby({
  room,
  sessionId,
}: {
  room: Doc<"rooms">;
  sessionId: string;
}) {
  const players = useQuery(api.players.list, { roomId: room._id });
  const startGame = useMutation(api.rooms.start);
  const closeRoom = useMutation(api.rooms.close);
  const [copied, setCopied] = useState(false);

  const isHost = room.hostId === sessionId;
  const playerCount = players?.length ?? 0;
  const canStart = isHost && playerCount >= 2;

  const handleCopy = () => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${room.roomId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStart = async () => {
    await startGame({ roomId: room._id, userId: sessionId });
  };

  const handleClose = async () => {
    await closeRoom({ roomId: room._id, userId: sessionId });
  };

  const modeLabel = room.mode === "music" ? "guess the song" : "spot the landmark";

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <button className={styles.roomCode} onClick={handleCopy} title="click to copy">
            {room.roomId}
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>

        <div className={styles.modeBadge}>{modeLabel}</div>

        <div className={styles.settings}>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>rounds</span>
            <span className={styles.settingValue}>{room.totalRounds}</span>
          </div>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>time</span>
            <span className={styles.settingValue}>{room.roundDuration / 1000}s</span>
          </div>
          <div className={styles.settingItem}>
            <span className={styles.settingLabel}>players</span>
            <span className={styles.settingValue}>{room.maxPlayers}</span>
          </div>
        </div>

        <div className={styles.playersSection}>
          <div className={styles.playersHeader}>
            <span>players</span>
            <span className={styles.playerCount}>
              {playerCount}/{room.maxPlayers}
            </span>
          </div>

          <div className={styles.playerList}>
            {players?.map((player) => (
              <div key={player._id} className={styles.playerRow}>
                <Image
                  unoptimized
                  src={getAvatarUrl(player.avatar)}
                  alt={player.displayName}
                  className={styles.playerAvatar}
                  width={28}
                  height={28}
                />
                <span className={styles.playerName}>{player.displayName}</span>
                {player.userId === room.hostId && (
                  <Shield size={18} className={styles.hostIcon} />
                )}
              </div>
            ))}

            {Array.from({ length: room.maxPlayers - playerCount }).map((_, i) => (
              <div key={`empty-${i}`} className={styles.emptySlot}>
                <span className={styles.emptyDot} />
                <span>waiting...</span>
              </div>
            ))}
          </div>
        </div>

        {isHost && (
          <div className={styles.hostActions}>
            <button
              className={styles.startBtn}
              onClick={handleStart}
              disabled={!canStart}
            >
              {canStart ? "start game" : `need ${2 - playerCount} more player${2 - playerCount > 1 ? "s" : ""}`}
            </button>
            <button className={styles.closeBtn} onClick={handleClose}>
              close room
            </button>
          </div>
        )}

        {!isHost && (
          <div className={styles.waitingMsg}>
            waiting for the host to start...
          </div>
        )}
      </div>
    </div>
  );
}
