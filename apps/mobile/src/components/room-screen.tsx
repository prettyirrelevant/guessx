import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, View } from "react-native";
import { useEffect, useRef } from "react";
import { router } from "expo-router";
import { useRoomConnection } from "@guessx/server/react";

import { toast } from "@/lib/toast";
import { Body, Button, Title } from "@/components/ui";
import { ResultsScreen } from "@/components/game/results";
import { PreparingScreen } from "@/components/game/preparing";
import { Lobby } from "@/components/game/lobby";
import { GameScreen } from "@/components/game/active-round";
import { LoadingDots } from "@/components/fx/loading-dots";
import { BrandLoader } from "@/components/fx/brand-loader";

export function RoomScreen() {
  const { snapshot, status, error } = useRoomConnection();
  const insets = useSafeAreaInsets();

  // Announce a recovered connection (only after we'd been connected once).
  const everConnected = useRef(false);
  const prevStatus = useRef(status);
  useEffect(() => {
    if (status === "connected") {
      if (prevStatus.current === "connecting" && everConnected.current) {
        toast.success("Reconnected");
      }
      everConnected.current = true;
    }
    prevStatus.current = status;
  }, [status]);

  if (status === "not_found") {
    return (
      <RoomMessage title="Room not found" message="This room doesn't exist or has been closed." />
    );
  }
  if (status === "error") {
    return <RoomMessage title="Can't connect" message={error || "Try again in a moment."} />;
  }
  if (!snapshot) return <BrandLoader label="Connecting to room" />;

  const { room } = snapshot;
  if (room.state === "abandoned") {
    return <RoomMessage title="Room closed" message="The host closed this room." />;
  }

  const content =
    room.state === "preparing" ? (
      <PreparingScreen room={room} />
    ) : room.state === "waiting" ? (
      <Lobby room={room} />
    ) : room.state === "in_progress" ? (
      <GameScreen room={room} />
    ) : (
      <ResultsScreen room={room} />
    );

  return (
    <View style={styles.root}>
      {status === "connecting" ? (
        <View accessibilityLiveRegion="polite" style={[styles.banner, { top: insets.top + 8 }]}>
          <LoadingDots />
          <Text style={styles.bannerText}>reconnecting</Text>
        </View>
      ) : null}
      {content}
    </View>
  );
}

function RoomMessage({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.center}>
      <Title>{title}</Title>
      <Body muted>{message}</Body>
      <View style={styles.messageAction}>
        <Button onPress={() => router.replace("/")} variant="secondary">
          Back to home
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space[4],
    padding: theme.space[5],
    backgroundColor: theme.colors.bg,
  },
  messageAction: {
    marginTop: theme.space[2],
  },
  banner: {
    position: "absolute",
    zIndex: 10,
    alignSelf: "center",
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
    paddingHorizontal: theme.space[4],
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
  },
  bannerText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
}));
