import { StyleSheet } from "react-native-unistyles";
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  ScrollView,
  type StyleProp,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import type { ComponentProps, ReactNode } from "react";
import { Image, type ImageStyle } from "expo-image";

import { getAvatarUrl } from "@/lib/session";
import { haptics } from "@/lib/haptics";

type HapticKind = keyof typeof haptics;

// Instant press feedback: a scale-down on touch-down that reads as physical.
// Kept on a plain Pressable (not a Reanimated custom component) so Unistyles
// styles resolve correctly.
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  haptic,
  onPress,
  disabled,
  ...rest
}: Omit<PressableProps, "style"> & {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: HapticKind;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={(event) => {
        if (haptic) haptics[haptic]();
        onPress?.(event);
      }}
      style={({ pressed }) => [
        style,
        pressed && { opacity: 0.92, transform: [{ scale: scaleTo }] },
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}

export function Screen({
  children,
  centered = false,
}: {
  children: ReactNode;
  centered?: boolean;
}) {
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.screen, centered && styles.screenCentered]}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Body({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Mono({ children, muted = false }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.mono, muted && styles.muted]}>{children}</Text>;
}

export function Pill({ children }: { children: ReactNode }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{children}</Text>
    </View>
  );
}

export function Field(props: ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      autoCapitalize="none"
      placeholderTextColor="#8a8a8a"
      selectionColor="#c8f135"
      {...props}
      style={[styles.field, props.style]}
    />
  );
}

export function Button({
  children,
  compact = false,
  disabled,
  loading = false,
  onPress,
  variant = "primary",
}: {
  children: ReactNode;
  compact?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "danger" | "accentOutline";
}) {
  const unavailable = disabled || loading;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: unavailable }}
      disabled={unavailable}
      haptic="selection"
      hitSlop={4}
      onPress={onPress}
      style={[
        styles.button,
        compact && styles.buttonCompact,
        variant === "secondary" && styles.buttonSecondary,
        variant === "danger" && styles.buttonDanger,
        variant === "accentOutline" && styles.buttonAccentOutline,
        unavailable && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? "#0a0a0a" : "#f0f0f0"} size="small" />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.buttonText,
            variant === "secondary" && styles.buttonTextSecondary,
            variant === "danger" && styles.buttonTextDanger,
            variant === "accentOutline" && styles.buttonTextAccent,
          ]}
        >
          {children}
        </Text>
      )}
    </PressableScale>
  );
}

// Quiet text action for secondary room controls.
export function TextButton({
  children,
  onPress,
  tone = "muted",
}: {
  children: ReactNode;
  onPress?: () => void;
  tone?: "muted" | "danger";
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      haptic="selection"
      hitSlop={8}
      onPress={onPress}
      scaleTo={0.98}
      style={styles.textButton}
    >
      <Text style={[styles.textButtonLabel, tone === "danger" && styles.textButtonDanger]}>
        {children}
      </Text>
    </PressableScale>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Avatar({
  seed,
  size = 36,
  style,
}: {
  seed: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      contentFit="contain"
      source={`${getAvatarUrl(seed)}&size=${size * 2}`}
      style={[{ width: size, height: size, borderRadius: 999, backgroundColor: "#1e1e1e" }, style]}
      transition={120}
    />
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="alert" selectable style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flexGrow: 1,
    gap: theme.space[5],
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[5],
    paddingBottom: theme.space[10],
    backgroundColor: theme.colors.bg,
  },
  screenCentered: {
    justifyContent: "center",
  },
  eyebrow: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  sectionLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayLg,
    letterSpacing: theme.tracking.display,
    lineHeight: 40,
  },
  body: {
    color: theme.colors.text,
    fontSize: theme.fontSize.body,
    lineHeight: 23,
  },
  mono: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
    lineHeight: 22,
  },
  muted: {
    color: theme.colors.muted,
  },
  pill: {
    alignSelf: "center",
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[1],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
  },
  pillText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  field: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    paddingHorizontal: theme.space[4],
    color: theme.colors.text,
    backgroundColor: theme.colors.surface2,
    fontSize: theme.fontSize.body,
  },
  button: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingHorizontal: theme.space[5],
    backgroundColor: theme.colors.accent,
  },
  buttonCompact: {
    paddingHorizontal: theme.space[2],
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  buttonDanger: {
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: "transparent",
  },
  buttonAccentOutline: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.surface,
  },
  buttonText: {
    color: theme.colors.bg,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.bodySm,
    letterSpacing: theme.tracking.tight,
  },
  buttonTextSecondary: {
    color: theme.colors.text,
  },
  buttonTextDanger: {
    color: theme.colors.danger,
  },
  buttonTextAccent: {
    color: theme.colors.accent,
  },
  textButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  textButtonLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  textButtonDanger: {
    color: theme.colors.danger,
  },
  disabled: {
    opacity: 0.5,
  },
  card: {
    gap: theme.space[4],
    padding: theme.space[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  error: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    lineHeight: 18,
    textAlign: "center",
  },
}));
