"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useInterval } from "@mantine/hooks";

import { Id } from "@convex/_generated/dataModel";
import { api } from "@convex/_generated/api";

export function useHeartbeat({
  roomId,
  userId,
}: {
  roomId: Id<"rooms"> | undefined;
  userId: string;
}) {
  const heartbeat = useMutation(api.players.heartbeat);

  const { start, stop } = useInterval(() => {
    if (roomId && userId) heartbeat({ roomId, userId });
  }, 10_000);

  useEffect(() => {
    if (!roomId || !userId) {
      stop();
      return;
    }

    // send initial heartbeat immediately
    heartbeat({ roomId, userId });
    start();

    return stop;
  }, [roomId, userId, heartbeat, start, stop]);
}
