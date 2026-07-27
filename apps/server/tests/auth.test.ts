import { describe, expect, it } from "vitest";

import { issueSession, issueSocketTicket, verifySession, verifySocketTicket } from "../src/auth";

const SECRET = "test-auth-signing-secret-at-least-32-characters";

describe("authentication tokens", () => {
  it("verifies issued sessions and rejects modified tokens", async () => {
    const session = await issueSession(SECRET);
    expect(await verifySession(session.token, SECRET)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    const tampered = `${session.token.slice(0, -1)}${session.token.endsWith("a") ? "b" : "a"}`;
    expect(await verifySession(tampered, SECRET)).toBeNull();
  });

  it("scopes socket tickets to one room and token purpose", async () => {
    const ticket = await issueSocketTicket("user-id", "AB-1234", SECRET);
    expect(await verifySocketTicket(ticket, "AB-1234", SECRET)).toBe("user-id");
    expect(await verifySocketTicket(ticket, "CD-5678", SECRET)).toBeNull();
    expect(await verifySession(ticket, SECRET)).toBeNull();
  });
});
