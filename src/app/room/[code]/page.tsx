"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import Link from "next/link";
import { api } from "../../../../convex/_generated/api";
import { useSession } from "@/lib/session";
import { useHeartbeat } from "@/lib/heartbeat";
import { ProfileSetup } from "@/components/profile-setup";
import { PreparingScreen } from "@/components/preparing-screen";
import { Lobby } from "@/components/lobby";
import { GameScreen } from "@/components/game-screen";
import { ResultsScreen } from "@/components/results-screen";
import styles from "./page.module.css";

export default function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = use(params);
  const { sessionId, displayName, avatar, setDisplayName, setAvatar, hasProfile, ready } =
    useSession();
  const room = useQuery(api.rooms.get, { roomCode: code });
  const players = useQuery(
    api.players.list,
    room?._id ? { roomId: room._id } : "skip"
  );
  const joinRoom = useMutation(api.rooms.join);

  const isPlayer = players?.some((p) => p.userId === sessionId) ?? false;
  const [joinError, setJoinError] = useState("");
  const [joining, setJoining] = useState(false);

  const doJoin = useCallback(async () => {
    setJoining(true);
    setJoinError("");
    try {
      const result = await joinRoom({
        roomCode: code,
        userId: sessionId,
        displayName,
        avatar,
      });
      if (result && "error" in result) {
        setJoinError(result.error as string);
        setJoining(false);
      }
    } catch {
      setJoinError("something went wrong. try again.");
      setJoining(false);
    }
  }, [code, sessionId, displayName, avatar, joinRoom]);

  useHeartbeat({ roomId: room?._id, userId: sessionId });

  // auto-join if the user has a profile but isn't a player yet
  const shouldAutoJoin = ready && hasProfile && !isPlayer && !joining && !joinError && room?.state === "waiting";
  useEffect(() => {
    if (shouldAutoJoin) {
      doJoin();
    }
  }, [shouldAutoJoin, doJoin]);

  if (!ready) return null;

  if (room === undefined || (room !== null && players === undefined)) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
        <p>connecting...</p>
      </div>
    );
  }

  if (room === null) {
    return (
      <div className={styles.loading}>
        <h2 className={styles.errorTitle}>room not found</h2>
        <p className={styles.errorText}>
          this room doesn&apos;t exist or has been closed.
        </p>
        <Link href="/" className={styles.homeLink}>
          back to home
        </Link>
      </div>
    );
  }

  if (room.state === "abandoned") {
    return (
      <div className={styles.loading}>
        <h2 className={styles.errorTitle}>room closed</h2>
        <p className={styles.errorText}>
          this room has been closed by the host.
        </p>
        <Link href="/" className={styles.homeLink}>
          back to home
        </Link>
      </div>
    );
  }

  // not a player yet
  if (!isPlayer) {
    if (room.state !== "waiting") {
      return (
        <div className={styles.loading}>
          <h2 className={styles.errorTitle}>can&apos;t join</h2>
          <p className={styles.errorText}>
            this game is already in progress.
          </p>
          <Link href="/" className={styles.homeLink}>
            back to home
          </Link>
        </div>
      );
    }

    if (joinError) {
      return (
        <div className={styles.loading}>
          <h2 className={styles.errorTitle}>can&apos;t join</h2>
          <p className={styles.errorText}>{joinError}</p>
          <Link href="/" className={styles.homeLink}>
            back to home
          </Link>
        </div>
      );
    }

    if (joining || hasProfile) {
      return (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <p>joining...</p>
        </div>
      );
    }

    // no profile yet, show setup
    return (
      <div className={styles.loading}>
        <h2 className={styles.joinTitle}>join {code}</h2>
        <ProfileSetup
          displayName={displayName}
          avatar={avatar}
          onSave={(name, av) => {
            setDisplayName(name);
            setAvatar(av);
            joinRoom({
              roomCode: code,
              userId: sessionId,
              displayName: name,
              avatar: av,
            }).then((result) => {
              if (result && "error" in result) {
                setJoinError(result.error as string);
              }
            }).catch(() => {
              setJoinError("something went wrong. try again.");
            });
            setJoining(true);
          }}
          onAvatarChange={setAvatar}
          submitLabel="join game"
        />
      </div>
    );
  }

  if (room.state === "preparing") {
    return (
      <PreparingScreen
        room={room}
        isHost={room.hostId === sessionId}
        sessionId={sessionId}
      />
    );
  }

  if (room.state === "waiting") {
    return <Lobby room={room} sessionId={sessionId} />;
  }

  if (room.state === "in_progress") {
    return <GameScreen room={room} sessionId={sessionId} />;
  }

  if (room.state === "finished") {
    return <ResultsScreen room={room} sessionId={sessionId} />;
  }

  return null;
}
