import { StyleSheet } from "react-native-unistyles";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Text, View } from "react-native";
import { useEffect, useState } from "react";

export function TimerBar({ startedAt, endsAt }: { startedAt?: number; endsAt?: number }) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!startedAt || !endsAt || endsAt <= startedAt) {
      setSecondsLeft(0);
      setTotalSeconds(0);
      return;
    }
    setTotalSeconds(Math.ceil((endsAt - startedAt) / 1_000));
    setSecondsLeft(Math.ceil(Math.max(0, (endsAt - Date.now()) / 1_000)));
    const tick = setInterval(() => {
      setSecondsLeft(Math.ceil(Math.max(0, (endsAt - Date.now()) / 1_000)));
    }, 200);
    return () => clearInterval(tick);
  }, [startedAt, endsAt]);

  const urgent = secondsLeft <= 5 && secondsLeft > 0;
  const warning = secondsLeft <= 10 && !urgent;

  useEffect(() => {
    if (urgent) {
      pulse.value = withRepeat(withTiming(0.4, { duration: 300 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
    return () => cancelAnimation(pulse);
  }, [urgent, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <View style={styles.container}>
      <View style={styles.beads}>
        {Array.from({ length: totalSeconds }).map((_, index) => {
          const active = index < secondsLeft;
          const beadStyle = !active
            ? styles.beadOff
            : urgent
              ? styles.beadUrgent
              : warning
                ? styles.beadWarning
                : styles.beadActive;
          if (active && urgent) {
            return (
              <Animated.View key={index} style={[{ flex: 1 }, pulseStyle]}>
                <View style={[styles.bead, beadStyle]} />
              </Animated.View>
            );
          }
          return <View key={index} style={[styles.bead, beadStyle]} />;
        })}
      </View>
      <Text
        style={[styles.time, urgent ? styles.timeUrgent : warning ? styles.timeWarning : undefined]}
      >
        {secondsLeft}s
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
  },
  beads: {
    flex: 1,
    flexDirection: "row",
    gap: 3,
  },
  bead: {
    flex: 1,
    height: 6,
    borderRadius: theme.radius.full,
  },
  beadOff: {
    backgroundColor: theme.colors.surface2,
  },
  beadActive: {
    backgroundColor: theme.colors.accent,
  },
  beadWarning: {
    backgroundColor: theme.colors.warning,
  },
  beadUrgent: {
    backgroundColor: theme.colors.danger,
  },
  time: {
    minWidth: 40,
    color: theme.colors.muted,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.body,
    fontVariant: ["tabular-nums"],
    textAlign: "right",
  },
  timeWarning: {
    color: theme.colors.warning,
  },
  timeUrgent: {
    color: theme.colors.danger,
  },
}));
