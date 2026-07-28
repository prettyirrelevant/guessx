import { StyleSheet } from "react-native-unistyles";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Text, View } from "react-native";
import { useState } from "react";
import { CircleHelp, Shield } from "lucide-react-native";
import { router } from "expo-router";
import { useRoomConnection } from "@guessx/server/react";
import type { PublicPlayer, PublicRoom, RoomMode } from "@guessx/game";

import { toast } from "@/lib/toast";
import { haptics } from "@/lib/haptics";
import { Avatar, Button, PressableScale, TextButton } from "@/components/ui";
import {
  confirmClose,
  CopyableCode,
  ExitButton,
  GameScroll,
  TopBar,
} from "@/components/game/shared";

const MODE_LABELS: Record<RoomMode, string> = {
  music: "guess the song",
  actor: "guess the actor",
  flag: "name the flag",
  place: "guess the logo",
};

export function Lobby({ room }: { room: PublicRoom }) {
  const { snapshot, command } = useRoomConnection();
  const players = snapshot?.players ?? [];
  const [busy, setBusy] = useState(false);

  const connected = players.filter((p) => p.status === "connected").length;
  const canStart = room.isHost && connected >= 2;
  const missing = Math.max(0, 2 - connected);
  const emptySlots = Math.max(0, room.maxPlayers - players.length);

  const run = async (name: "start" | "close") => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await command(name);
      if (result.error) {
        toast.error(result.error);
        haptics.error();
      } else {
        haptics.impact();
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Could not update the room. Try again");
      haptics.error();
    } finally {
      setBusy(false);
    }
  };

  return (
    <GameScroll>
      <TopBar>
        <CopyableCode roomId={room.roomId} />
        <ExitButton />
      </TopBar>

      <PressableScale
        accessibilityHint="How to play"
        accessibilityRole="button"
        haptic="selection"
        onPress={() => router.push("/how-to-play")}
        scaleTo={0.97}
        style={styles.modeBadge}
      >
        <Text style={styles.modeBadgeText}>{MODE_LABELS[room.mode]}</Text>
        <CircleHelp color="#8a8a8a" size={14} />
      </PressableScale>

      <View style={styles.settings}>
        <Setting label="rounds" value={String(room.totalRounds)} />
        <Setting label="time" value={`${room.roundDuration / 1_000}s`} />
        <Setting label="players" value={String(room.maxPlayers)} last />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionLabel}>players</Text>
          <Text style={styles.count}>
            {players.length}/{room.maxPlayers}
          </Text>
        </View>
        <View style={styles.list}>
          {players.map((player, index) => (
            <PlayerRow index={index} key={player._id} player={player} />
          ))}
          {Array.from({ length: emptySlots }).map((_, index) => (
            <View key={`empty-${index}`} style={styles.emptySlot}>
              <View style={styles.emptyDot} />
              <Text style={styles.emptyText}>waiting…</Text>
            </View>
          ))}
        </View>
      </View>

      {room.isHost ? (
        <View style={styles.actions}>
          <Button disabled={!canStart} loading={busy} onPress={() => run("start")}>
            {canStart ? "Start game" : `Need ${missing} more player${missing > 1 ? "s" : ""}`}
          </Button>
          <TextButton onPress={() => confirmClose(() => void run("close"))} tone="danger">
            close room
          </TextButton>
        </View>
      ) : (
        <View style={styles.waiting}>
          <Text style={styles.waitingText}>Waiting for the host to start…</Text>
        </View>
      )}
    </GameScroll>
  );
}

function Setting({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.setting, !last && styles.settingBorder]}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

function PlayerRow({ player, index }: { player: PublicPlayer; index: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 40).duration(260)}>
      <View style={styles.playerRow}>
        <Avatar seed={player.avatar} size={30} />
        <Text numberOfLines={1} style={styles.playerName}>
          {player.displayName}
        </Text>
        {player.isCurrent ? <Text style={styles.youTag}>you</Text> : null}
        {player.isHost ? <Shield color="#c8f135" fill="#c8f135" size={16} /> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  modeBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[1],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
  },
  modeBadgeText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  settings: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
  setting: {
    flex: 1,
    alignItems: "center",
    gap: 2,
    paddingVertical: theme.space[3],
  },
  settingBorder: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: theme.colors.border,
  },
  settingLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  settingValue: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    fontVariant: ["tabular-nums"],
  },
  section: {
    gap: theme.space[3],
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  count: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    fontVariant: ["tabular-nums"],
  },
  list: {
    gap: theme.space[1],
  },
  playerRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  playerName: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.fontSize.bodySm,
    fontWeight: "600",
  },
  youTag: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  emptySlot: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    padding: theme.space[3],
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
  },
  emptyDot: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.muted2,
  },
  emptyText: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
  },
  actions: {
    gap: theme.space[2],
  },
  waiting: {
    alignItems: "center",
    padding: theme.space[3],
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  waitingText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.bodySm,
  },
}));
