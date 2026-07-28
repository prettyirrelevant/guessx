import { Redirect, useLocalSearchParams } from "expo-router";
import * as Crypto from "expo-crypto";
import { RoomConnectionProvider } from "@guessx/server/react";
import { isRoomCode } from "@guessx/game";

import { useSession } from "@/lib/session";
import { getSocketOptions } from "@/lib/config";
import { getRoomSocketTicket } from "@/lib/api";
import { RoomScreen } from "@/components/room-screen";

export default function RoomRoute() {
  const params = useLocalSearchParams<{ code: string }>();
  const roomCode = params.code?.toUpperCase() ?? "";
  const session = useSession();

  if (!session.ready) return null;
  if (!session.hasProfile || !isRoomCode(roomCode)) return <Redirect href="/" />;

  return (
    <RoomConnectionProvider
      avatar={session.avatar}
      displayName={session.displayName.trim()}
      getTicket={getRoomSocketTicket}
      randomUUID={Crypto.randomUUID}
      roomCode={roomCode}
      socketOptions={getSocketOptions}
    >
      <RoomScreen />
    </RoomConnectionProvider>
  );
}
