import { StyleSheet } from "react-native-unistyles";
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { type GestureResponderEvent, Pressable, Text, View } from "react-native";
import { useEffect } from "react";
import { Check } from "lucide-react-native";
import { BlurView } from "expo-blur";

import { colors, radius } from "@/theme";

// Plain (non-Unistyles) styles for the animated layers — Reanimated 4.5 rejects
// Unistyles style refs, so these decorative overlays use the token constants.
const FILL_STYLE = {
  ...StyleSheet.absoluteFillObject,
  transformOrigin: "left" as const,
  backgroundColor: colors.accentSoft,
};
const RIPPLE_STYLE = {
  position: "absolute" as const,
  left: 0,
  top: 0,
  width: 240,
  height: 240,
  borderRadius: 120,
  backgroundColor: "rgba(200, 241, 53, 0.3)",
};
const BLUR_WRAP = {
  ...StyleSheet.absoluteFillObject,
  borderRadius: radius.md,
  overflow: "hidden" as const,
};

const RIPPLE = 240;

export function AnswerOption({
  label,
  letter,
  selected,
  locked,
  onPress,
}: {
  label: string;
  letter: string;
  selected: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const fill = useSharedValue(0);
  const rippleScale = useSharedValue(0);
  const rippleOpacity = useSharedValue(0);
  const rippleX = useSharedValue(0);
  const rippleY = useSharedValue(0);

  useEffect(() => {
    if (selected) {
      scale.value = withSequence(
        withTiming(1.04, { duration: 110 }),
        withSpring(1, { damping: 12, stiffness: 220 }),
      );
      fill.value = withTiming(1, { duration: 340 });
    }
  }, [selected, scale, fill]);

  const containerStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: rippleOpacity.value,
    transform: [
      { translateX: rippleX.value - RIPPLE / 2 },
      { translateY: rippleY.value - RIPPLE / 2 },
      { scale: rippleScale.value },
    ],
  }));

  const onPressIn = (event: GestureResponderEvent) => {
    if (locked) return;
    rippleX.value = event.nativeEvent.locationX;
    rippleY.value = event.nativeEvent.locationY;
    rippleScale.value = 0;
    rippleOpacity.value = 0.5;
    rippleScale.value = withTiming(1, { duration: 480 });
    rippleOpacity.value = withTiming(0, { duration: 480 });
    scale.value = withTiming(0.98, { duration: 90 });
  };

  const onPressOut = () => {
    if (!selected) scale.value = withSpring(1, { damping: 18, stiffness: 260 });
  };

  const dim = locked && !selected;

  return (
    <Animated.View style={containerStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: locked, selected }}
        disabled={locked}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={[styles.option, selected && styles.optionSelected]}
      >
        <Animated.View pointerEvents="none" style={[FILL_STYLE, fillStyle]} />
        <Animated.View pointerEvents="none" style={[RIPPLE_STYLE, rippleStyle]} />
        <View style={[styles.key, selected && styles.keyOn]}>
          <Text style={[styles.keyText, selected && styles.keyTextOn]}>{letter}</Text>
        </View>
        <Text style={styles.text}>{label}</Text>
        {selected ? <Check color="#c8f135" size={18} /> : null}
        {dim ? (
          <Animated.View entering={FadeIn.duration(220)} pointerEvents="none" style={BLUR_WRAP}>
            <BlurView intensity={14} style={StyleSheet.absoluteFill} tint="dark" />
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  option: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  optionSelected: {
    borderColor: theme.colors.accent,
  },
  key: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface2,
  },
  keyOn: {
    backgroundColor: theme.colors.accent,
  },
  keyText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
  },
  keyTextOn: {
    color: theme.colors.bg,
  },
  text: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.body,
    fontWeight: "600",
    lineHeight: 20,
  },
}));
