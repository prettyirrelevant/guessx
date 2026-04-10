"use client";

import { useEffect, useState, useCallback } from "react";
import { Copy, Check, Info, X } from "lucide-react";
import { useMutation } from "convex/react";
import { useClipboard, useWindowEvent } from "@mantine/hooks";

import { Doc } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";

import {
  prepareMusicContent,
  preparePlaceContent,
  prepareActorContent,
  prepareFlagContent,
} from "@/lib/actions";

import styles from "./preparing-screen.module.css";

const STEPS: Record<string, string[]> = {
  music: ["setting up your room", "choosing your tracks", "preparing the choices"],
  place: ["setting up your room", "picking your locations", "preparing the choices"],
  actor: ["setting up your room", "finding your actors", "preparing the choices"],
  flag: ["setting up your room", "raising the flags", "preparing the choices"],
};

export function PreparingScreen({
  room,
  isHost,
  sessionId,
}: {
  room: Doc<"rooms">;
  isHost: boolean;
  sessionId: string;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState("");
  const clipboard = useClipboard({ timeout: 2000 });
  const completePreparation = useMutation(api.rooms.completePreparation);
  const closeRoom = useMutation(api.rooms.close);

  const steps = STEPS[room.mode];

  const prepare = useCallback(async () => {
    try {
      setError("");
      setCurrentStep(0);
      await new Promise((r) => setTimeout(r, 800));

      setCurrentStep(1);

      let content;
      if (room.mode === "music") {
        content = await prepareMusicContent(room.artist ?? "3933641", room.totalRounds);
      } else if (room.mode === "actor") {
        content = await prepareActorContent(room.actorCategory ?? "hollywood", room.totalRounds);
      } else if (room.mode === "flag") {
        content = await prepareFlagContent(room.continent ?? "africa", room.totalRounds);
      } else {
        content = await preparePlaceContent(room.country ?? "US", room.totalRounds);
      }

      setCurrentStep(2);
      await new Promise((r) => setTimeout(r, 500));

      await completePreparation({
        roomId: room._id,
        rounds: content,
      });
    } catch {
      setError("failed to set up the room. try again.");
    }
  }, [
    room._id,
    room.mode,
    room.artist,
    room.country,
    room.actorCategory,
    room.continent,
    room.totalRounds,
    completePreparation,
  ]);

  useEffect(() => {
    if (!isHost) return;
    prepare();
  }, [isHost, prepare]);

  useWindowEvent("beforeunload", (e) => {
    if (isHost) e.preventDefault();
  });

  const handleCopy = () => {
    clipboard.copy(`${window.location.origin}/room/${room.roomId}`);
  };

  const handleCancel = async () => {
    await closeRoom({ roomId: room._id, userId: sessionId });
  };

  const failedStep = error ? currentStep : -1;

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <button className={styles.roomCode} onClick={handleCopy} title="click to copy">
          {room.roomId}
          {clipboard.copied ? <Check size={20} /> : <Copy size={20} />}
        </button>
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
                  <p>{error}</p>
                  {isHost && (
                    <button className={styles.retryBtn} onClick={prepare}>
                      try again
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {!error && isHost && (
          <div className={styles.notice}>
            <Info size={16} className={styles.noticeIcon} />
            <span>keep this tab open until setup is complete</span>
          </div>
        )}

        {!error && !isHost && (
          <div className={styles.notice}>
            <Info size={16} className={styles.noticeIcon} />
            <span>waiting for the host to finish setting up...</span>
          </div>
        )}

        {isHost && (
          <button className={styles.cancelBtn} onClick={handleCancel}>
            cancel
          </button>
        )}
      </div>
    </div>
  );
}
