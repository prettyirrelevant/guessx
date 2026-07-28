import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Linking, ScrollView, Text, View } from "react-native";
import { ArrowUpRight, ChevronLeft } from "lucide-react-native";
import { router } from "expo-router";

import { PressableScale } from "@/components/ui";

type Credit = {
  name: string;
  url: string;
  description: string;
};

const CREDITS: Credit[] = [
  {
    name: "TMDB",
    url: "https://www.themoviedb.org",
    description: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
  },
  {
    name: "Simple Icons",
    url: "https://simpleicons.org",
    description:
      "Brand icons are supplied by Simple Icons. Brand names and logos remain trademarks of their respective owners; their use does not imply endorsement.",
  },
  {
    name: "DiceBear",
    url: "https://www.dicebear.com",
    description:
      "Avatars use the Adventurer style by Lisa Wischofsky, remixed by DiceBear and licensed under CC BY 4.0.",
  },
  {
    name: "Deezer",
    url: "https://www.deezer.com",
    description:
      "Artist metadata and 30-second track previews are supplied by Deezer. Deezer does not endorse or certify guessX.",
  },
  {
    name: "Flagpedia",
    url: "https://flagpedia.net",
    description:
      "Flag images are served by Flagpedia’s FlagCDN service. Country metadata is bundled with guessX.",
  },
];

export default function CreditsScreen() {
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

      <Text style={styles.title}>credits</Text>

      <View style={styles.list}>
        {CREDITS.map((credit) => (
          <View key={credit.name} style={styles.section}>
            <PressableScale
              accessibilityRole="link"
              haptic="selection"
              onPress={() => void Linking.openURL(credit.url)}
              scaleTo={0.98}
              style={styles.sourceRow}
            >
              <Text style={styles.sourceName}>{credit.name}</Text>
              <ArrowUpRight color="#c8f135" size={16} />
            </PressableScale>
            <Text style={styles.description}>{credit.description}</Text>
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
    paddingBottom: theme.space[5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[1],
    alignSelf: "flex-start",
  },
  sourceName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
  },
  description: {
    color: theme.colors.muted,
    fontSize: theme.fontSize.bodySm,
    lineHeight: 21,
  },
}));
