import { Directory, File, Paths } from "expo-file-system";
import { AESEncryptionKey, AESSealedData, aesDecryptAsync } from "expo-crypto";
import { createMediaLoader } from "@guessx/server/media";
import { MEDIA_IV_BYTES } from "@guessx/game";

import { API_URL } from "@/lib/config";

const EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

const directory = new Directory(Paths.cache, "round-media");
try {
  if (directory.exists) directory.delete();
} catch {}

export const mediaLoader = createMediaLoader({
  baseUrl: API_URL,
  fetch: globalThis.fetch,
  async decrypt(blob, keyBytes) {
    const key = await AESEncryptionKey.import(keyBytes);
    const sealed = AESSealedData.fromParts(
      blob.subarray(0, MEDIA_IV_BYTES),
      blob.subarray(MEDIA_IV_BYTES),
    );
    return new Uint8Array(await aesDecryptAsync(sealed, key));
  },
  async materialize({ contentType, bytes }) {
    if (!directory.exists) directory.create({ intermediates: true });
    const extension = EXTENSIONS[contentType] ?? "bin";
    const file = new File(
      directory,
      `${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`,
    );
    file.write(bytes);
    return file.uri;
  },
  release(source) {
    try {
      new File(source).delete();
    } catch {}
  },
});
