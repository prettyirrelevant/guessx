import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useEffect, useMemo } from "react";

const COLORS = ["#c8f135", "#43d675", "#ffb020", "#7c5cff", "#f0f0f0"];

type Variant = "rain" | "burst";

type Piece = {
  key: number;
  color: string;
  size: number;
  x: number;
  y: number;
  driftX: number;
  riseY: number;
  fallY: number;
  spin: number;
  delay: number;
  duration: number;
  square: boolean;
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function build(count: number, variant: Variant, width: number, height: number): Piece[] {
  const originX = width / 2;
  const originY = height * 0.42;
  return Array.from({ length: count }, (_, index) => {
    if (variant === "burst") {
      const angle = rand(-Math.PI, 0);
      const power = rand(80, width * 0.55);
      return {
        key: index,
        color: COLORS[index % COLORS.length],
        size: rand(7, 12),
        x: originX,
        y: originY,
        driftX: Math.cos(angle) * power,
        riseY: Math.sin(angle) * rand(120, 300),
        fallY: height * 0.7,
        spin: rand(-3, 3),
        delay: rand(0, 120),
        duration: rand(1_100, 1_700),
        square: index % 2 === 0,
      };
    }
    return {
      key: index,
      color: COLORS[index % COLORS.length],
      size: rand(7, 13),
      x: rand(0, width),
      y: rand(-height * 0.4, -20),
      driftX: rand(-50, 50),
      riseY: 0,
      fallY: height + 60,
      spin: rand(-4, 4),
      delay: rand(0, 700),
      duration: rand(1_900, 3_200),
      square: index % 2 === 0,
    };
  });
}

export function Confetti({ count = 48, variant = "rain" }: { count?: number; variant?: Variant }) {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const pieces = useMemo(
    () => (reduced ? [] : build(count, variant, width, height)),
    [count, variant, width, height, reduced],
  );

  if (reduced) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece) => (
        <ConfettiPiece key={piece.key} piece={piece} variant={variant} />
      ))}
    </View>
  );
}

function ConfettiPiece({ piece, variant }: { piece: Piece; variant: Variant }) {
  const progress = useSharedValue(0);
  const fall = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      piece.delay,
      withTiming(1, { duration: piece.duration, easing: Easing.out(Easing.quad) }),
    );
    if (variant === "burst") {
      fall.value = withDelay(
        piece.delay,
        withSequence(
          withTiming(piece.riseY, {
            duration: piece.duration * 0.35,
            easing: Easing.out(Easing.quad),
          }),
          withTiming(piece.fallY, {
            duration: piece.duration * 0.65,
            easing: Easing.in(Easing.quad),
          }),
        ),
      );
    } else {
      fall.value = withDelay(piece.delay, withTiming(piece.fallY, { duration: piece.duration }));
    }
    // animate once on mount
  }, [fall, progress, piece, variant]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: piece.driftX * progress.value },
      { translateY: fall.value },
      { rotate: `${piece.spin * progress.value * 360}deg` },
    ],
    opacity: progress.value > 0.85 ? (1 - progress.value) / 0.15 : 1,
  }));

  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          left: piece.x,
          top: piece.y,
          width: piece.size,
          height: piece.size,
          borderRadius: piece.square ? 2 : piece.size / 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}
