import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated from "react-native-reanimated";
import { Text, View } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRoomConnection } from "@guessx/server/react";
import type { PublicRoom } from "@guessx/game";

import { toast } from "@/lib/toast";
import { haptics } from "@/lib/haptics";
import { prepareGame } from "@/lib/api";
import { Button, TextButton } from "@/components/ui";
import { confirmClose, CopyableCode, SCREEN_ENTER } from "@/components/game/shared";
import { LoadingDots } from "@/components/fx/loading-dots";

export function PreparingScreen({ room }: { room: PublicRoom }) {
  const { command } = useRoomConnection();
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const running = useRef(false);

  const prepare = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      setFailed(false);
      await prepareGame(room.roomId);
    } catch (cause) {
      setFailed(true);
      toast.error(cause instanceof Error ? cause.message : "Failed to set up the room. Try again");
      haptics.error();
    } finally {
      running.current = false;
    }
  }, [room.roomId]);

  useEffect(() => {
    if (room.isHost) void prepare();
  }, [prepare, room.isHost]);

  const closeRoom = async () => {
    if (closing) return;
    setClosing(true);
    try {
      const result = await command("close");
      if (result.error) throw new Error(result.error);
      haptics.impact();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not cancel the room. Try again");
      haptics.error();
      setClosing(false);
    }
  };

  return (
    <View
      style={[styles.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 }]}
    >
      <Animated.View entering={SCREEN_ENTER} style={{ width: "100%", maxWidth: 420 }}>
        <View style={styles.card}>
          <CopyableCode roomId={room.roomId} />
          <Text style={styles.hint}>Share this code with your friends</Text>

          {failed ? null : (
            <View style={styles.status}>
              <LoadingDots />
              <Text style={styles.statusText}>
                {room.isHost ? "setting up your game" : "the host is setting up"}
              </Text>
            </View>
          )}

          {failed && room.isHost ? (
            <Button disabled={closing} onPress={prepare}>
              Try again
            </Button>
          ) : null}

          {room.isHost ? (
            <TextButton onPress={() => confirmClose(() => void closeRoom())} tone="danger">
              cancel
            </TextButton>
          ) : null}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.space[5],
    backgroundColor: theme.colors.bg,
  },
  card: {
    width: "100%",
    alignItems: "center",
    gap: theme.space[5],
    padding: theme.space[6],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  hint: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    textAlign: "center",
  },
  status: {
    alignItems: "center",
    gap: theme.space[3],
    paddingVertical: theme.space[2],
  },
  statusText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
}));
