import Animated, {
  Easing,
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
import { Circle, Square, Triangle } from "lucide-react-native";
import type { RoomMode } from "@guessx/game";

import { colors, radius } from "@/theme";

// A mode-specific "building your game" motif. Each previews what you're about to
// play instead of a generic spinner. Animated layers use plain styles (Reanimated
// rejects Unistyles style refs).
export function PreparingMotif({ mode }: { mode: RoomMode }) {
  if (mode === "music") return <Equalizer />;
  if (mode === "flag") return <Stripes />;
  if (mode === "actor") return <FilmStrip />;
  return <Shapes />;
}

const HEIGHT = 52;

function Equalizer() {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: HEIGHT }}>
      {[0, 1, 2, 3, 4].map((index) => (
        <EqBar index={index} key={index} />
      ))}
    </View>
  );
}

function EqBar({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const value = useSharedValue(0.35);
  useEffect(() => {
    if (reduced) return;
    value.value = withDelay(
      index * 110,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 360, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.35, { duration: 360, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
  }, [index, reduced, value]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: value.value }] }));
  return (
    <Animated.View
      style={[
        {
          width: 7,
          height: HEIGHT,
          borderRadius: 4,
          backgroundColor: colors.accent,
          transformOrigin: "bottom",
        },
        style,
      ]}
    />
  );
}

function Stripes() {
  return (
    <View style={{ gap: 7, height: HEIGHT, justifyContent: "center" }}>
      {[0, 1, 2].map((index) => (
        <Stripe index={index} key={index} />
      ))}
    </View>
  );
}

function Stripe({ index }: { index: number }) {
  const reduced = useReducedMotion();
  const value = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    value.value = withDelay(
      index * 150,
      withRepeat(
        withSequence(
          withTiming(10, { duration: 620, easing: Easing.inOut(Easing.sin) }),
          withTiming(-10, { duration: 620, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        true,
      ),
    );
  }, [index, reduced, value]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: value.value }] }));
  return (
    <Animated.View
      style={[
        {
          width: 68,
          height: 11,
          borderRadius: 6,
          backgroundColor: index === 1 ? colors.accent : colors.lineStrong,
        },
        style,
      ]}
    />
  );
}

function Shapes() {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 14, height: HEIGHT }}>
      <Shape Icon={Triangle} index={0} />
      <Shape Icon={Square} index={1} />
      <Shape Icon={Circle} index={2} />
    </View>
  );
}

function Shape({ index, Icon }: { index: number; Icon: typeof Circle }) {
  const reduced = useReducedMotion();
  const value = useSharedValue(0.7);
  useEffect(() => {
    if (reduced) return;
    value.value = withDelay(
      index * 200,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 420, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.7, { duration: 420, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
  }, [index, reduced, value]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: value.value }],
    opacity: 0.45 + value.value * 0.55,
  }));
  return (
    <Animated.View style={style}>
      <Icon color={colors.accent} size={30} strokeWidth={2.5} />
    </Animated.View>
  );
}

function FilmStrip() {
  const reduced = useReducedMotion();
  const value = useSharedValue(0);
  const cell = 34 + 6; // frame width + gap
  useEffect(() => {
    if (reduced) return;
    value.value = withRepeat(
      withTiming(-cell * 2, { duration: 1_100, easing: Easing.linear }),
      -1,
      false,
    );
  }, [cell, reduced, value]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: value.value }] }));
  return (
    <View style={{ width: 132, height: HEIGHT, overflow: "hidden", justifyContent: "center" }}>
      <Animated.View style={[{ flexDirection: "row", gap: 6 }, style]}>
        {Array.from({ length: 10 }).map((_, index) => (
          <View
            key={index}
            style={{
              width: 34,
              height: 44,
              borderRadius: radius.sm,
              borderWidth: 2,
              borderColor: colors.border,
              backgroundColor: index % 2 === 0 ? colors.accentSoft : colors.surface2,
            }}
          />
        ))}
      </Animated.View>
    </View>
  );
}
