import { StyleSheet } from "react-native-unistyles";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Text, View } from "react-native";
import { useEffect } from "react";

import { colors } from "@/theme";

const TRACK = 132;
const SEGMENT = 44;

// The wordmark as the loader: a slim indeterminate lime bar sweeps beneath it.
// No spinner or visible status copy — the brand carries the moment.
export function BrandLoader({ label = "Loading" }: { label?: string }) {
  return (
    <View
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      accessibilityRole="progressbar"
      accessible
      style={styles.wrap}
    >
      <Text style={styles.logo}>
        guess<Text style={styles.logoX}>X</Text>
      </Text>
      <IndeterminateBar />
    </View>
  );
}

function IndeterminateBar() {
  const reduced = useReducedMotion();
  const value = useSharedValue(-SEGMENT);
  useEffect(() => {
    cancelAnimation(value);
    if (reduced) {
      value.value = 0;
      return;
    }
    value.value = -SEGMENT;
    value.value = withRepeat(
      withTiming(TRACK, { duration: 1_000, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(value);
  }, [reduced, value]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: value.value }] }));

  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          { width: SEGMENT, height: 3, borderRadius: 2, backgroundColor: colors.accent },
          style,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space[4],
    backgroundColor: theme.colors.bg,
  },
  logo: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayLg,
    letterSpacing: theme.tracking.display,
  },
  logoX: {
    color: theme.colors.accent,
  },
  track: {
    width: TRACK,
    height: 3,
    borderRadius: 2,
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
}));
