"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Check,
  Search,
  X,
  Headphones,
  Shapes,
  Clapperboard,
  Flag,
  ChevronRight,
  Minus,
  Plus,
  Info,
} from "lucide-react";
import { useMutation } from "convex/react";
import { useDebouncedValue } from "@mantine/hooks";

import { api } from "@convex/_generated/api";

import { useSession } from "@/lib/session";
import { CONTINENTS } from "@/lib/continents";
import { POPULAR_ARTISTS } from "@/lib/artists";
import { ACTOR_CATEGORIES } from "@/lib/actor-categories";
import { searchArtists } from "@/lib/actions";
import { ProfileSetup } from "@/components/profile-setup";
import { ModalDialog } from "@/components/modal-dialog";

import styles from "./page.module.css";

type Modal = "create" | "join" | null;

const ROOM_CODE_RE = /\/room\/([A-Z]{2}-\d{4})/i;

const MODES = [
  {
    value: "music",
    label: "guess the song",
    desc: "name tracks from artists you pick",
    Icon: Headphones,
  },
  {
    value: "place",
    label: "guess the logo",
    desc: "identify brands from their logo",
    Icon: Shapes,
  },
  { value: "actor", label: "guess the actor", desc: "name the face on screen", Icon: Clapperboard },
  { value: "flag", label: "name the flag", desc: "match the flag to its country", Icon: Flag },
] as const;

const deezerImg = (id: number) => `https://api.deezer.com/artist/${id}/image?size=small`;

const ROUND_OPTIONS = [3, 5, 7, 10] as const;

const TIME_OPTIONS = [
  { value: 10_000, label: "10s" },
  { value: 15_000, label: "15s" },
  { value: 20_000, label: "20s" },
  { value: 30_000, label: "30s" },
] as const;

export default function Home() {
  const { sessionId, displayName, avatar, setDisplayName, setAvatar, hasProfile, ready } =
    useSession();
  const [modal, setModal] = useState<Modal>(null);

  if (!ready) return null;

  return (
    <main className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.logo}>
          guess<span className={styles.logoX}>X</span>
        </h1>
        <p className={styles.tagline}>
          challenge your friends in real-time.
          <br />
          guess songs, logos, actors, or flags. fastest finger wins.
        </p>

        {hasProfile && (
          <div className={styles.actions}>
            <button className={styles.btnPrimary} onClick={() => setModal("create")}>
              create room
            </button>
            <button className={styles.btnSecondary} onClick={() => setModal("join")}>
              join room
            </button>
          </div>
        )}
      </div>

      {!hasProfile && (
        <div className={styles.profilePrompt}>
          <ProfileSetup
            displayName={displayName}
            avatar={avatar}
            onSave={(name, av) => {
              setDisplayName(name);
              setAvatar(av);
            }}
            onAvatarChange={setAvatar}
          />
        </div>
      )}

      {modal === "create" && (
        <CreateRoomModal
          sessionId={sessionId}
          displayName={displayName}
          avatar={avatar}
          hasProfile={hasProfile}
          onClose={() => setModal(null)}
        />
      )}

      {modal === "join" && (
        <JoinRoomModal
          sessionId={sessionId}
          displayName={displayName}
          avatar={avatar}
          hasProfile={hasProfile}
          onClose={() => setModal(null)}
        />
      )}
    </main>
  );
}

function CreateRoomModal({
  sessionId,
  displayName,
  avatar,
  hasProfile,
  onClose,
}: {
  sessionId: string;
  displayName: string;
  avatar: string;
  hasProfile: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const createRoom = useMutation(api.rooms.create);

  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<"music" | "place" | "actor" | "flag">("music");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [totalRounds, setTotalRounds] = useState(5);
  const [roundDuration, setRoundDuration] = useState(20_000);
  const [actorCategory, setActorCategory] = useState(ACTOR_CATEGORIES[0].code);
  const [continent, setContinent] = useState(CONTINENTS[0].code);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedArtists, setSelectedArtists] = useState<{ id: number; name: string }[]>([]);
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<
    { id: number; name: string; picture_small: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [debouncedQuery] = useDebouncedValue(artistQuery, 300);

  const MAX_ARTISTS = 3;
  const isFull = selectedArtists.length >= MAX_ARTISTS;
  const selectedIds = new Set(selectedArtists.map((a) => a.id));

  const roundIndex = ROUND_OPTIONS.findIndex((n) => n === totalRounds);
  const timeIndex = TIME_OPTIONS.findIndex((t) => t.value === roundDuration);

  // grid shows search results while searching, otherwise the popular set
  const gridArtists = artistQuery.trim()
    ? artistResults.map((a) => ({ id: a.id, name: a.name, picture: a.picture_small }))
    : POPULAR_ARTISTS.map((a) => ({ id: a.id, name: a.name, picture: deezerImg(a.id) }));

  const toggleArtist = (artist: { id: number; name: string }) => {
    if (selectedIds.has(artist.id)) {
      setSelectedArtists((prev) => prev.filter((a) => a.id !== artist.id));
    } else if (!isFull) {
      setSelectedArtists((prev) => [...prev, artist]);
    }
  };

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setArtistResults([]);
      return;
    }

    let cancelled = false;
    setSearching(true);

    searchArtists(debouncedQuery)
      .then((results) => {
        if (!cancelled) setArtistResults(results);
      })
      .catch(() => {
        if (!cancelled) setArtistResults([]);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  const handleSubmit = async () => {
    if (mode === "music" && selectedArtists.length === 0) {
      setError("pick at least one artist");
      return;
    }

    if (mode === "actor" && !actorCategory) {
      setError("pick an industry");
      return;
    }

    if (mode === "flag" && !continent) {
      setError("pick a continent");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await createRoom({
        hostId: sessionId,
        mode,
        maxPlayers: Math.min(20, Math.max(2, maxPlayers)),
        totalRounds,
        roundDuration,
        artist: mode === "music" ? selectedArtists.map((a) => a.id).join(",") : undefined,
        actorCategory: mode === "actor" ? actorCategory : undefined,
        continent: mode === "flag" ? continent : undefined,
        hostName: displayName,
        hostAvatar: avatar,
      });

      router.push(`/room/${result.roomCode}`);
    } catch {
      setError("something went wrong. try again.");
      setLoading(false);
    }
  };

  return (
    <ModalDialog
      title={
        step === 1 ? "create room" : (MODES.find((m) => m.value === mode)?.label ?? "create room")
      }
      onClose={onClose}
      onBack={step === 2 ? () => setStep(1) : undefined}
    >
      {step === 1 && (
        <div className={styles.modeList} role="group" aria-label="game mode">
          {MODES.map(({ value, label, desc, Icon }) => (
            <button
              key={value}
              className={`${styles.modeItem} ${mode === value ? styles.modeItemActive : ""}`}
              onClick={() => {
                setMode(value);
                setError("");
                setStep(2);
              }}
              type="button"
            >
              <span className={styles.modeIco}>
                <Icon size={22} />
              </span>
              <span className={styles.modeTxt}>
                <span className={styles.modeT}>{label}</span>
                <span className={styles.modeD}>{desc}</span>
              </span>
              {mode === value ? (
                <Check size={18} className={styles.modeChk} />
              ) : (
                <ChevronRight size={18} className={styles.modeArrow} />
              )}
            </button>
          ))}
        </div>
      )}

      {step === 2 && (
        <>
          {mode === "music" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                artists{" "}
                <span className={styles.formLabelCount}>
                  ({selectedArtists.length}/{MAX_ARTISTS})
                </span>
              </label>

              {selectedArtists.length > 0 && (
                <div className={styles.artistChips}>
                  {selectedArtists.map((a) => (
                    <div key={a.id} className={styles.artistChip}>
                      <Image
                        src={deezerImg(a.id)}
                        alt={a.name}
                        className={styles.artistChipImg}
                        width={22}
                        height={22}
                      />
                      <span>{a.name}</span>
                      <button
                        className={styles.artistChipRemove}
                        onClick={() => toggleArtist(a)}
                        type="button"
                        aria-label={`remove ${a.name}`}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className={styles.pickerPanel}>
                <div className={styles.searchField}>
                  <Search size={16} className={styles.searchFieldIcon} />
                  <input
                    className={styles.artistSearch}
                    aria-label="search artists"
                    placeholder="search for an artist..."
                    value={artistQuery}
                    onChange={(e) => setArtistQuery(e.target.value)}
                  />
                  {artistQuery && (
                    <button
                      className={styles.searchClear}
                      onClick={() => {
                        setArtistQuery("");
                        setArtistResults([]);
                      }}
                      type="button"
                      aria-label="clear search"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {searching && (
                  <div className={styles.searchStatus} role="status">
                    searching...
                  </div>
                )}

                {!searching && artistQuery.trim() && artistResults.length === 0 && (
                  <div className={styles.searchStatus} role="status">
                    no artists found
                  </div>
                )}

                {gridArtists.length > 0 && (
                  <div className={styles.artistGrid}>
                    {gridArtists.map((a) => {
                      const isSelected = selectedIds.has(a.id);
                      return (
                        <button
                          key={a.id}
                          className={`${styles.artistGridItem} ${isSelected ? styles.artistGridItemSelected : ""}`}
                          onClick={() => toggleArtist({ id: a.id, name: a.name })}
                          disabled={isFull && !isSelected}
                          type="button"
                          aria-pressed={isSelected}
                        >
                          <Image
                            src={a.picture}
                            alt={a.name}
                            className={styles.artistImg}
                            width={44}
                            height={44}
                          />
                          <span className={styles.artistName}>{a.name}</span>
                          {isSelected && (
                            <span className={styles.gridCheck} aria-hidden>
                              <Check size={12} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "actor" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="industry">
                industry
              </label>
              <select
                id="industry"
                className={styles.formSelect}
                value={actorCategory}
                onChange={(e) => setActorCategory(e.target.value)}
              >
                {ACTOR_CATEGORIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "flag" && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="continent">
                continent
              </label>
              <select
                id="continent"
                className={styles.formSelect}
                value={continent}
                onChange={(e) => setContinent(e.target.value)}
              >
                {CONTINENTS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {mode === "place" && (
            <div className={styles.modeNote}>
              <Info size={16} className={styles.modeNoteIcon} />
              <span>logos are picked for you. set the match below.</span>
            </div>
          )}

          <div className={styles.formGroup}>
            <div className={styles.formLabel}>match settings</div>
            <div className={styles.setList}>
              <div className={styles.setRow}>
                <span className={styles.setRowText}>
                  <span className={styles.setRowLabel}>players</span>
                  <span className={styles.setRowHint}>in the room</span>
                </span>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => setMaxPlayers((p) => Math.max(2, p - 1))}
                    disabled={maxPlayers <= 2}
                    aria-label="fewer players"
                  >
                    <Minus size={16} />
                  </button>
                  <span className={styles.stepVal} aria-live="polite">
                    {maxPlayers}
                  </span>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => setMaxPlayers((p) => Math.min(20, p + 1))}
                    disabled={maxPlayers >= 20}
                    aria-label="more players"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className={styles.setRow}>
                <span className={styles.setRowText}>
                  <span className={styles.setRowLabel}>rounds</span>
                  <span className={styles.setRowHint}>per game</span>
                </span>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => setTotalRounds(ROUND_OPTIONS[roundIndex - 1])}
                    disabled={roundIndex <= 0}
                    aria-label="fewer rounds"
                  >
                    <Minus size={16} />
                  </button>
                  <span className={styles.stepVal} aria-live="polite">
                    {totalRounds}
                  </span>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => setTotalRounds(ROUND_OPTIONS[roundIndex + 1])}
                    disabled={roundIndex >= ROUND_OPTIONS.length - 1}
                    aria-label="more rounds"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div className={styles.setRow}>
                <span className={styles.setRowText}>
                  <span className={styles.setRowLabel}>time</span>
                  <span className={styles.setRowHint}>to answer</span>
                </span>
                <div className={styles.stepper}>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => setRoundDuration(TIME_OPTIONS[timeIndex - 1].value)}
                    disabled={timeIndex <= 0}
                    aria-label="less time"
                  >
                    <Minus size={16} />
                  </button>
                  <span className={styles.stepVal} aria-live="polite">
                    {TIME_OPTIONS[timeIndex]?.label ?? "20s"}
                  </span>
                  <button
                    type="button"
                    className={styles.stepBtn}
                    onClick={() => setRoundDuration(TIME_OPTIONS[timeIndex + 1].value)}
                    disabled={timeIndex >= TIME_OPTIONS.length - 1}
                    aria-label="more time"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <button
            className={styles.submitBtn}
            onClick={handleSubmit}
            disabled={loading || !hasProfile}
          >
            {loading ? "setting up..." : "let's go"}
          </button>

          {error && (
            <div className={styles.errorMsg} role="alert">
              {error}
            </div>
          )}
        </>
      )}
    </ModalDialog>
  );
}

function JoinRoomModal({
  sessionId,
  displayName,
  avatar,
  hasProfile,
  onClose,
}: {
  sessionId: string;
  displayName: string;
  avatar: string;
  hasProfile: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const joinRoom = useMutation(api.rooms.join);

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!hasProfile) {
      setError("set up your profile first");
      return;
    }

    const cleaned = code.trim().toUpperCase();
    if (cleaned.length < 6) {
      setError("enter a valid room code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const result = await joinRoom({
        roomCode: cleaned,
        userId: sessionId,
        displayName,
        avatar,
      });

      if (result && "error" in result) {
        setError(result.error as string);
        setLoading(false);
        return;
      }

      if (result && "roomCode" in result) {
        router.push(`/room/${result.roomCode}`);
      }
    } catch {
      setError("something went wrong. try again.");
      setLoading(false);
    }
  };

  return (
    <ModalDialog title="join room" onClose={onClose}>
      <div className={styles.formGroup}>
        <label className={styles.formLabel} htmlFor="room-code">
          room code
        </label>
        <input
          className={styles.joinInput}
          id="room-code"
          placeholder="AB-1234"
          value={code}
          onChange={(e) => {
            const val = e.target.value;
            try {
              const url = new URL(val);
              if (url.origin === window.location.origin) {
                const match = url.pathname.match(ROOM_CODE_RE);
                if (match) {
                  setCode(match[1].toUpperCase());
                  return;
                }
              }
            } catch {
              // not a url, treat as raw code
            }
            setCode(val);
          }}
          autoFocus
        />
        <p className={styles.joinHint}>enter the room code or paste an invite link</p>
      </div>

      <button
        className={styles.submitBtn}
        onClick={handleSubmit}
        disabled={loading || !hasProfile || code.trim().length < 6}
      >
        {loading ? "joining..." : "join game"}
      </button>

      {error && (
        <div className={styles.errorMsg} role="alert">
          {error}
        </div>
      )}
    </ModalDialog>
  );
}
