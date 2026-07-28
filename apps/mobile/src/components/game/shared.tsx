import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, ReduceMotion } from "react-native-reanimated";
import { Alert, Text, View } from "react-native";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";

import { colors, space } from "@/theme";
import { haptics } from "@/lib/haptics";
import { API_URL } from "@/lib/config";
import { PressableScale } from "@/components/ui";

export const SCREEN_ENTER = FadeIn.duration(200).reduceMotion(ReduceMotion.System);

// Reanimated's Animated.ScrollView chokes on Unistyles styles (it flattens
// contentContainerStyle), so the container style is a plain object built from
// the exported token constants.
export function GameScroll({
  children,
  gap = 24,
  transparent = false,
}: {
  children: ReactNode;
  gap?: number;
  transparent?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        paddingHorizontal: space[4],
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 40,
        gap,
        backgroundColor: transparent ? "transparent" : colors.bg,
      }}
      entering={SCREEN_ENTER}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </Animated.ScrollView>
  );
}

export function confirmClose(onConfirm: () => void) {
  Alert.alert("Close this room?", "The game will end for everyone in the room.", [
    { text: "Cancel", style: "cancel" },
    { text: "Close room", style: "destructive", onPress: onConfirm },
  ]);
}

export function ExitButton() {
  const leave = () => {
    haptics.selection();
    Alert.alert("Leave this room?", "You can rejoin with the room code while the game is open.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => router.replace("/") },
    ]);
  };

  return (
    <PressableScale
      accessibilityLabel="leave room"
      accessibilityRole="button"
      hitSlop={4}
      onPress={leave}
      scaleTo={0.9}
      style={styles.iconButton}
    >
      <X color="#b0b0b0" size={18} />
    </PressableScale>
  );
}

export function CopyableCode({ roomId }: { roomId: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(`${API_URL}/room/${roomId}`);
      haptics.success();
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1_600);
    } catch {
      haptics.error();
    }
  };

  return (
    <PressableScale
      accessibilityLabel={copied ? "invite link copied" : "copy room invite link"}
      accessibilityRole="button"
      hitSlop={6}
      onPress={copy}
      scaleTo={0.97}
      style={styles.codeRow}
    >
      <Text selectable style={styles.code}>
        {roomId}
      </Text>
      {copied ? <Check color="#43d675" size={18} /> : <Copy color="#8a8a8a" size={18} />}
    </PressableScale>
  );
}

export function TopBar({ children }: { children: React.ReactNode }) {
  return <View style={styles.topBar}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
  },
  code: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayMd,
    letterSpacing: 2,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
}));
