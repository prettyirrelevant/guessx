import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ScrollView, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { router } from "expo-router";

import { PressableScale } from "@/components/ui";

const RULES = [
  {
    title: "answer fast",
    description:
      "Pick one answer before time runs out. Your choice locks immediately, so choose carefully.",
  },
  {
    title: "score more",
    description:
      "Correct answers earn points. The faster you answer correctly, the more points you can win.",
  },
  {
    title: "build a streak",
    description:
      "Three or more correct answers in a row earn bonus points. A wrong or missed answer breaks the streak.",
  },
  {
    title: "watch and listen",
    description:
      "Rounds can include images or audio previews. Turn up your sound before starting a music game.",
  },
  {
    title: "finish strong",
    description:
      "The final round is worth double. After each round, the reveal shows the result and updated standings.",
  },
] as const;

export default function HowToPlayScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.screen,
        { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <PressableScale
        accessibilityRole="button"
        haptic="selection"
        hitSlop={8}
        onPress={() => router.back()}
        scaleTo={0.97}
        style={styles.back}
      >
        <ChevronLeft color="#b0b0b0" size={18} />
        <Text style={styles.backText}>back</Text>
      </PressableScale>

      <Text accessibilityRole="header" style={styles.title}>
        how to play
      </Text>

      <View style={styles.list}>
        {RULES.map((rule, index) => (
          <View
            key={rule.title}
            style={[styles.section, index < RULES.length - 1 && styles.sectionDivider]}
          >
            <Text accessibilityRole="header" style={styles.ruleTitle}>
              {rule.title}
            </Text>
            <Text selectable style={styles.description}>
              {rule.description}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flexGrow: 1,
    gap: theme.space[5],
    paddingHorizontal: theme.space[5],
    backgroundColor: theme.colors.bg,
  },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[1],
    alignSelf: "flex-start",
  },
  backText: {
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
  },
  list: {
    gap: theme.space[5],
  },
  section: {
    gap: theme.space[2],
  },
  sectionDivider: {
    paddingBottom: theme.space[5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  ruleTitle: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
  },
  description: {
    color: theme.colors.muted,
    fontSize: theme.fontSize.bodySm,
    lineHeight: 21,
  },
}));
