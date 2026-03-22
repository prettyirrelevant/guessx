"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
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

  useEffect(() => {
    if (!roomId || !userId) return;

    const interval = setInterval(() => {
      heartbeat({ roomId, userId });
    }, 10_000);

    // send initial heartbeat immediately
    heartbeat({ roomId, userId });

    return () => clearInterval(interval);
  }, [roomId, userId, heartbeat]);
}
