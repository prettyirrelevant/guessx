"use client";

import { useState } from "react";
import Image from "next/image";
import { Copy, Check, Shield } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useClipboard } from "@mantine/hooks";

import { api } from "@convex/_generated/api";

import { getAvatarUrl } from "@/lib/session";
import type { PublicRoom } from "@/lib/game-types";

import styles from "./lobby.module.css";

export function Lobby({ room, sessionId }: { room: PublicRoom; sessionId: string }) {
  const players = useQuery(api.players.list, { roomId: room._id, userId: sessionId });
  const startGame = useMutation(api.rooms.start);
  const closeRoom = useMutation(api.rooms.close);
  const clipboard = useClipboard({ timeout: 2000 });
  const [actionError, setActionError] = useState("");

  const isHost = room.isHost;
  const playerCount = players?.length ?? 0;
  const canStart = isHost && playerCount >= 2;

  const handleCopy = () => {
    clipboard.copy(`${window.location.origin}/room/${room.roomId}`);
  };

  const handleStart = async () => {
    setActionError("");
    try {
      const result = await startGame({ roomId: room._id, userId: sessionId });
      if (result?.error) setActionError(result.error);
    } catch {
      setActionError("could not start the game. try again.");
    }
  };

  const handleClose = async () => {
    setActionError("");
    try {
      const result = await closeRoom({ roomId: room._id, userId: sessionId });
      if (result.error) setActionError(result.error);
    } catch {
      setActionError("could not close the room. try again.");
    }
  };

  const modeLabel =
    room.mode === "music"
      ? "guess the song"
      : room.mode === "actor"
        ? "guess the actor"
        : room.mode === "flag"
          ? "name the flag"
          : "spot the landmark";

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <div className={styles.header}>
          <button
            className={styles.roomCode}
            onClick={handleCopy}
            aria-label="copy room invite link"
          >
            {room.roomId}
            {clipboard.copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
          <span className={styles.srOnly} aria-live="polite">
            {clipboard.copied ? "invite link copied" : ""}
          </span>
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
                  src={getAvatarUrl(player.avatar)}
                  alt={player.displayName}
                  className={styles.playerAvatar}
                  width={28}
                  height={28}
                />
                <span className={styles.playerName}>{player.displayName}</span>
                {player.isHost && <Shield size={18} className={styles.hostIcon} />}
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
            <button className={styles.startBtn} onClick={handleStart} disabled={!canStart}>
              {canStart
                ? "start game"
                : `need ${2 - playerCount} more player${2 - playerCount > 1 ? "s" : ""}`}
            </button>
            <button className={styles.closeBtn} onClick={handleClose}>
              close room
            </button>
          </div>
        )}

        {!isHost && <div className={styles.waitingMsg}>waiting for the host to start...</div>}
        {actionError && (
          <p className={styles.actionError} role="alert">
            {actionError}
          </p>
        )}
      </div>
    </div>
  );
}
