import { StyleSheet } from "react-native-unistyles";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { View } from "react-native";
import { useEffect } from "react";

export function LoadingDots() {
  return (
    <View style={styles.row}>
      <Dot delay={0} />
      <Dot delay={160} />
      <Dot delay={320} />
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  const reduced = useReducedMotion();
  const value = useSharedValue(reduced ? 1 : 0.3);

  useEffect(() => {
    if (reduced) return;
    value.value = withDelay(
      delay,
      withRepeat(
        withSequence(withTiming(1, { duration: 540 }), withTiming(0.3, { duration: 540 })),
        -1,
      ),
    );
  }, [delay, reduced, value]);

  const style = useAnimatedStyle(() => ({
    opacity: value.value,
    transform: [{ scale: 0.7 + value.value * 0.3 }],
  }));

  return (
    <Animated.View style={style}>
      <View style={styles.dot} />
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    gap: theme.space[2],
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
}));
