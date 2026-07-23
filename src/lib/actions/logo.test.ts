import { describe, expect, it } from "vitest";

import { prepareLogoContent } from "./logo";

describe("prepareLogoContent", () => {
  it("builds complete local logo rounds", async () => {
    const rounds = await prepareLogoContent(10);

    expect(rounds).toHaveLength(10);
    expect(new Set(rounds.map((round) => round.correctAnswer)).size).toBe(10);

    for (const [index, round] of rounds.entries()) {
      expect(round.roundNumber).toBe(index + 1);
      expect(round.options).toHaveLength(4);
      expect(new Set(round.options).size).toBe(4);
      expect(round.options).toContain(round.correctAnswer);
      expect(round.mediaUrl).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg%20/);
      expect(decodeURIComponent(round.mediaUrl)).not.toContain("<title>");
      expect(round.isFinal).toBe(index === 9);
    }
  });
});
