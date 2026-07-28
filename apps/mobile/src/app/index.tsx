import { StyleSheet } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { CircleHelp, Info, Pencil } from "lucide-react-native";
import { router } from "expo-router";

import { AVATAR_SEEDS, useSession } from "@/lib/session";
import { haptics } from "@/lib/haptics";
import { Avatar, Button, Field, PressableScale } from "@/components/ui";
import { AvatarCarousel } from "@/components/fx/avatar-carousel";

export default function HomeScreen() {
  const session = useSession();
  const [editing, setEditing] = useState(false);

  const insets = useSafeAreaInsets();

  if (!session.ready) return <View style={styles.loading} />;

  const showSetup = !session.hasProfile || editing;

  return (
    <View style={styles.root}>
      <View style={[styles.utilityActions, { top: insets.top + 8 }]}>
        <PressableScale
          accessibilityLabel="How to play"
          accessibilityRole="button"
          haptic="selection"
          hitSlop={8}
          onPress={() => router.push("/how-to-play")}
          scaleTo={0.9}
          style={styles.utilityButton}
        >
          <CircleHelp color="#8a8a8a" size={18} />
        </PressableScale>
        <PressableScale
          accessibilityLabel="Credits"
          accessibilityRole="button"
          haptic="selection"
          hitSlop={8}
          onPress={() => router.push("/credits")}
          scaleTo={0.9}
          style={styles.utilityButton}
        >
          <Info color="#8a8a8a" size={18} />
        </PressableScale>
      </View>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.screen,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeIn.duration(400)}>
          <View style={styles.hero}>
            <Text style={styles.logo}>
              guess<Text style={styles.logoX}>X</Text>
            </Text>
            <Text style={styles.tagline}>fastest finger wins</Text>
          </View>
        </Animated.View>

        {showSetup ? (
          <ProfileCard
            initialAvatar={session.avatar}
            initialName={session.displayName}
            onSave={(name, avatar) => {
              session.setDisplayName(name);
              session.setAvatar(avatar);
              setEditing(false);
              haptics.success();
            }}
          />
        ) : (
          <Animated.View entering={FadeIn.duration(140)}>
            <View style={styles.ready}>
              <PressableScale
                accessibilityLabel="Edit your profile"
                accessibilityRole="button"
                haptic="selection"
                onPress={() => setEditing(true)}
                scaleTo={0.98}
                style={styles.identity}
              >
                <Avatar seed={session.avatar} size={32} />
                <View style={styles.identityText}>
                  <Text style={styles.identityLabel}>playing as</Text>
                  <Text numberOfLines={1} style={styles.identityName}>
                    {session.displayName}
                  </Text>
                </View>
                <Pencil color="#8a8a8a" size={16} />
              </PressableScale>

              <View style={styles.actions}>
                <Button onPress={() => router.push("/create")}>Create room</Button>
                <Button onPress={() => router.push("/join")} variant="secondary">
                  Join room
                </Button>
              </View>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

function ProfileCard({
  initialName,
  initialAvatar,
  onSave,
}: {
  initialName: string;
  initialAvatar: string;
  onSave: (name: string, avatar: string) => void;
}) {
  const defaultAvatar = AVATAR_SEEDS[Math.floor(AVATAR_SEEDS.length / 2)];
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar || defaultAvatar);
  const canSave = name.trim().length > 0 && avatar.length > 0;

  return (
    <Animated.View entering={FadeInDown.duration(320)}>
      <View style={styles.card}>
        <Text style={styles.cardLabel}>set up your profile</Text>
        <Field
          autoCapitalize="words"
          maxLength={20}
          onChangeText={setName}
          onSubmitEditing={() => canSave && onSave(name.trim(), avatar)}
          placeholder="your name"
          returnKeyType="done"
          value={name}
        />

        <Text style={styles.cardLabel}>pick your avatar</Text>
        <AvatarCarousel onSelect={setAvatar} seeds={AVATAR_SEEDS} selected={avatar} />

        <Button disabled={!canSave} onPress={() => onSave(name.trim(), avatar)}>
          Save profile
        </Button>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  root: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  utilityActions: {
    position: "absolute",
    right: theme.space[4],
    zIndex: 10,
    flexDirection: "row",
  },
  utilityButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
  },
  screen: {
    flexGrow: 1,
    justifyContent: "center",
    gap: theme.space[8],
    paddingHorizontal: theme.space[5],
    paddingVertical: theme.space[8],
  },
  hero: {
    alignItems: "center",
    gap: theme.space[3],
  },
  logo: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayXl,
    letterSpacing: theme.tracking.display,
    lineHeight: 62,
  },
  logoX: {
    color: theme.colors.accent,
  },
  tagline: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
    textAlign: "center",
  },
  ready: {
    gap: theme.space[4],
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    padding: theme.space[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  identityLabel: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  identityName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
  },
  actions: {
    gap: theme.space[3],
  },
  card: {
    gap: theme.space[3],
    padding: theme.space[5],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  cardLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
}));
