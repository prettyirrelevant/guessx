"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Search, X } from "lucide-react";
import { useMutation } from "convex/react";
import { useDebouncedValue } from "@mantine/hooks";

import { api } from "@convex/_generated/api";

import { useSession } from "@/lib/session";
import { COUNTRIES } from "@/lib/countries";
import { POPULAR_ARTISTS } from "@/lib/artists";
import { ACTOR_CATEGORIES } from "@/lib/actor-categories";
import { searchArtists } from "@/lib/actions";
import { ProfileSetup } from "@/components/profile-setup";

import styles from "./page.module.css";

type Modal = "create" | "join" | null;

const ROOM_CODE_RE = /\/room\/([A-Z]{2}-\d{4})/i;

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
          guess the song, spot the landmark, or name the actor. fastest finger wins.
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

  const [mode, setMode] = useState<"music" | "place" | "actor">("music");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [totalRounds, setTotalRounds] = useState(5);
  const [roundDuration, setRoundDuration] = useState(20_000);
  const [country, setCountry] = useState(() => {
    try {
      const locale = Intl.DateTimeFormat().resolvedOptions().locale;
      const region = locale.split("-").pop()?.toUpperCase();
      if (region && COUNTRIES.some((c) => c.code === region)) return region;
    } catch {}
    return COUNTRIES[0].code;
  });
  const [actorCategory, setActorCategory] = useState(ACTOR_CATEGORIES[0].code);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedArtists, setSelectedArtists] = useState<{ id: number; name: string }[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<
    { id: number; name: string; picture_small: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const [debouncedQuery] = useDebouncedValue(artistQuery, 300);

  const MAX_ARTISTS = 3;
  const isFull = selectedArtists.length >= MAX_ARTISTS;
  const selectedIds = new Set(selectedArtists.map((a) => a.id));

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

    setLoading(true);
    setError("");

    try {
      const result = await createRoom({
        hostId: sessionId,
        mode,
        maxPlayers,
        totalRounds,
        roundDuration,
        artist: mode === "music" ? selectedArtists.map((a) => a.id).join(",") : undefined,
        country: mode === "place" ? country : undefined,
        actorCategory: mode === "actor" ? actorCategory : undefined,
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
    <div className={styles.overlay} role="dialog" onClick={onClose}>
      <div className={styles.modal} role="presentation" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>create room</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>game mode</label>
          <div className={styles.modeToggle}>
            <button
              className={`${styles.modeBtn} ${mode === "music" ? styles.active : ""}`}
              onClick={() => setMode("music")}
              type="button"
            >
              <div className={styles.modeBtnIcon}>🎧</div>
              <div className={styles.modeBtnLabel}>guess the song</div>
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "place" ? styles.active : ""}`}
              onClick={() => setMode("place")}
              type="button"
            >
              <div className={styles.modeBtnIcon}>🌍</div>
              <div className={styles.modeBtnLabel}>spot the landmark</div>
            </button>
            <button
              className={`${styles.modeBtn} ${mode === "actor" ? styles.active : ""}`}
              onClick={() => setMode("actor")}
              type="button"
            >
              <div className={styles.modeBtnIcon}>🎬</div>
              <div className={styles.modeBtnLabel}>guess the actor</div>
            </button>
          </div>
        </div>

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
                      src={`https://api.deezer.com/artist/${a.id}/image?size=small`}
                      alt={a.name}
                      className={styles.artistChipImg}
                      width={22}
                      height={22}
                      unoptimized
                    />
                    <span>{a.name}</span>
                    <button
                      className={styles.artistChipRemove}
                      onClick={() => toggleArtist(a)}
                      type="button"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {showSearch ? (
              <div className={styles.artistSearchWrap}>
                <div className={styles.artistSearchRow}>
                  <input
                    className={styles.artistSearch}
                    placeholder="search for an artist..."
                    value={artistQuery}
                    onChange={(e) => setArtistQuery(e.target.value)}
                    autoFocus
                  />
                  <button
                    className={styles.searchClose}
                    onClick={() => {
                      setShowSearch(false);
                      setArtistQuery("");
                      setArtistResults([]);
                    }}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </div>

                {searching && <div className={styles.searchStatus}>searching...</div>}

                {!searching && artistQuery.trim() && artistResults.length === 0 && (
                  <div className={styles.searchStatus}>no artists found</div>
                )}

                {artistResults.length > 0 && (
                  <div className={styles.searchResults}>
                    {artistResults.map((a) => {
                      const isSelected = selectedIds.has(a.id);
                      return (
                        <button
                          key={a.id}
                          className={`${styles.searchResultItem} ${isSelected ? styles.searchResultSelected : ""}`}
                          onClick={() => toggleArtist({ id: a.id, name: a.name })}
                          disabled={isFull && !isSelected}
                          type="button"
                        >
                          <Image
                            src={a.picture_small}
                            alt={a.name}
                            className={styles.artistImg}
                            width={32}
                            height={32}
                            unoptimized
                          />
                          <span>{a.name}</span>
                          {isSelected && <Check size={14} className={styles.checkIcon} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className={styles.artistGrid}>
                  {POPULAR_ARTISTS.map((a) => {
                    const isSelected = selectedIds.has(a.id);
                    return (
                      <button
                        key={a.id}
                        className={`${styles.artistGridItem} ${isSelected ? styles.artistGridItemSelected : ""}`}
                        onClick={() => toggleArtist(a)}
                        disabled={isFull && !isSelected}
                        type="button"
                      >
                        <Image
                          src={`https://api.deezer.com/artist/${a.id}/image?size=small`}
                          alt={a.name}
                          className={styles.artistImg}
                          width={44}
                          height={44}
                          unoptimized
                        />
                        <span className={styles.artistName}>{a.name}</span>
                      </button>
                    );
                  })}
                </div>

                <button
                  className={styles.searchToggle}
                  onClick={() => setShowSearch(true)}
                  type="button"
                >
                  <Search size={14} />
                  <span>not here? search for more</span>
                </button>
              </>
            )}
          </div>
        )}

        {mode === "place" && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>country</label>
            <select
              className={styles.formSelect}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {mode === "actor" && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>industry</label>
            <select
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

        <div className={styles.formRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>players</label>
            <input
              className={styles.formInput}
              type="number"
              min={2}
              max={20}
              value={maxPlayers}
              onChange={(e) => {
                const v = Math.min(20, Math.max(2, Number(e.target.value) || 2));
                setMaxPlayers(v);
              }}
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>rounds</label>
            <select
              className={styles.formSelect}
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
            >
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>
                  {n} rounds
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>time per round</label>
          <select
            className={styles.formSelect}
            value={roundDuration}
            onChange={(e) => setRoundDuration(Number(e.target.value))}
          >
            <option value={10_000}>10 seconds</option>
            <option value={15_000}>15 seconds</option>
            <option value={20_000}>20 seconds</option>
            <option value={30_000}>30 seconds</option>
          </select>
        </div>

        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={loading || !hasProfile}
        >
          {loading ? "setting up..." : "let's go"}
        </button>

        {error && <div className={styles.errorMsg}>{error}</div>}
      </div>
    </div>
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
    <div className={styles.overlay} role="dialog" onClick={onClose}>
      <div className={styles.modal} role="presentation" onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>join room</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>room code</label>
          <input
            className={styles.joinInput}
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

        {error && <div className={styles.errorMsg}>{error}</div>}
      </div>
    </div>
  );
}
