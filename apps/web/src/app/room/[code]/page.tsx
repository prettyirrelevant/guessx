"use client";

import { use } from "react";
import Link from "next/link";

import { useSession } from "@/lib/session";
import { useRoomConnection, RoomConnectionProvider } from "@/lib/room-connection";
import { ResultsScreen } from "@/components/results-screen";
import { ProfileSetup } from "@/components/profile-setup";
import { PreparingScreen } from "@/components/preparing-screen";
import { Lobby } from "@/components/lobby";
import { GameScreen } from "@/components/game-screen";

import styles from "./page.module.css";

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const session = useSession();

  if (!session.ready) return null;
  if (!session.hasProfile) {
    return (
      <div className={styles.loading}>
        <h2 className={styles.joinTitle}>join {code}</h2>
        <ProfileSetup
          displayName={session.displayName}
          avatar={session.avatar}
          onSave={(name, avatar) => {
            session.setDisplayName(name);
            session.setAvatar(avatar);
          }}
          onAvatarChange={session.setAvatar}
          submitLabel="join game"
        />
      </div>
    );
  }

  return (
    <RoomConnectionProvider
      roomCode={code}
      displayName={session.displayName}
      avatar={session.avatar}
    >
      <RoomContent />
    </RoomConnectionProvider>
  );
}

function RoomContent() {
  const { snapshot, status, error } = useRoomConnection();

  if (status === "not_found") {
    return (
      <RoomError title="room not found" message="this room doesn't exist or has been closed." />
    );
  }
  if (status === "error") {
    return <RoomError title="can't join" message={error || "could not connect to this room."} />;
  }
  if (!snapshot) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>connecting...</p>
      </div>
    );
  }

  const { room } = snapshot;
  if (room.state === "abandoned") {
    return <RoomError title="room closed" message="this room has been closed by the host." />;
  }
  if (room.state === "preparing") return <PreparingScreen room={room} />;
  if (room.state === "waiting") return <Lobby room={room} />;
  if (room.state === "in_progress") return <GameScreen room={room} />;
  if (room.state === "finished") return <ResultsScreen room={room} />;
  return null;
}

function RoomError({ title, message }: { title: string; message: string }) {
  return (
    <div className={styles.loading}>
      <h2 className={styles.errorTitle}>{title}</h2>
      <p className={styles.errorText}>{message}</p>
      <Link href="/" className={styles.homeLink}>
        back to home
      </Link>
    </div>
  );
}
