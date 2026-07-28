import { StyleSheet } from "react-native-unistyles";
import { Text, TextInput, View } from "react-native";
import { useState } from "react";
import { Redirect, router } from "expo-router";
import { isRoomCode } from "@guessx/game";

import { useSubmission } from "@/lib/use-submission";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { normalizeRoomCode } from "@/lib/room-code";
import { haptics } from "@/lib/haptics";
import { isAbortError } from "@/lib/async";
import { joinRoom } from "@/lib/api";
import { Button, Screen } from "@/components/ui";

export default function JoinScreen() {
  const { displayName, avatar, hasProfile, ready } = useSession();
  const [code, setCode] = useState("");
  const submission = useSubmission();

  const submit = async () => {
    const roomCode = normalizeRoomCode(code);
    if (!isRoomCode(roomCode)) {
      toast.error("Enter a valid room code");
      haptics.error();
      return;
    }

    const controller = submission.start();
    if (!controller) return;
    try {
      await joinRoom(
        { roomCode, displayName: displayName.trim(), avatar },
        { signal: controller.signal },
      );
      if (!submission.isCurrent(controller)) return;
      haptics.success();
      router.replace(`/room/${roomCode}`);
    } catch (cause) {
      if (isAbortError(cause) || !submission.isCurrent(controller)) return;
      toast.error(cause instanceof Error ? cause.message : "Could not join the room");
      haptics.error();
    } finally {
      submission.finish(controller);
    }
  };

  if (!ready) return null;
  if (!hasProfile) return <Redirect href="/" />;

  return (
    <Screen>
      <View style={styles.group}>
        <Text style={styles.label}>room code</Text>
        <View style={styles.inputWrap}>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={80}
            onChangeText={setCode}
            onSubmitEditing={submit}
            placeholder="AB-1234"
            placeholderTextColor="#8a8a8a"
            returnKeyType="go"
            selectionColor="#c8f135"
            style={styles.input}
            value={code}
          />
        </View>
        <Text style={styles.hint}>Enter the room code or paste an invite link</Text>
      </View>
      <Button loading={submission.loading} onPress={submit}>
        Join game
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create((theme) => ({
  group: {
    gap: theme.space[3],
  },
  label: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  inputWrap: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  input: {
    minHeight: 68,
    paddingHorizontal: theme.space[4],
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.displayMd,
    letterSpacing: 4,
    textAlign: "center",
    textTransform: "uppercase",
  },
  hint: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    textAlign: "center",
  },
}));
