import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { ActivityIndicator, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Image } from "expo-image";
import { useRoomConnection } from "@guessx/server/react";
import type { ActiveRound, PublicPlayer, PublicRoom } from "@guessx/game";

import { toast } from "@/lib/toast";
import { haptics } from "@/lib/haptics";
import { isAnswerLocked } from "@/lib/game-state";
import { Avatar } from "@/components/ui";
import { TimerBar } from "@/components/timer-bar";
import { ExitButton, GameScroll, SCREEN_ENTER } from "@/components/game/shared";
import { RevealScreen } from "@/components/game/reveal";
import { BrandLoader } from "@/components/fx/brand-loader";
import { AnswerOption } from "@/components/fx/answer-option";
import { AudioPlayer } from "@/components/audio-player";

const PROMPTS: Record<PublicRoom["mode"], string> = {
  music: "name that track",
  actor: "who is this?",
  flag: "which country?",
  place: "which logo?",
};

export function GameScreen({ room }: { room: PublicRoom }) {
  const { snapshot } = useRoomConnection();
  const round = snapshot?.round;
  const players = snapshot?.players;
  const currentPlayer = players?.find((p) => p.isCurrent);

  if (!round || !players || !currentPlayer) return <BrandLoader label="Loading game" />;

  if (round.state === "revealing" || round.state === "complete") {
    return (
      <RevealScreen currentPlayer={currentPlayer} players={players} room={room} round={round} />
    );
  }
  if (round.state !== "active" && round.state !== "pending") return null;

  return <Active currentPlayer={currentPlayer} players={players} room={room} round={round} />;
}

function Active({
  room,
  round,
  players,
  currentPlayer,
}: {
  room: PublicRoom;
  round: ActiveRound;
  players: PublicPlayer[];
  currentPlayer: PublicPlayer;
}) {
  const { snapshot, command } = useRoomConnection();
  const [selected, setSelected] = useState<string | null>(null);
  const locked = useRef(false);
  const [showIntro, setShowIntro] = useState(
    () => round.isFinal && Date.now() < (round.startedAt ?? 0),
  );

  useEffect(() => {
    locked.current = false;
    setSelected(null);
    const remaining = round.isFinal ? Math.max(0, (round.startedAt ?? 0) - Date.now()) : 0;
    setShowIntro(remaining > 0);
    if (remaining === 0) return;
    haptics.impact();
    const timeout = setTimeout(() => setShowIntro(false), remaining);
    return () => clearTimeout(timeout);
  }, [round._id, round.isFinal, round.startedAt]);

  const answeredIds = useMemo(
    () => new Set((snapshot?.answers ?? []).filter((a) => "playerId" in a).map((a) => a.playerId)),
    [snapshot?.answers],
  );

  const answer = async (option: string) => {
    if (locked.current || round.state !== "active") return;
    locked.current = true;
    setSelected(option);
    haptics.selection();
    try {
      const result = await command("submitAnswer", { roundId: round._id, selectedOption: option });
      if (!result.error) return;
      locked.current = false;
      setSelected(null);
      toast.error(`${result.error}. Choose again.`);
      haptics.error();
    } catch (cause) {
      locked.current = false;
      setSelected(null);
      toast.error(
        cause instanceof Error
          ? `${cause.message}. Choose again.`
          : "Answer was not submitted. Choose again.",
      );
      haptics.error();
    }
  };

  if (showIntro) return <FinalIntro />;

  const isLocked = isAnswerLocked(selected, answeredIds, currentPlayer._id);

  return (
    <GameScroll gap={16}>
      <View style={styles.status}>
        <View style={styles.statusItem}>
          <Text style={styles.statusValue}>{round.roundNumber}</Text>
          <Text style={styles.statusLabel}>/{room.totalRounds}</Text>
        </View>
        {round.isFinal ? (
          <View style={styles.finalChip}>
            <Text style={styles.finalChipMult}>2×</Text>
            <Text style={styles.finalChipLabel}>final</Text>
          </View>
        ) : null}
        <View style={styles.statusEnd}>
          <Text style={styles.statusValue}>{currentPlayer.totalScore}</Text>
          <Text style={styles.statusLabel}>pts</Text>
          <ExitButton />
        </View>
      </View>

      <TimerBar endsAt={round.endsAt} startedAt={round.startedAt} />

      <View style={styles.stage}>
        <Text style={styles.prompt}>{PROMPTS[room.mode]}</Text>
        <Media mode={room.mode} url={round.mediaUrl} />
      </View>

      <View style={styles.lockRow}>
        <View style={styles.lockAvatars}>
          {players.slice(0, 8).map((player, index) => (
            <Avatar
              key={player._id}
              seed={player.avatar}
              size={26}
              style={[
                styles.lockAvatar,
                index > 0 && styles.lockAvatarOverlap,
                answeredIds.has(player._id) ? styles.lockAvatarOn : styles.lockAvatarOff,
              ]}
            />
          ))}
          {players.length > 8 ? (
            <View style={[styles.lockAvatar, styles.lockAvatarOverlap, styles.lockOverflow]}>
              <Text style={styles.lockOverflowText}>+{players.length - 8}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.lockText}>
          {answeredIds.size}/{players.length} locked in
        </Text>
        {currentPlayer.streak >= 3 ? (
          <Text style={styles.streakChip}>🔥 {currentPlayer.streak}</Text>
        ) : null}
      </View>

      <View style={styles.options}>
        {round.options.map((option, index) => (
          <AnswerOption
            key={option}
            label={option}
            letter={String.fromCharCode(65 + index)}
            locked={isLocked}
            onPress={() => answer(option)}
            selected={selected === option}
          />
        ))}
      </View>
    </GameScroll>
  );
}

function Media({ mode, url }: { mode: PublicRoom["mode"]; url: string }) {
  if (mode === "music") return <AudioPlayer source={url} />;
  if (mode === "actor") {
    return <ImageMedia style={styles.actorCard} url={url} />;
  }
  if (mode === "flag") {
    return <ImageMedia style={styles.flagCard} url={url} />;
  }
  return <ImageMedia style={styles.logoCard} url={url} />;
}

function ImageMedia({ url, style }: { url: string; style: StyleProp<ViewStyle> }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => setStatus("loading"), [url]);

  return (
    <View style={style}>
      <Image
        cachePolicy="memory-disk"
        contentFit="contain"
        onError={() => setStatus("error")}
        onLoad={() => setStatus("ready")}
        source={url}
        style={styles.fill}
        transition={160}
      />
      {status === "ready" ? null : (
        <View accessibilityLiveRegion="polite" style={styles.mediaStatus}>
          {status === "loading" ? <ActivityIndicator color="#c8f135" /> : null}
          <Text
            accessibilityRole={status === "error" ? "alert" : undefined}
            style={styles.mediaText}
          >
            {status === "error" ? "Image could not be loaded" : "Loading image…"}
          </Text>
        </View>
      )}
    </View>
  );
}

function FinalIntro() {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(
      withSequence(withTiming(1.12, { duration: 700 }), withTiming(1, { duration: 700 })),
      -1,
    );
  }, [reduced, pulse]);

  const multStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={[styles.introRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <Animated.View entering={SCREEN_ENTER}>
        <View style={styles.introContent}>
          <Text style={styles.introLabel}>final round</Text>
          <Animated.View style={multStyle}>
            <Text style={styles.introMult}>2×</Text>
          </Animated.View>
          <Text style={styles.introSub}>Everything counts double. Including mistakes.</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.bg,
  },
  fill: {
    width: "100%",
    height: "100%",
  },
  mediaStatus: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space[2],
    backgroundColor: theme.colors.surface2,
  },
  mediaText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusItem: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.space[1],
  },
  statusEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
  },
  statusValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayMd,
    letterSpacing: theme.tracking.tight,
    fontVariant: ["tabular-nums"],
  },
  statusLabel: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  finalChip: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.space[1],
    paddingHorizontal: theme.space[2],
    paddingVertical: theme.space[1],
    borderWidth: 1,
    borderColor: theme.colors.warning,
    borderRadius: theme.radius.sm,
  },
  finalChipMult: {
    color: theme.colors.warning,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.body,
  },
  finalChipLabel: {
    color: theme.colors.warning,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  stage: {
    alignItems: "center",
    gap: theme.space[4],
    paddingVertical: theme.space[2],
  },
  prompt: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  actorCard: {
    width: 200,
    aspectRatio: 2 / 3,
    overflow: "hidden",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  flagCard: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 3 / 2,
    padding: theme.space[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  logoCard: {
    width: "100%",
    maxWidth: 380,
    aspectRatio: 3 / 2,
    padding: theme.space[8],
    borderWidth: 1,
    borderColor: theme.colors.lineStrong,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: "#ffffff",
  },
  lockRow: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
  },
  lockAvatars: {
    flexDirection: "row",
  },
  lockAvatar: {
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  lockAvatarOverlap: {
    marginLeft: -6,
  },
  lockAvatarOn: {
    borderColor: theme.colors.accent,
  },
  lockAvatarOff: {
    opacity: 0.4,
  },
  lockOverflow: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
  },
  lockOverflowText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
  },
  lockText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
  },
  streakChip: {
    marginLeft: "auto",
    color: theme.colors.brand,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    fontVariant: ["tabular-nums"],
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[1],
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.streakSoft,
    overflow: "hidden",
  },
  options: {
    gap: theme.space[2],
  },
  introRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.space[5],
    backgroundColor: theme.colors.bg,
  },
  introContent: {
    alignItems: "center",
    gap: theme.space[2],
  },
  introLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  introMult: {
    color: theme.colors.warning,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayXl,
    letterSpacing: theme.tracking.display,
    lineHeight: 60,
  },
  introSub: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
    textAlign: "center",
  },
}));
