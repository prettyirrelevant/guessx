export const MEDIA_KEY_BYTES = 32;
export const MEDIA_IV_BYTES = 12;
const FRAME_VERSION = 1;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const BASE64URL_LOOKUP = new Map([...BASE64URL].map((character, index) => [character, index]));

export type MediaFrame = {
  contentType: string;
  bytes: Uint8Array<ArrayBuffer>;
};

export function encodeBase64Url(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const chunk = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    const remaining = bytes.length - index;
    output += BASE64URL[(chunk >> 18) & 63] + BASE64URL[(chunk >> 12) & 63];
    if (remaining > 1) output += BASE64URL[(chunk >> 6) & 63];
    if (remaining > 2) output += BASE64URL[chunk & 63];
  }
  return output;
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (value.length % 4 === 1) return null;
  const bytes = new Uint8Array(Math.floor((value.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let offset = 0;
  for (const character of value) {
    const index = BASE64URL_LOOKUP.get(character);
    if (index === undefined) return null;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[offset++] = (buffer >> bits) & 255;
    }
  }
  return bytes;
}

export function decodeMediaKey(value: string): Uint8Array<ArrayBuffer> | null {
  const bytes = decodeBase64Url(value);
  return bytes?.length === MEDIA_KEY_BYTES ? bytes : null;
}

export function packMediaFrame({ contentType, bytes }: MediaFrame): Uint8Array<ArrayBuffer> {
  if (!/^[\x21-\x7e]{1,255}$/.test(contentType)) throw new Error("invalid media content type");
  const frame = new Uint8Array(2 + contentType.length + bytes.length);
  frame[0] = FRAME_VERSION;
  frame[1] = contentType.length;
  for (let index = 0; index < contentType.length; index++) {
    frame[2 + index] = contentType.charCodeAt(index);
  }
  frame.set(bytes, 2 + contentType.length);
  return frame;
}

export function unpackMediaFrame(frame: Uint8Array<ArrayBuffer>): MediaFrame | null {
  if (frame.length < 2 || frame[0] !== FRAME_VERSION) return null;
  const typeLength = frame[1];
  if (typeLength < 1 || frame.length < 2 + typeLength) return null;
  const contentType = String.fromCharCode(...frame.subarray(2, 2 + typeLength));
  if (!/^(image|audio)\/[\w.+-]+$/.test(contentType)) return null;
  return { contentType, bytes: frame.subarray(2 + typeLength) };
}
