import { isRoomCode } from "@guessx/game";

const TOKEN_ISSUER = "guessx";
const SESSION_AUDIENCE = "guessx-api";
const SOCKET_AUDIENCE = "guessx-room-socket";
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SOCKET_TICKET_TTL_SECONDS = 60;
const MAX_TOKEN_LENGTH = 4_096;

type TokenPurpose = "session" | "socket";

type TokenClaims = {
  iss: typeof TOKEN_ISSUER;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  purpose: TokenPurpose;
  room?: string;
};

type Session = {
  token: string;
  expiresAt: number;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeBase64Url(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;

  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    const decoded = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return encodeBase64Url(decoded) === value ? decoded : null;
  } catch {
    return null;
  }
}

function parseJson(value: Uint8Array): unknown {
  try {
    return JSON.parse(decoder.decode(value));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("AUTH_SIGNING_SECRET is not configured");
  if (secret.length < 32) throw new Error("AUTH_SIGNING_SECRET must be at least 32 characters");
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signToken(claims: TokenClaims, secret: string): Promise<string> {
  const header = encodeBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = encodeBase64Url(encoder.encode(JSON.stringify(claims)));
  const unsignedToken = `${header}.${payload}`;
  const key = await importSigningKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(unsignedToken));
  return `${unsignedToken}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyToken(
  token: string,
  secret: string,
  purpose: TokenPurpose,
): Promise<TokenClaims | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const headerBytes = decodeBase64Url(encodedHeader);
  const payloadBytes = decodeBase64Url(encodedPayload);
  const signature = decodeBase64Url(encodedSignature);
  if (!headerBytes || !payloadBytes || !signature) return null;

  const header = parseJson(headerBytes);
  if (!isRecord(header) || header.alg !== "HS256" || header.typ !== "JWT") return null;

  const key = await importSigningKey(secret);
  const validSignature = await crypto.subtle.verify(
    "HMAC",
    key,
    signature,
    encoder.encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!validSignature) return null;

  const claims = parseJson(payloadBytes);
  if (!isRecord(claims)) return null;

  const audience = purpose === "session" ? SESSION_AUDIENCE : SOCKET_AUDIENCE;
  const now = Math.floor(Date.now() / 1_000);
  if (claims.iss !== TOKEN_ISSUER || claims.aud !== audience || claims.purpose !== purpose) {
    return null;
  }
  if (typeof claims.sub !== "string" || claims.sub.length < 1 || claims.sub.length > 100)
    return null;
  if (!Number.isInteger(claims.iat) || Number(claims.iat) > now + 60) return null;
  if (!Number.isInteger(claims.exp) || Number(claims.exp) <= now) return null;
  if (purpose === "socket" && !isRoomCode(claims.room)) return null;

  return claims as TokenClaims;
}

/** Creates a server-owned anonymous identity that clients cannot alter or forge. */
export async function issueSession(secret: string): Promise<Session> {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + SESSION_TTL_SECONDS;
  const token = await signToken(
    {
      iss: TOKEN_ISSUER,
      aud: SESSION_AUDIENCE,
      sub: crypto.randomUUID(),
      iat: issuedAt,
      exp: expiresAt,
      purpose: "session",
    },
    secret,
  );
  return { token, expiresAt };
}

/** Returns the authenticated user ID from a valid API session token. */
export async function verifySession(token: string, secret: string): Promise<string | null> {
  const claims = await verifyToken(token, secret, "session");
  return claims?.sub ?? null;
}

/** Issues a short-lived capability for one user to connect to one room. */
export async function issueSocketTicket(
  userId: string,
  roomCode: string,
  secret: string,
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1_000);
  return signToken(
    {
      iss: TOKEN_ISSUER,
      aud: SOCKET_AUDIENCE,
      sub: userId,
      iat: issuedAt,
      exp: issuedAt + SOCKET_TICKET_TTL_SECONDS,
      purpose: "socket",
      room: roomCode,
    },
    secret,
  );
}

/** Verifies that a socket capability belongs to the requested room. */
export async function verifySocketTicket(
  ticket: string,
  roomCode: string,
  secret: string,
): Promise<string | null> {
  const claims = await verifyToken(ticket, secret, "socket");
  return claims?.room === roomCode ? claims.sub : null;
}
