"use client";

import { useEffect, useState, useCallback } from "react";
import { Copy, Check, Info, X } from "lucide-react";
import { useMutation } from "convex/react";
import { useClipboard, useWindowEvent } from "@mantine/hooks";

import { api } from "@convex/_generated/api";

import type { PublicRoom } from "@/lib/game-types";
import { prepareGame } from "@/lib/actions";

import styles from "./preparing-screen.module.css";

const STEPS: Record<string, string[]> = {
  music: ["setting up your room", "choosing your tracks", "preparing the choices"],
  place: ["setting up your room", "choosing your logos", "preparing the choices"],
  actor: ["setting up your room", "finding your actors", "preparing the choices"],
  flag: ["setting up your room", "raising the flags", "preparing the choices"],
};

export function PreparingScreen({ room, sessionId }: { room: PublicRoom; sessionId: string }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState("");
  const clipboard = useClipboard({ timeout: 2000 });
  const closeRoom = useMutation(api.rooms.close);

  const steps = STEPS[room.mode];

  const prepare = useCallback(async () => {
    try {
      setError("");
      setCurrentStep(0);
      await new Promise((r) => setTimeout(r, 800));

      setCurrentStep(1);

      const result = await prepareGame({ roomId: room._id, userId: sessionId });
      if ("error" in result) throw new Error(result.error);

      setCurrentStep(2);
      await new Promise((r) => setTimeout(r, 500));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed to set up the room. try again.");
    }
  }, [room._id, sessionId]);

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
      const result = await closeRoom({ roomId: room._id, userId: sessionId });
      if (result.error) setError(result.error);
    } catch {
      setError("could not cancel the room. try again.");
    }
  };

  const failedStep = error ? currentStep : -1;

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

        <div className={styles.steps}>
          {steps.map((step, i) => (
            <div key={step}>
              <div
                className={`${styles.step} ${
                  i === failedStep
                    ? styles.failed
                    : i < currentStep
                      ? styles.done
                      : i === currentStep && !error
                        ? styles.active
                        : ""
                }`}
              >
                <div className={styles.stepDot}>
                  {i === failedStep ? (
                    <X size={12} />
                  ) : i < currentStep ? (
                    <Check size={12} />
                  ) : (
                    i + 1
                  )}
                </div>
                <span>{step}</span>
              </div>

              {i === failedStep && (
                <div className={styles.stepError}>
                  <p role="alert">{error}</p>
                  {room.isHost && (
                    <button className={styles.retryBtn} onClick={prepare}>
                      try again
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {!error && room.isHost && (
          <div className={styles.notice}>
            <Info size={16} className={styles.noticeIcon} />
            <span>keep this tab open until setup is complete</span>
          </div>
        )}

        {!error && !room.isHost && (
          <div className={styles.notice}>
            <Info size={16} className={styles.noticeIcon} />
            <span>waiting for the host to finish setting up...</span>
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
