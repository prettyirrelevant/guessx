import { StyleSheet } from "react-native-unistyles";
import {
  ActivityIndicator,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react-native";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";

import { haptics } from "@/lib/haptics";
import { PressableScale } from "@/components/ui";

const BAR_COUNT = 40;

// deterministic stand-in waveform, seeded from the clip url so each track looks
// distinct and stable between renders.
function barsFor(source: string): number[] {
  let value = 0;
  for (let index = 0; index < source.length; index++) {
    value = (value * 31 + source.charCodeAt(index)) >>> 0;
  }
  return Array.from({ length: BAR_COUNT }, (_, index) => {
    value = (value * 1_664_525 + 1_013_904_223 + index) >>> 0;
    const envelope = Math.sin((index / BAR_COUNT) * Math.PI); // fade at the edges
    return 0.2 + envelope * (0.25 + (value % 55) / 100);
  });
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ source }: { source: string }) {
  const player = useAudioPlayer(source, { downloadFirst: false, updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const bars = useMemo(() => barsFor(source), [source]);
  const [muted, setMuted] = useState(false);
  const width = useRef(0);

  const duration = status.duration ?? 0;
  const fraction = duration > 0 ? status.currentTime / duration : 0;
  const failed = status.playbackState === "failed";

  useEffect(() => {
    player.play();
    return () => {
      // expo-audio may already have released the native player on unmount /
      // source change; pausing a freed object throws.
      try {
        player.pause();
      } catch {}
    };
  }, [player]);

  if (!status.isLoaded || failed) {
    return (
      <View accessibilityLiveRegion="polite" style={styles.loadState}>
        {failed ? null : <ActivityIndicator color="#c8f135" />}
        <Text accessibilityRole={failed ? "alert" : undefined} style={styles.loadText}>
          {failed ? "Audio could not be loaded" : "Loading audio…"}
        </Text>
      </View>
    );
  }

  const onLayout = (event: LayoutChangeEvent) => {
    width.current = event.nativeEvent.layout.width;
  };

  const seek = (event: GestureResponderEvent) => {
    if (duration <= 0 || width.current <= 0) return;
    const ratio = Math.max(0, Math.min(1, event.nativeEvent.locationX / width.current));
    player.seekTo(ratio * duration);
  };

  const toggle = () => {
    haptics.selection();
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish) player.seekTo(0);
    player.play();
  };

  const toggleMute = () => {
    haptics.selection();
    const next = !muted;
    player.muted = next;
    setMuted(next);
  };

  return (
    <View style={styles.container}>
      <PressableScale
        accessibilityLabel={status.playing ? "pause" : "play"}
        accessibilityRole="button"
        haptic={undefined}
        onPress={toggle}
        scaleTo={0.94}
        style={styles.playButton}
      >
        {status.playing ? (
          <Pause color="#0a0a0a" fill="#0a0a0a" size={20} />
        ) : (
          <Play color="#0a0a0a" fill="#0a0a0a" size={20} />
        )}
      </PressableScale>

      <View style={styles.controls}>
        <View
          accessibilityLabel="seek"
          accessibilityRole="adjustable"
          onLayout={onLayout}
          onResponderGrant={(event) => {
            haptics.selection();
            seek(event);
          }}
          onResponderMove={seek}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          style={styles.waveform}
        >
          {bars.map((height, index) => (
            <View
              key={index}
              style={[
                styles.bar,
                { height: `${Math.round(height * 100)}%` },
                index / bars.length <= fraction ? styles.barOn : styles.barOff,
              ]}
            />
          ))}
        </View>
        <View style={styles.timeRow}>
          <Text style={styles.time}>{formatTime(status.currentTime)}</Text>
          <Text style={styles.time}>{formatTime(duration)}</Text>
        </View>
      </View>

      <PressableScale
        accessibilityLabel={muted ? "unmute" : "mute"}
        accessibilityRole="button"
        haptic={undefined}
        onPress={toggleMute}
        scaleTo={0.9}
        style={styles.muteButton}
      >
        {muted ? <VolumeX color="#8a8a8a" size={18} /> : <Volume2 color="#b0b0b0" size={18} />}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  loadState: {
    width: "100%",
    minHeight: 80,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space[3],
    padding: theme.space[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  loadText: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
  },
  container: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    padding: theme.space[4],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  playButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
  controls: {
    flex: 1,
    gap: theme.space[1],
  },
  waveform: {
    height: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  bar: {
    flex: 1,
    minHeight: 3,
    borderRadius: theme.radius.full,
  },
  barOn: {
    backgroundColor: theme.colors.accent,
  },
  barOff: {
    backgroundColor: theme.colors.muted2,
    opacity: 0.5,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  time: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    fontVariant: ["tabular-nums"],
  },
  muteButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
}));
