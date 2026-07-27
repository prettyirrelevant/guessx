import { describe, expect, it } from "vitest";

import { isClientMessage, isRoomCode, isValidCreateRoomInput, isValidJoinRoomInput } from "../src";

describe("protocol validation", () => {
  it("accepts only canonical room codes", () => {
    expect(isRoomCode("AB-1234")).toBe(true);
    expect(isRoomCode("AI-1234")).toBe(false);
    expect(isRoomCode("AB1234")).toBe(false);
  });

  it("rejects client-controlled identity fields", () => {
    expect(
      isValidCreateRoomInput({
        hostName: "Host",
        hostAvatar: "avatar",
        hostId: "client-controlled",
        mode: "place",
        maxPlayers: 6,
        totalRounds: 5,
        roundDuration: 20_000,
      }),
    ).toBe(false);
    expect(
      isValidJoinRoomInput({
        roomCode: "AB-1234",
        userId: "client-controlled",
        displayName: "Guest",
        avatar: "avatar",
      }),
    ).toBe(false);
  });

  it("accepts commands and rejects the removed identify message", () => {
    expect(
      isClientMessage({
        type: "command",
        requestId: "request-id",
        command: "start",
      }),
    ).toBe(true);
    expect(isClientMessage({ type: "identify", userId: "forged" })).toBe(false);
  });
});
