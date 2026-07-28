import { StyleSheet } from "react-native-unistyles";
import Animated, { FadeIn } from "react-native-reanimated";
import { ScrollView, Text, TextInput, View } from "react-native";
import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Flag,
  Headphones,
  Info,
  Minus,
  Plus,
  Search,
  Shapes,
  X,
} from "lucide-react-native";
import { Redirect, router } from "expo-router";
import { Image } from "expo-image";
import { ACTOR_CATEGORIES, CONTINENTS, POPULAR_ARTISTS, type RoomMode } from "@guessx/game";

import { useSubmission } from "@/lib/use-submission";
import { toast } from "@/lib/toast";
import { useSession } from "@/lib/session";
import { haptics } from "@/lib/haptics";
import { isAbortError } from "@/lib/async";
import { createRoom, searchArtists } from "@/lib/api";
import { Button, PressableScale } from "@/components/ui";

type Artist = { id: number; name: string; picture?: string };

const MODES = [
  {
    value: "music",
    label: "Guess the song",
    desc: "Name tracks from artists you pick",
    Icon: Headphones,
  },
  {
    value: "place",
    label: "Guess the logo",
    desc: "Identify brands from their logo",
    Icon: Shapes,
  },
  { value: "actor", label: "Guess the actor", desc: "Name the face on screen", Icon: Clapperboard },
  { value: "flag", label: "Name the flag", desc: "Match the flag to its country", Icon: Flag },
] as const;

const ROUND_OPTIONS = [3, 5, 7, 10] as const;
const TIME_OPTIONS = [10_000, 15_000, 20_000, 30_000] as const;
const MAX_ARTISTS = 3;

const deezerImg = (id: number) => `https://api.deezer.com/artist/${id}/image?size=small`;

export default function CreateScreen() {
  const { displayName, avatar, hasProfile, ready } = useSession();
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<RoomMode>("music");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [roundIndex, setRoundIndex] = useState(1);
  const [timeIndex, setTimeIndex] = useState(2);
  const [actorCategory, setActorCategory] = useState<string>(ACTOR_CATEGORIES[0].code);
  const [continent, setContinent] = useState<string>(CONTINENTS[0].code);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Artist[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const submission = useSubmission();
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (normalizedQuery.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError(false);
      return;
    }
    let active = true;
    const controller = new AbortController();
    setSearching(true);
    setSearchError(false);
    const timeout = setTimeout(() => {
      searchArtists(normalizedQuery, { signal: controller.signal })
        .then((found) => {
          if (active) {
            setResults(
              found.map((artist) => ({
                id: artist.id,
                name: artist.name,
                picture: artist.picture_small,
              })),
            );
          }
        })
        .catch((cause) => {
          if (!active || isAbortError(cause)) return;
          setResults([]);
          setSearchError(true);
        })
        .finally(() => active && setSearching(false));
    }, 300);
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [normalizedQuery]);

  const selectedIds = useMemo(() => new Set(artists.map((a) => a.id)), [artists]);
  const isFull = artists.length >= MAX_ARTISTS;
  const gridArtists: Artist[] =
    normalizedQuery.length >= 2
      ? results
      : POPULAR_ARTISTS.slice(0, 12).map((a) => ({
          id: a.id,
          name: a.name,
          picture: deezerImg(a.id),
        }));

  const toggleArtist = (artist: Artist) => {
    haptics.selection();
    setArtists((current) => {
      if (current.some((a) => a.id === artist.id)) return current.filter((a) => a.id !== artist.id);
      return current.length < MAX_ARTISTS ? [...current, artist] : current;
    });
  };

  const submit = async () => {
    if (mode === "music" && artists.length === 0) {
      toast.error("Pick at least one artist");
      haptics.error();
      return;
    }
    const controller = submission.start();
    if (!controller) return;
    try {
      const roomCode = await createRoom(
        {
          mode,
          maxPlayers,
          totalRounds: ROUND_OPTIONS[roundIndex],
          roundDuration: TIME_OPTIONS[timeIndex],
          artist: mode === "music" ? artists.map((a) => a.id).join(",") : undefined,
          actorCategory: mode === "actor" ? actorCategory : undefined,
          continent: mode === "flag" ? continent : undefined,
          hostName: displayName.trim(),
          hostAvatar: avatar,
        },
        { signal: controller.signal },
      );
      if (!submission.isCurrent(controller)) return;
      haptics.success();
      router.replace(`/room/${roomCode}`);
    } catch (cause) {
      if (isAbortError(cause) || !submission.isCurrent(controller)) return;
      toast.error(cause instanceof Error ? cause.message : "Something went wrong. Try again");
      haptics.error();
    } finally {
      submission.finish(controller);
    }
  };

  if (!ready) return null;
  if (!hasProfile) return <Redirect href="/" />;

  const modeMeta = MODES.find((m) => m.value === mode);

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={styles.screen}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {step === 1 ? (
        <Animated.View entering={FadeIn.duration(220)}>
          <View style={styles.modeList}>
            <Text style={styles.stepLabel}>choose a game</Text>
            {MODES.map(({ value, label, desc, Icon }) => {
              const selected = mode === value;
              return (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  haptic="selection"
                  key={value}
                  onPress={() => {
                    setMode(value);
                    setStep(2);
                  }}
                  scaleTo={0.99}
                  style={[styles.modeItem, selected && styles.modeItemActive]}
                >
                  <View style={[styles.modeIcon, selected && styles.modeIconActive]}>
                    <Icon color={selected ? "#0a0a0a" : "#b0b0b0"} size={20} />
                  </View>
                  <View style={styles.modeText}>
                    <Text style={styles.modeTitle}>{label}</Text>
                    <Text style={styles.modeDesc}>{desc}</Text>
                  </View>
                  <ChevronRight color="#8a8a8a" size={18} />
                </PressableScale>
              );
            })}
          </View>
        </Animated.View>
      ) : (
        <Animated.View entering={FadeIn.duration(220)}>
          <View style={styles.step2}>
            <PressableScale
              accessibilityRole="button"
              haptic="selection"
              hitSlop={8}
              onPress={() => setStep(1)}
              scaleTo={0.97}
              style={styles.backRow}
            >
              <ChevronLeft color="#c8f135" size={18} />
              <Text style={styles.backText}>{modeMeta?.label}</Text>
            </PressableScale>

            {mode === "music" ? (
              <View style={styles.group}>
                <View style={styles.groupHeadRow}>
                  <Text style={styles.stepLabel}>artists</Text>
                  <Text style={styles.count}>
                    {artists.length}/{MAX_ARTISTS}
                  </Text>
                </View>

                {artists.length > 0 ? (
                  <View style={styles.chips}>
                    {artists.map((a) => (
                      <View key={a.id} style={styles.chip}>
                        <Image source={a.picture ?? deezerImg(a.id)} style={styles.chipImg} />
                        <Text style={styles.chipText}>{a.name}</Text>
                        <PressableScale
                          accessibilityLabel={`remove ${a.name}`}
                          accessibilityRole="button"
                          haptic="selection"
                          hitSlop={6}
                          onPress={() => toggleArtist(a)}
                          style={styles.chipRemove}
                        >
                          <X color="#b0b0b0" size={13} />
                        </PressableScale>
                      </View>
                    ))}
                  </View>
                ) : null}

                <View style={styles.searchField}>
                  <Search color="#8a8a8a" size={16} />
                  <TextInputField query={query} onChange={setQuery} />
                  {query.length > 0 ? (
                    <PressableScale
                      accessibilityLabel="clear search"
                      accessibilityRole="button"
                      haptic="selection"
                      hitSlop={6}
                      onPress={() => setQuery("")}
                    >
                      <X color="#b0b0b0" size={16} />
                    </PressableScale>
                  ) : null}
                </View>

                {searching ? (
                  <Text style={styles.searchStatus}>Searching…</Text>
                ) : searchError ? (
                  <Text accessibilityRole="alert" style={styles.searchError}>
                    Could not search. Check your connection and try again.
                  </Text>
                ) : normalizedQuery.length >= 2 && results.length === 0 ? (
                  <Text style={styles.searchStatus}>No artists found</Text>
                ) : (
                  <View style={styles.artistGrid}>
                    {gridArtists.map((artist) => {
                      const selected = selectedIds.has(artist.id);
                      const image = artist.picture ?? deezerImg(artist.id);
                      return (
                        <PressableScale
                          accessibilityLabel={`${selected ? "remove" : "add"} ${artist.name}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected, disabled: isFull && !selected }}
                          disabled={isFull && !selected}
                          haptic={undefined}
                          key={artist.id}
                          onPress={() => toggleArtist(artist)}
                          scaleTo={0.94}
                          style={[
                            styles.artistTile,
                            selected && styles.artistTileSelected,
                            isFull && !selected && styles.artistTileDisabled,
                          ]}
                        >
                          <Image source={image} style={styles.artistImg} />
                          <Text numberOfLines={2} style={styles.artistName}>
                            {artist.name}
                          </Text>
                          {selected ? (
                            <View style={styles.artistCheck}>
                              <Check color="#0a0a0a" size={11} strokeWidth={3} />
                            </View>
                          ) : null}
                        </PressableScale>
                      );
                    })}
                  </View>
                )}
              </View>
            ) : null}

            {mode === "actor" ? (
              <ChoiceGroup
                label="industry"
                onChange={setActorCategory}
                options={ACTOR_CATEGORIES}
                value={actorCategory}
              />
            ) : null}

            {mode === "flag" ? (
              <ChoiceGroup
                label="continent"
                onChange={setContinent}
                options={CONTINENTS}
                value={continent}
              />
            ) : null}

            {mode === "place" ? (
              <View style={styles.note}>
                <Info color="#c8f135" size={16} />
                <Text style={styles.noteText}>Logos are picked for you. Set the match below.</Text>
              </View>
            ) : null}

            <View style={styles.group}>
              <Text style={styles.stepLabel}>match settings</Text>
              <View style={styles.setList}>
                <SettingRow
                  hint="in the room"
                  label="players"
                  onDecrease={() => setMaxPlayers((v) => Math.max(2, v - 1))}
                  onIncrease={() => setMaxPlayers((v) => Math.min(20, v + 1))}
                  canDecrease={maxPlayers > 2}
                  canIncrease={maxPlayers < 20}
                  value={String(maxPlayers)}
                />
                <SettingRow
                  hint="per game"
                  label="rounds"
                  onDecrease={() => setRoundIndex((v) => Math.max(0, v - 1))}
                  onIncrease={() => setRoundIndex((v) => Math.min(ROUND_OPTIONS.length - 1, v + 1))}
                  canDecrease={roundIndex > 0}
                  canIncrease={roundIndex < ROUND_OPTIONS.length - 1}
                  value={String(ROUND_OPTIONS[roundIndex])}
                />
                <SettingRow
                  hint="to answer"
                  label="time"
                  onDecrease={() => setTimeIndex((v) => Math.max(0, v - 1))}
                  onIncrease={() => setTimeIndex((v) => Math.min(TIME_OPTIONS.length - 1, v + 1))}
                  canDecrease={timeIndex > 0}
                  canIncrease={timeIndex < TIME_OPTIONS.length - 1}
                  value={`${TIME_OPTIONS[timeIndex] / 1_000}s`}
                />
              </View>
            </View>

            <Button loading={submission.loading} onPress={submit}>
              Let's go
            </Button>
          </View>
        </Animated.View>
      )}
    </ScrollView>
  );
}

function TextInputField({ query, onChange }: { query: string; onChange: (v: string) => void }) {
  return (
    <TextInput
      autoCapitalize="none"
      autoCorrect={false}
      onChangeText={onChange}
      placeholder="Search for an artist…"
      placeholderTextColor="#8a8a8a"
      returnKeyType="search"
      selectionColor="#c8f135"
      style={styles.searchInput}
      value={query}
    />
  );
}

function ChoiceGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { code: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.choices}>
        {options.map((option) => {
          const selected = value === option.code;
          return (
            <PressableScale
              accessibilityRole="button"
              accessibilityState={{ selected }}
              haptic="selection"
              key={option.code}
              onPress={() => onChange(option.code)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                {option.name}
              </Text>
            </PressableScale>
          );
        })}
      </View>
    </View>
  );
}

function SettingRow({
  label,
  hint,
  value,
  onDecrease,
  onIncrease,
  canDecrease,
  canIncrease,
}: {
  label: string;
  hint: string;
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
}) {
  return (
    <View style={styles.setRow}>
      <View style={styles.setText}>
        <Text style={styles.setLabel}>{label}</Text>
        <Text style={styles.setHint}>{hint}</Text>
      </View>
      <View style={styles.stepper}>
        <PressableScale
          accessibilityLabel={`fewer ${label}`}
          accessibilityRole="button"
          disabled={!canDecrease}
          haptic="selection"
          onPress={onDecrease}
          scaleTo={0.9}
          style={[styles.stepBtn, !canDecrease && styles.stepBtnDisabled]}
        >
          <Minus color="#f0f0f0" size={16} />
        </PressableScale>
        <Text style={styles.stepVal}>{value}</Text>
        <PressableScale
          accessibilityLabel={`more ${label}`}
          accessibilityRole="button"
          disabled={!canIncrease}
          haptic="selection"
          onPress={onIncrease}
          scaleTo={0.9}
          style={[styles.stepBtn, !canIncrease && styles.stepBtnDisabled]}
        >
          <Plus color="#f0f0f0" size={16} />
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    gap: theme.space[5],
    paddingHorizontal: theme.space[4],
    paddingTop: theme.space[6],
    paddingBottom: theme.space[10],
    backgroundColor: theme.colors.bg,
  },
  stepLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  modeList: {
    gap: theme.space[2],
  },
  modeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[3],
    padding: theme.space[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  modeItemActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  modeIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  modeIconActive: {
    backgroundColor: theme.colors.accent,
  },
  modeText: {
    flex: 1,
    gap: 2,
  },
  modeTitle: {
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.body,
  },
  modeDesc: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
  },
  step2: {
    gap: theme.space[5],
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[1],
    alignSelf: "flex-start",
  },
  backText: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
  },
  group: {
    gap: theme.space[3],
  },
  groupHeadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  count: {
    color: theme.colors.accent,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.space[2],
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
    paddingLeft: theme.space[1],
    paddingRight: theme.space[2],
    paddingVertical: theme.space[1],
    borderWidth: 1,
    borderColor: theme.colors.accent,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
  },
  chipImg: {
    width: 22,
    height: 22,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.border,
  },
  chipText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.bodySm,
  },
  chipRemove: {
    padding: 2,
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
    paddingHorizontal: theme.space[3],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  searchInput: {
    flex: 1,
    minHeight: 46,
    color: theme.colors.text,
    fontSize: theme.fontSize.body,
  },
  searchStatus: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    paddingVertical: theme.space[2],
  },
  searchError: {
    color: theme.colors.danger,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    paddingVertical: theme.space[2],
  },
  artistGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.space[2],
  },
  artistTile: {
    width: "31%",
    alignItems: "center",
    gap: theme.space[2],
    paddingVertical: theme.space[3],
    paddingHorizontal: theme.space[1],
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface2,
  },
  artistTileSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  artistTileDisabled: {
    opacity: 0.35,
  },
  artistImg: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface,
  },
  artistName: {
    color: theme.colors.text,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
    lineHeight: 14,
    textAlign: "center",
  },
  artistCheck: {
    position: "absolute",
    top: theme.space[1],
    right: theme.space[1],
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accent,
  },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
  },
  noteText: {
    flex: 1,
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
  },
  choices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.space[2],
  },
  choice: {
    paddingHorizontal: theme.space[3],
    paddingVertical: theme.space[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.surface2,
  },
  choiceSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accentSoft,
  },
  choiceText: {
    color: theme.colors.text,
    fontSize: theme.fontSize.bodySm,
  },
  choiceTextSelected: {
    color: theme.colors.accent,
  },
  setList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
  setRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.space[4],
    paddingVertical: theme.space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  setText: {
    gap: 2,
  },
  setLabel: {
    color: theme.colors.muted,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.label,
    letterSpacing: theme.tracking.label,
    textTransform: "uppercase",
  },
  setHint: {
    color: theme.colors.muted2,
    fontFamily: theme.fonts.mono,
    fontSize: theme.fontSize.labelSm,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space[2],
  },
  stepBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  stepBtnDisabled: {
    opacity: 0.35,
  },
  stepVal: {
    minWidth: 28,
    color: theme.colors.text,
    fontFamily: theme.fonts.display,
    fontSize: theme.fontSize.title,
    fontVariant: ["tabular-nums"],
    textAlign: "center",
  },
}));
