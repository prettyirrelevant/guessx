import { useReducedMotion } from "react-native-reanimated";
import { type StyleProp, Text, type TextStyle } from "react-native";
import { useEffect, useState } from "react";

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

// Counts up to the target value with requestAnimationFrame. Renders a plain
// Text so Unistyles styles resolve normally.
export function NumberTicker({
  value,
  style,
  prefix = "",
  suffix = "",
  signed = false,
  duration = 800,
  delay = 0,
}: {
  value: number;
  style?: StyleProp<TextStyle>;
  prefix?: string;
  suffix?: string;
  signed?: boolean;
  duration?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start - delay;
      if (elapsed < 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const progress = Math.min(1, elapsed / duration);
      setDisplay(Math.round(value * easeOut(progress)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, delay, reduced]);

  const sign = signed && display > 0 ? "+" : "";
  return (
    <Text style={style}>
      {prefix}
      {sign}
      {display}
      {suffix}
    </Text>
  );
}
