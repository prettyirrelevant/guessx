import {
  decodeMediaKey,
  MEDIA_IV_BYTES,
  MEDIA_MAX_BYTES,
  packMediaFrame,
  type MediaFrame,
} from "@guessx/game";

import { isAllowedMediaUrl } from "./room-state";
import { fetchJson, isRecord } from "./content/shared";

type MediaSource = {
  url: string;
  sourceId?: string;
  key: string;
};

async function download(url: string): Promise<MediaFrame> {
  if (!isAllowedMediaUrl(url)) throw new Error("media source is not allowed");
  if (url.startsWith("data:")) {
    const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1));
    return { contentType: "image/svg+xml", bytes: new Uint8Array(new TextEncoder().encode(svg)) };
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15_000),
    cf: { cacheEverything: true, cacheTtl: 86_400 },
  });
  if (!response.ok) throw new Error(`media request failed: ${response.status}`);
  const contentType = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
  if (!/^(image|audio)\/[\w.+-]+$/.test(contentType)) throw new Error("unexpected media type");
  if (Number(response.headers.get("content-length")) > MEDIA_MAX_BYTES) {
    throw new Error("media is too large");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MEDIA_MAX_BYTES) throw new Error("media is too large");
  return { contentType, bytes };
}

async function freshDeezerPreview(trackId: string): Promise<string> {
  const track = await fetchJson<unknown>(`https://api.deezer.com/track/${trackId}`, {
    timeoutMs: 8_000,
  });
  if (!isRecord(track) || typeof track.preview !== "string" || !track.preview) {
    throw new Error("track preview is unavailable");
  }
  return track.preview;
}

export async function sealMedia(source: MediaSource): Promise<Uint8Array<ArrayBuffer>> {
  const keyBytes = decodeMediaKey(source.key);
  if (!keyBytes) throw new Error("invalid media key");

  let frame: MediaFrame;
  try {
    frame = await download(source.url);
  } catch (error) {
    if (!source.sourceId) throw error;
    frame = await download(await freshDeezerPreview(source.sourceId));
  }

  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(MEDIA_IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, packMediaFrame(frame)),
  );
  const blob = new Uint8Array(iv.length + sealed.length);
  blob.set(iv);
  blob.set(sealed, iv.length);
  return blob;
}
