"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { useSession } from "@/lib/session";
import { ProfileSetup } from "@/components/profile-setup";
import { POPULAR_ARTISTS } from "@/lib/artists";
import { searchArtists } from "@/lib/actions";
import { COUNTRIES } from "@/lib/countries";
import styles from "./page.module.css";

type Modal = "create" | "join" | null;

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
          guess the song or spot the landmark. fastest finger wins.
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

  const [mode, setMode] = useState<"music" | "place">("music");
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [totalRounds, setTotalRounds] = useState(5);
  const [roundDuration, setRoundDuration] = useState(20_000);
  const [country, setCountry] = useState(COUNTRIES[0].code);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [selectedArtist, setSelectedArtist] = useState<{ id: number; name: string } | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [artistQuery, setArtistQuery] = useState("");
  const [artistResults, setArtistResults] = useState<
    { id: number; name: string; picture_small: string }[]
  >([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        setArtistResults(await searchArtists(artistQuery));
      } catch {
        setArtistResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [artistQuery]);

  const handleSubmit = async () => {
    if (mode === "music" && !selectedArtist) {
      setError("pick an artist first");
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
        artist: mode === "music" ? selectedArtist!.id.toString() : undefined,
        country: mode === "place" ? country : undefined,
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
          </div>
        </div>

        {mode === "music" && (
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>artist</label>

            {selectedArtist ? (
              <div className={styles.artistChip}>
                <Image
                  src={`https://api.deezer.com/artist/${selectedArtist.id}/image?size=small`}
                  alt={selectedArtist.name}
                  className={styles.artistChipImg}
                  width={28}
                  height={28}
                  unoptimized
                />
                <span>{selectedArtist.name}</span>
                <button
                  className={styles.artistChipRemove}
                  onClick={() => setSelectedArtist(null)}
                  type="button"
                >
                  <X size={14} />
                </button>
              </div>
            ) : showSearch ? (
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

                {searching && (
                  <div className={styles.searchStatus}>searching...</div>
                )}

                {!searching && artistQuery.trim() && artistResults.length === 0 && (
                  <div className={styles.searchStatus}>no artists found</div>
                )}

                {artistResults.length > 0 && (
                  <div className={styles.searchResults}>
                    {artistResults.map((a) => (
                      <button
                        key={a.id}
                        className={styles.searchResultItem}
                        onClick={() => {
                          setSelectedArtist({ id: a.id, name: a.name });
                          setShowSearch(false);
                          setArtistQuery("");
                          setArtistResults([]);
                        }}
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
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className={styles.artistGrid}>
                  {POPULAR_ARTISTS.map((a) => (
                    <button
                      key={a.id}
                      className={styles.artistGridItem}
                      onClick={() => setSelectedArtist(a)}
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
                  ))}
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
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
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
                  const match = url.pathname.match(/\/room\/([A-Z]{2}-\d{4})/i);
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
