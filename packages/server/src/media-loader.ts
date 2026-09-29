import { useCallback, useEffect, useState } from "react";
import { decodeMediaKey, unpackMediaFrame, type MediaFrame, type RoundMedia } from "@guessx/game";

type MediaLoaderOptions = {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  decrypt: (
    blob: Uint8Array<ArrayBuffer>,
    key: Uint8Array<ArrayBuffer>,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  materialize: (frame: MediaFrame, path: string) => Promise<string>;
  release: (source: string) => void;
};

export type MediaLoader = ReturnType<typeof createMediaLoader>;

const RETRY_DELAYS_MS = [1_000, 3_000, 6_000];

export function createMediaLoader({
  baseUrl,
  fetch,
  decrypt,
  materialize,
  release,
}: MediaLoaderOptions) {
  const downloads = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
  const sources = new Map<string, Promise<string>>();
  let queue: string[] = [];
  let pumping = false;

  const fetchBlob = async (path: string): Promise<Uint8Array<ArrayBuffer>> => {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`${baseUrl}${path}`).catch(() => null);
      if (response?.ok) return new Uint8Array(await response.arrayBuffer());
      if (response?.status === 404 || attempt >= RETRY_DELAYS_MS.length) {
        throw new Error("media is unavailable");
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  };

  const download = (path: string): Promise<Uint8Array<ArrayBuffer>> => {
    const existing = downloads.get(path);
    if (existing) return existing;
    const pending = fetchBlob(path).catch((error: unknown) => {
      if (downloads.get(path) === pending) downloads.delete(path);
      throw error;
    });
    downloads.set(path, pending);
    return pending;
  };

  const pump = async () => {
    if (pumping) return;
    pumping = true;
    while (queue.length > 0) {
      const path = queue.shift()!;
      await download(path).catch(() => {});
    }
    pumping = false;
  };

  return {
    prefetch(paths: readonly string[]) {
      const wanted = new Set(paths);
      for (const [path, source] of sources) {
        if (wanted.has(path)) continue;
        sources.delete(path);
        void source.then(release, () => {});
      }
      for (const path of downloads.keys()) {
        if (!wanted.has(path)) downloads.delete(path);
      }
      queue = paths.filter((path) => !downloads.has(path));
      void pump();
    },

    open(media: RoundMedia): Promise<string> {
      let source = sources.get(media.path);
      if (!source) {
        source = (async () => {
          const key = decodeMediaKey(media.key);
          if (!key) throw new Error("invalid media key");
          const frame = unpackMediaFrame(await decrypt(await download(media.path), key));
          if (!frame) throw new Error("invalid media");
          return materialize(frame, media.path);
        })();
        source.catch(() => sources.delete(media.path));
        sources.set(media.path, source);
      }
      return source;
    },
  };
}

export function useMediaPrefetch(loader: MediaLoader, paths: readonly string[] | undefined) {
  const key = paths?.join("|") ?? "";
  useEffect(() => {
    loader.prefetch(key ? key.split("|") : []);
  }, [loader, key]);
}

export function useRoundMedia(loader: MediaLoader, { path, key }: RoundMedia) {
  const [state, setState] = useState<{ path: string; source?: string; failed?: boolean }>({ path });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ path });
    loader.open({ path, key }).then(
      (source) => active && setState({ path, source }),
      () => active && setState({ path, failed: true }),
    );
    return () => {
      active = false;
    };
  }, [loader, path, key, attempt]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const current = state.path === path ? state : { path };
  return { source: current.source, failed: current.failed ?? false, retry };
}
