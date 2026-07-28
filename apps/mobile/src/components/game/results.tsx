import { StyleSheet } from "react-native-unistyles";
import Animated, {
  BounceIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import { useRoomConnection } from "@guessx/server/react";
import type { PublicPlayer, PublicRoom } from "@guessx/game";

import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { haptics } from "@/lib/haptics";
import { Avatar, Button, TextButton } from "@/components/ui";
import { GameScroll } from "@/components/game/shared";
import { NumberTicker } from "@/components/fx/number-ticker";
import { Confetti } from "@/components/fx/confetti";

export function ResultsScreen({ room }: { room: PublicRoom }) {
  const { snapshot, command } = useRoomConnection();
  const { displayName, avatar } = useSession();
  const [busy, setBusy] = useState(false);

  const leaderboard = useMemo(
    // oxlint-disable-next-line unicorn/no-array-sort -- Hermes lacks the ES2023 immutable sort method.
    () => [...(snapshot?.leaderboard ?? [])].sort((a, b) => b.totalScore - a.totalScore),
    [snapshot?.leaderboard],
  );
  const nextRoomCode = snapshot?.nextRoomCode;
  const topScore = leaderboard[0]?.totalScore ?? 0;
  const winners = leaderboard.filter((p) => p.totalScore === topScore);
  const isWinner = winners.some((p) => p.isCurrent);

  useEffect(() => {
    if (!room.isHost && nextRoomCode) {
      haptics.success();
      router.replace(`/room/${nextRoomCode}`);
    }
  }, [room.isHost, nextRoomCode]);

  useEffect(() => {
    if (leaderboard.length === 0) return;
    if (isWinner) haptics.success();
    else haptics.impact();
  }, [room.roomId, isWinner, leaderboard.length]);

  const replay = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await command("playAgain", {
        hostName: displayName.trim(),
        hostAvatar: avatar,
      });
      if (result.roomCode) {
        haptics.success();
        router.replace(`/room/${result.roomCode}`);
        return;
      }
      toast.error(result.error ?? "Could not start another game");
      haptics.error();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Could not start another game. Try again",
      );
      haptics.error();
    } finally {
      setBusy(false);
    }
  };

  const title =
    winners.length > 1
      ? "It's a tie!"
      : isWinner
        ? "You won!"
        : `${winners[0]?.displayName ?? "Nobody"} wins!`;

  return (
    <View style={styles.root}>
      <GameScroll>
        <View style={styles.header}>
          <Text style={styles.gameOver}>game over</Text>
          <Text style={styles.title}>{title}</Text>
        </View>

        <View style={styles.podium}>
          {leaderboard.slice(0, 3).map((player, index) => (
            <PodiumSlot index={index} key={player._id} player={player} />
          ))}
        </View>

        {leaderboard.length > 3 ? (
          <View style={styles.fullList}>
            {leaderboard.slice(3).map((player, index) => (
              <View key={player._id} style={[styles.listRow, player.isCurrent && styles.listYou]}>
                <Text style={styles.listRank}>#{index + 4}</Text>
                <Avatar seed={player.avatar} size={28} />
                <Text numberOfLines={1} style={styles.listName}>
                  {player.displayName}
                </Text>
                <NumberTicker
                  delay={200 + index * 60}
                  style={styles.listScore}
                  value={player.totalScore}
                />
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          {room.isHost ? (
            <Button loading={busy} onPress={replay}>
              Play again
            </Button>
          ) : (
            <View style={styles.waiting}>
              <WaitingDots />
              <Text style={styles.waitingText}>Waiting for host to start a new game</Text>
            </View>
          )}
          <TextButton onPress={() => router.replace("/")}>back to home</TextButton>
        </View>
      </GameScroll>
      {isWinner ? <Confetti count={64} variant="rain" /> : null}
    </View>
  );
}

function PodiumSlot({ player, index }: { player: PublicPlayer; index: number }) {
  const first = index === 0;
  return (
    <Animated.View
      entering={FadeInDown.delay(200 + index * 130)
        .duration(420)
        .springify()
        .damping(14)}
      style={{ flex: 1, maxWidth: 130, minHeight: first ? 200 : index === 1 ? 176 : 152 }}
    >
      <View style={[styles.slot, first && styles.slotFirst, player.isCurrent && styles.slotYou]}>
        {first ? (
          <Animated.View entering={BounceIn.delay(560)}>
            <Text style={styles.crown}>👑</Text>
          </Animated.View>
        ) : (
          <Text style={styles.rank}>#{index + 1}</Text>
        )}
        <View style={first ? styles.winnerGlow : undefined}>
          <Avatar seed={player.avatar} size={first ? 60 : 46} />
        </View>
        <Text numberOfLines={1} style={styles.slotName}>
          {player.displayName}
        </Text>
        <NumberTicker
          delay={400 + index * 130}
          style={[styles.slotScore, first && styles.slotScoreFirst]}
          value={player.totalScore}
        />
        {player.isCurrent ? <Text style={styles.slotYouTag}>you</Text> : null}
      </View>
    </Animated.View>
  );
}

function WaitingDots() {
  return (
    <View style={styles.dots}>
      <Dot delay={0} />
      <Dot delay={200} />
      <Dot delay={400} />
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const value = useSharedValue(0.25);
  useEffect(() => {
    value.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 560 }), withTiming(0.25, { duration: 560 })),
        -1,
      ),
    );
  }, [delay, value]);
  const style = useAnimatedStyle(() => ({
    opacity: value.value,
    transform: [{ scale: value.value }],
  }));
  return (
    <Animated.View style={style}>
      <View style={styles.dot} />
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  header: {
    alignItems: "center",
    gap: theme.space[2],
  },
  gameOver: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayLg,
    letterSpacing: theme.tracking.display,
    lineHeight: 40,
    textAlign: "center",
  },
  podium: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: theme.space[2],
  },
  slot: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.space[2],
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  slotFirst: {
    borderColor: theme.colors.accent,
  },
  slotYou: {
    backgroundColor: theme.colors.youTint,
  },
  rank: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.body,
    fontVariant: ["tabular-nums"],
  },
  crown: {
    fontSize: 26,
  },
  winnerGlow: {
    borderRadius: theme.radius.full,
    boxShadow: "0px 0px 22px rgba(200, 241, 53, 0.55)",
  },
  slotName: {
    maxWidth: 90,
    color: theme.colors.text,
    fontSize: theme.fontSize.bodySm,
    fontWeight: "600",
    textAlign: "center",
  },
  slotScore: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    fontVariant: ["tabular-nums"],
  },
  slotScoreFirst: {
    color: theme.colors.accent,
  },
  slotYouTag: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  fullList: {
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[1],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  listYou: {
    borderBottomColor: "transparent",
    backgroundColor: theme.colors.youTint,
    borderRadius: theme.radius.sm,
  },
  listRank: {
    minWidth: 28,
    color: theme.colors.muted,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.bodySm,
    fontVariant: ["tabular-nums"],
  },
  listName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.bodySm,
    fontWeight: "600",
  },
  listScore: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    fontVariant: ["tabular-nums"],
  },
  actions: {
    alignItems: "center",
    gap: theme.space[3],
  },
  waiting: {
    alignItems: "center",
    gap: theme.space[3],
    paddingVertical: theme.space[4],
    paddingHorizontal: theme.space[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  dots: {
    flexDirection: "row",
    gap: theme.space[2],
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.muted,
  },
  waitingText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
    textAlign: "center",
  },
}));
