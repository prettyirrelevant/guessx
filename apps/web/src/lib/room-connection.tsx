"use client";

import type { ReactNode } from "react";
import {
  RoomConnectionProvider as SharedRoomConnectionProvider,
  useRoomConnection,
  useSecondsLeft,
} from "@guessx/server/react";

import { getRoomSocketTicket } from "@/lib/api";

const randomUUID = () => crypto.randomUUID();
const socketOptions = () => ({
  host: window.location.host,
  protocol: window.location.protocol === "https:" ? ("wss" as const) : ("ws" as const),
});

export function RoomConnectionProvider({
  roomCode,
  displayName,
  avatar,
  children,
}: {
  roomCode: string;
  displayName: string;
  avatar: string;
  children: ReactNode;
}) {
  return (
    <SharedRoomConnectionProvider
      avatar={avatar}
      displayName={displayName}
      getTicket={getRoomSocketTicket}
      randomUUID={randomUUID}
      roomCode={roomCode}
      socketOptions={socketOptions}
    >
      {children}
    </SharedRoomConnectionProvider>
  );
}

export { useRoomConnection, useSecondsLeft };
