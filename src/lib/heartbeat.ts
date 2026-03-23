"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useInterval } from "@mantine/hooks";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

export function useHeartbeat({
  roomId,
  userId,
}: {
  roomId: Id<"rooms"> | undefined;
  userId: string;
}) {
  const heartbeat = useMutation(api.players.heartbeat);

  const interval = useInterval(() => {
    if (roomId && userId) heartbeat({ roomId, userId });
  }, 10_000);

  useEffect(() => {
    if (!roomId || !userId) {
      interval.stop();
      return;
    }

    // send initial heartbeat immediately
    heartbeat({ roomId, userId });
    interval.start();

    return interval.stop;
  }, [roomId, userId, heartbeat]);
}
