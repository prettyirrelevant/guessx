import { describe, expect, it } from "vitest";

import { normalizeRoomCode } from "../src/lib/room-code";
import { isAnswerLocked } from "../src/lib/game-state";
import { parseGameSession } from "../src/lib/game-session";

describe("mobile game flow helpers", () => {
  it("normalizes direct codes and invite links", () => {
    expect(normalizeRoomCode(" ab-1234 ")).toBe("AB-1234");
    expect(normalizeRoomCode("ab1234")).toBe("AB-1234");
    expect(normalizeRoomCode("ab 1234")).toBe("AB-1234");
    expect(normalizeRoomCode("ab—1234")).toBe("AB-1234");
    expect(normalizeRoomCode("https://guessx.enio.la/room/cd-5678?from=share")).toBe("CD-5678");
    expect(normalizeRoomCode("https://guessx.enio.la/room/cd5678")).toBe("CD-5678");
  });

  it("keeps a server-confirmed answer locked after remounting", () => {
    const answered = new Set(["current-player"]);
    expect(isAnswerLocked(null, answered, "current-player")).toBe(true);
    expect(isAnswerLocked(null, answered, "other-player")).toBe(false);
    expect(isAnswerLocked("Option A", new Set(), "current-player")).toBe(true);
  });

  it("accepts only complete stored sessions", () => {
    expect(parseGameSession('{"token":"token","expiresAt":123}')).toEqual({
      token: "token",
      expiresAt: 123,
    });
    expect(parseGameSession('{"token":"","expiresAt":123}')).toBeNull();
    expect(parseGameSession('{"token":"token","expiresAt":1.5}')).toBeNull();
    expect(parseGameSession("not-json")).toBeNull();
  });
});
