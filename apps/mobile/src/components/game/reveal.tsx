import { StyleSheet } from "react-native-unistyles";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { Text, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react-native";
import { useRoomConnection } from "@guessx/server/react";
import type { PublicAnswer, PublicPlayer, PublicRoom, RevealedRound } from "@guessx/game";

import { toast } from "@/lib/toast";
import { secondsUntil } from "@/lib/time";
import { haptics } from "@/lib/haptics";
import { Avatar, Button } from "@/components/ui";
import { ExitButton, GameScroll, TopBar } from "@/components/game/shared";
import { NumberTicker } from "@/components/fx/number-ticker";
import { Confetti } from "@/components/fx/confetti";

type FullAnswer = Extract<PublicAnswer, { selectedOption: string }>;

export function RevealScreen({
  room,
  round,
  players,
  currentPlayer,
}: {
  room: PublicRoom;
  round: RevealedRound;
  players: PublicPlayer[];
  currentPlayer: PublicPlayer;
}) {
  const { snapshot, command } = useRoomConnection();
  const [countdown, setCountdown] = useState(() => secondsUntil(round.revealEndsAt));
  const [showSkip, setShowSkip] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const revealing = round.state === "revealing";

  useEffect(() => {
    if (!revealing) {
      setShowSkip(false);
      setSkipping(false);
      return;
    }
    const updateCountdown = () => setCountdown(secondsUntil(round.revealEndsAt));
    updateCountdown();
    const tick = setInterval(updateCountdown, 250);
    const skipDelay = room.isHost ? setTimeout(() => setShowSkip(true), 3_000) : undefined;
    return () => {
      clearInterval(tick);
      if (skipDelay) clearTimeout(skipDelay);
    };
  }, [round._id, round.revealEndsAt, revealing, room.isHost]);

  const answers = useMemo(
    () => (snapshot?.answers ?? []).filter((a): a is FullAnswer => "selectedOption" in a),
    [snapshot?.answers],
  );

  const ownCorrect = answers.find((a) => a.playerId === currentPlayer._id)?.correct;
  const [celebrate, setCelebrate] = useState(false);
  const shake = useSharedValue(0);
  useEffect(() => {
    if (ownCorrect === undefined) return;
    if (ownCorrect) {
      haptics.success();
      setCelebrate(true);
    } else {
      haptics.error();
      shake.value = withSequence(
        withTiming(-8, { duration: 55 }),
        withTiming(8, { duration: 55 }),
        withTiming(-6, { duration: 55 }),
        withTiming(6, { duration: 55 }),
        withTiming(0, { duration: 55 }),
      );
    }
  }, [ownCorrect, round._id, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const results = useMemo(
    () =>
      players
        .map((player) => ({ player, answer: answers.find((a) => a.playerId === player._id) }))
        .sort((a, b) => {
          if (a.answer?.correct && !b.answer?.correct) return -1;
          if (!a.answer?.correct && b.answer?.correct) return 1;
          if (a.answer && b.answer) return a.answer.submittedAt - b.answer.submittedAt;
          if (a.answer && !b.answer) return -1;
          if (!a.answer && b.answer) return 1;
          return 0;
        }),
    [answers, players],
  );

  const standings = useMemo(
    // oxlint-disable-next-line unicorn/no-array-sort -- Hermes lacks the ES2023 immutable sort method.
    () => [...players].sort((a, b) => b.totalScore - a.totalScore),
    [players],
  );

  const answerTitle =
    room.mode === "music" && round.mediaTitle
      ? `${round.mediaTitle}${round.mediaArtist ? ` — ${round.mediaArtist}` : ""}`
      : round.correctAnswer;

  const skip = async () => {
    if (skipping) return;
    setSkipping(true);
    try {
      const result = await command("skipReveal", { roundId: round._id });
      if (result.error) {
        setSkipping(false);
        toast.error(result.error);
        haptics.error();
      } else {
        haptics.impact();
      }
    } catch {
      setSkipping(false);
      toast.error("Could not skip. Try again");
      haptics.error();
    }
  };

  return (
    <View style={styles.root}>
      <GameScroll gap={16}>
        <TopBar>
          <Text style={styles.roundLabel}>
            round {round.roundNumber}/{room.totalRounds}
          </Text>
          <View style={styles.headerEnd}>
            <Text style={styles.revealLabel}>
              {revealing
                ? round.isFinal
                  ? `final results in ${countdown}s`
                  : `next round in ${countdown}s`
                : "results"}
            </Text>
            <ExitButton />
          </View>
        </TopBar>

        <Animated.View entering={ZoomIn.duration(260)}>
          <Animated.View style={shakeStyle}>
            <View style={styles.answerCard}>
              <Text style={styles.answerLabel}>the answer</Text>
              <Text style={styles.answerTitle}>{answerTitle}</Text>
            </View>
          </Animated.View>
        </Animated.View>

        <View style={styles.resultList}>
          {results.map(({ player, answer }, index) => {
            const correct = answer?.correct;
            const noAnswer = !answer;
            return (
              <Animated.View entering={FadeInDown.delay(index * 60).duration(260)} key={player._id}>
                <View
                  style={[
                    styles.resultCard,
                    correct
                      ? styles.resultCorrect
                      : noAnswer
                        ? styles.resultSkipped
                        : styles.resultWrong,
                  ]}
                >
                  <Avatar seed={player.avatar} size={36} />
                  <View style={styles.resultInfo}>
                    <View style={styles.resultNameRow}>
                      <Text numberOfLines={1} style={styles.resultName}>
                        {player.displayName}
                      </Text>
                      {player._id === currentPlayer._id ? (
                        <Text style={styles.youTag}>you</Text>
                      ) : null}
                    </View>
                    {!noAnswer && answer.selectedOption !== round.correctAnswer ? (
                      <Text numberOfLines={1} style={styles.resultPick}>
                        {answer.selectedOption}
                      </Text>
                    ) : null}
                  </View>
                  {answer?.position != null ? (
                    <Text style={styles.resultPosition}>#{answer.position}</Text>
                  ) : null}
                  <View
                    style={[
                      styles.resultIcon,
                      correct
                        ? styles.iconCorrect
                        : noAnswer
                          ? styles.iconSkipped
                          : styles.iconWrong,
                    ]}
                  >
                    {correct ? (
                      <Check color="#43d675" size={14} />
                    ) : noAnswer ? (
                      <Text style={styles.iconDash}>—</Text>
                    ) : (
                      <X color="#ff5c5c" size={14} />
                    )}
                  </View>
                  {noAnswer ? (
                    <Text style={[styles.points, styles.pointsZero]}>0</Text>
                  ) : (
                    <NumberTicker
                      delay={index * 60}
                      signed
                      style={[styles.points, correct ? styles.pointsUp : styles.pointsDown]}
                      value={answer.pointsAwarded}
                    />
                  )}
                </View>
              </Animated.View>
            );
          })}
        </View>

        <View style={styles.standings}>
          <Text style={styles.standingsLabel}>standings</Text>
          {standings.map((player, index) => {
            const you = player._id === currentPlayer._id;
            return (
              <View key={player._id} style={[styles.standingRow, you && styles.standingYou]}>
                <Text style={styles.standingRank}>#{index + 1}</Text>
                <Avatar seed={player.avatar} size={24} />
                <Text numberOfLines={1} style={styles.standingName}>
                  {player.displayName}
                </Text>
                {player.streak >= 3 ? (
                  <Text style={styles.standingStreak}>🔥{player.streak}</Text>
                ) : null}
                <NumberTicker style={styles.standingScore} value={player.totalScore} />
              </View>
            );
          })}
        </View>

        {revealing && room.isHost && showSkip ? (
          <Button disabled={skipping} onPress={skip} variant="accentOutline">
            {round.isFinal ? "Skip to results" : "Skip to next round"}
          </Button>
        ) : null}
      </GameScroll>
      {celebrate ? <Confetti count={44} variant="burst" /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  roundLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  headerEnd: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
  },
  revealLabel: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
    fontVariant: ["tabular-nums"],
  },
  answerCard: {
    alignItems: "center",
    gap: theme.space[2],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[5],
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  answerLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  answerTitle: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayMd,
    letterSpacing: theme.tracking.tight,
    lineHeight: 30,
    textAlign: "center",
  },
  resultList: {
    gap: theme.space[2],
  },
  resultCard: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    padding: theme.space[3],
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  resultCorrect: {
    borderLeftColor: theme.colors.success,
  },
  resultWrong: {
    borderLeftColor: theme.colors.danger,
  },
  resultSkipped: {
    borderLeftColor: theme.colors.muted2,
    opacity: 0.75,
  },
  resultInfo: {
    flex: 1,
    gap: 2,
  },
  resultNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
  },
  resultName: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.bodySm,
    fontWeight: "600",
  },
  youTag: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 4,
  },
  resultPick: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
  },
  resultPosition: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    fontVariant: ["tabular-nums"],
  },
  resultIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  iconCorrect: {
    backgroundColor: theme.colors.successSoft,
  },
  iconWrong: {
    backgroundColor: theme.colors.dangerSoft,
  },
  iconSkipped: {
    backgroundColor: theme.colors.surface2,
  },
  iconDash: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
  },
  points: {
    minWidth: 40,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  pointsUp: {
    color: theme.colors.success,
  },
  pointsDown: {
    color: theme.colors.danger,
  },
  pointsZero: {
    color: theme.colors.muted2,
  },
  standings: {
    padding: theme.space[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  standingsLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
    marginBottom: theme.space[3],
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    paddingVertical: theme.space[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  standingYou: {
    borderBottomColor: "transparent",
    backgroundColor: theme.colors.youTint,
    marginHorizontal: -theme.space[2],
    paddingHorizontal: theme.space[2],
    borderRadius: theme.radius.sm,
  },
  standingRank: {
    minWidth: 28,
    color: theme.colors.muted,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.bodySm,
    fontVariant: ["tabular-nums"],
  },
  standingName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.bodySm,
    fontWeight: "600",
  },
  standingStreak: {
    fontSize: theme.fontSize.label,
    fontVariant: ["tabular-nums"],
  },
  standingScore: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    fontVariant: ["tabular-nums"],
  },
}));
