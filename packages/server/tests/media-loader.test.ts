import { describe, expect, it } from "vitest";
import { encodeBase64Url, packMediaFrame } from "@guessx/game";

import { createMediaLoader } from "../src/media-loader";

const KEY = encodeBase64Url(new Uint8Array(32));

function setup(responses: Record<string, () => Response>) {
  const requests: string[] = [];
  const released: string[] = [];
  const loader = createMediaLoader({
    baseUrl: "https://guessx.test",
    fetch: async (input) => {
      const url = String(input);
      requests.push(url);
      return responses[url]();
    },
    decrypt: async (blob) => blob,
    materialize: async (frame, path) => `${path}:${new TextDecoder().decode(frame.bytes)}`,
    release: (source) => released.push(source),
  });
  return { loader, requests, released };
}

function media(text: string) {
  return () =>
    new Response(
      packMediaFrame({
        contentType: "image/png",
        bytes: new Uint8Array(new TextEncoder().encode(text)),
      }),
    );
}

describe("createMediaLoader", () => {
  it("prefetches each file once and opens it without another download", async () => {
    const { loader, requests } = setup({
      "https://guessx.test/one": media("first"),
      "https://guessx.test/two": media("second"),
    });

    loader.prefetch(["/one", "/two"]);
    loader.prefetch(["/one", "/two"]);

    await expect(loader.open({ path: "/two", key: KEY })).resolves.toBe("/two:second");
    expect(requests).toEqual(["https://guessx.test/one", "https://guessx.test/two"]);
  });

  it("releases opened media once the room no longer lists it", async () => {
    const { loader, released } = setup({ "https://guessx.test/one": media("first") });

    await loader.open({ path: "/one", key: KEY });
    loader.prefetch([]);
    await new Promise((resolve) => setTimeout(resolve, 1));

    expect(released).toEqual(["/one:first"]);
  });

  it("rejects media that is not a valid frame", async () => {
    const { loader } = setup({ "https://guessx.test/bad": () => new Response("<html>") });
    await expect(loader.open({ path: "/bad", key: KEY })).rejects.toThrow("invalid media");
  });
});
