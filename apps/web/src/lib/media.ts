"use client";

import { createMediaLoader, useMediaPrefetch, useRoundMedia } from "@guessx/server/media";
import { MEDIA_IV_BYTES } from "@guessx/game";

export const mediaLoader = createMediaLoader({
  baseUrl: "",
  fetch: (input, init) => globalThis.fetch(input, init),
  async decrypt(blob, keyBytes) {
    const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    const frame = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: blob.subarray(0, MEDIA_IV_BYTES) },
      key,
      blob.subarray(MEDIA_IV_BYTES),
    );
    return new Uint8Array(frame);
  },
  async materialize({ contentType, bytes }) {
    return URL.createObjectURL(new Blob([bytes], { type: contentType }));
  },
  release: (source) => URL.revokeObjectURL(source),
});

export { useMediaPrefetch, useRoundMedia };
