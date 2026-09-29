import { describe, expect, it } from "vitest";

import {
  decodeBase64Url,
  decodeMediaKey,
  encodeBase64Url,
  isValidProfile,
  packMediaFrame,
  unpackMediaFrame,
} from "../src";

describe("base64url", () => {
  it.each([
    ["", ""],
    ["f", "Zg"],
    ["fo", "Zm8"],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg"],
  ])("encodes %j as the RFC 4648 value", (text, expected) => {
    const bytes = new TextEncoder().encode(text);
    expect(encodeBase64Url(bytes)).toBe(expected);
    expect(decodeBase64Url(expected)).toEqual(bytes);
  });

  it("round-trips every byte value with the URL-safe alphabet", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, index) => index);
    const encoded = encodeBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64Url(encoded)).toEqual(bytes);
  });

  it("rejects characters outside the alphabet", () => {
    expect(decodeBase64Url("ab+c")).toBeNull();
    expect(decodeBase64Url("a")).toBeNull();
  });

  it("accepts only 32-byte media keys", () => {
    expect(decodeMediaKey(encodeBase64Url(new Uint8Array(32)))).toHaveLength(32);
    expect(decodeMediaKey(encodeBase64Url(new Uint8Array(16)))).toBeNull();
  });
});

describe("media frames", () => {
  it("carries the content type with the media bytes", () => {
    const bytes = Uint8Array.from([0, 1, 2, 255]);
    const frame = packMediaFrame({ contentType: "audio/mpeg", bytes });
    expect(unpackMediaFrame(frame)).toEqual({ contentType: "audio/mpeg", bytes });
  });

  it("rejects frames that do not describe image or audio media", () => {
    const frame = packMediaFrame({ contentType: "text/html", bytes: new Uint8Array(1) });
    expect(unpackMediaFrame(frame)).toBeNull();
    expect(unpackMediaFrame(Uint8Array.from([9, 1, 65]))).toBeNull();
    expect(unpackMediaFrame(Uint8Array.from([1, 40, 65]))).toBeNull();
  });
});

describe("profiles", () => {
  it("rejects blank names and invisible control characters", () => {
    expect(isValidProfile("Ada", "felix")).toBe(true);
    expect(isValidProfile("   ", "felix")).toBe(false);
    expect(isValidProfile("Ada\u202e", "felix")).toBe(false);
    expect(isValidProfile("Ada\n", "felix")).toBe(false);
    expect(isValidProfile("Ada\u200b", "felix")).toBe(false);
    expect(isValidProfile("👩‍💻 Ada", "felix")).toBe(true);
  });
});
