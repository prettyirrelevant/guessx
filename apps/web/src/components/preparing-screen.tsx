"use client";

import { useEffect, useState, useCallback } from "react";
import { Copy, Check, Info } from "lucide-react";
import { useClipboard, useWindowEvent } from "@mantine/hooks";
import type { PublicRoom } from "@guessx/game";

import { useRoomConnection } from "@/lib/room-connection";
import { prepareGame } from "@/lib/actions";

import { PreparingMotif } from "./preparing-motif";

import styles from "./preparing-screen.module.css";
import motif from "./preparing-motif.module.css";

export function PreparingScreen({ room }: { room: PublicRoom }) {
  const [error, setError] = useState("");
  const clipboard = useClipboard({ timeout: 2000 });
  const { command } = useRoomConnection();

  const prepare = useCallback(async () => {
    try {
      setError("");
      await prepareGame(room._id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed to set up the room. try again.");
    }
  }, [room._id]);

  useEffect(() => {
    if (!room.isHost) return;
    prepare();
  }, [room.isHost, prepare]);

  useWindowEvent("beforeunload", (e) => {
    if (room.isHost) e.preventDefault();
  });

  const handleCopy = () => {
    clipboard.copy(`${window.location.origin}/room/${room.roomId}`);
  };

  const handleCancel = async () => {
    try {
      const result = await command("close");
      if (result.error) setError(result.error);
    } catch {
      setError("could not cancel the room. try again.");
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <button className={styles.roomCode} onClick={handleCopy} aria-label="copy room invite link">
          {room.roomId}
          {clipboard.copied ? <Check size={20} /> : <Copy size={20} />}
        </button>
        <span className={styles.srOnly} aria-live="polite">
          {clipboard.copied ? "invite link copied" : ""}
        </span>
        <p className={styles.hint}>share this code with your friends</p>

        <div className={motif.wrap}>
          {error ? (
            <div className={styles.stepError}>
              <p role="alert">{error}</p>
              {room.isHost && (
                <button className={styles.retryBtn} onClick={prepare}>
                  try again
                </button>
              )}
            </div>
          ) : (
            <>
              <PreparingMotif mode={room.mode} />
              <span className={motif.label}>
                {room.isHost ? "building your game" : "waiting for the host"}
              </span>
            </>
          )}
        </div>

        {!error && (
          <div className={styles.notice}>
            <Info size={16} className={styles.noticeIcon} />
            <span>
              {room.isHost
                ? "keep this tab open until setup is complete"
                : "the host is setting up the game"}
            </span>
          </div>
        )}

        {room.isHost && (
          <button className={styles.cancelBtn} onClick={handleCancel}>
            cancel
          </button>
        )}
      </div>
    </div>
  );
}
