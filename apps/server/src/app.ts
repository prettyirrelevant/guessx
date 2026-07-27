import { getServerByName, routePartykitRequest } from "partyserver";
import { bodyLimit } from "hono/body-limit";
import { Hono, type Context, type Next } from "hono";
import {
  isRoomCode,
  isValidCreateRoomInput,
  isValidJoinRoomInput,
  type CreateRoomInput,
} from "@guessx/game";
import { isValidContentConfig, prepareContent } from "@guessx/content";

import { AUTHENTICATED_USER_HEADER, generateRoomCode, GuessRoom } from "./room";
import type { Env } from "./env";
import { issueSession, issueSocketTicket, verifySession, verifySocketTicket } from "./auth";

type HonoEnv = {
  Bindings: Env;
  Variables: {
    userId: string;
  };
};

const ROOM_INPUT_MAX_BYTES = 16 * 1024;
const BODY_TOO_LARGE_ERROR = { error: "request body is too large" } as const;

const app = new Hono<HonoEnv>();

function rejectOversizedBody(context: Context<HonoEnv>) {
  return context.json(BODY_TOO_LARGE_ERROR, 413);
}

const roomInputBodyLimit = bodyLimit({
  maxSize: ROOM_INPUT_MAX_BYTES,
  onError: rejectOversizedBody,
});

function bearerToken(request: Request): string {
  return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
}

function allowsOrigin(request: Request, allowedOrigins: string): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  return allowedOrigins
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .includes(origin);
}

async function requireSession(context: Context<HonoEnv>, next: Next) {
  const userId = await verifySession(bearerToken(context.req.raw), context.env.AUTH_SIGNING_SECRET);
  if (!userId) return context.json({ error: "unauthorized" }, 401);
  context.set("userId", userId);
  return next();
}

app.use("*", async (context, next) => {
  await next();
  context.header("Cache-Control", "no-store");
});

app.get("/health", (context) => context.json({ ok: true }));

app.post("/api/sessions", async (context) => {
  const session = await issueSession(context.env.AUTH_SIGNING_SECRET);
  return context.json(session, 201);
});

app.use("/api/rooms", requireSession);
app.use("/api/rooms/*", requireSession);

app.post("/api/rooms", roomInputBodyLimit, async (context) => {
  const input = await context.req.json<CreateRoomInput>();
  if (!isValidCreateRoomInput(input) || !isValidContentConfig(input)) {
    return context.json({ error: "invalid room settings" }, 400);
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = generateRoomCode();
    const stub = await getServerByName<Env, GuessRoom>(context.env.GUESS_ROOM, roomCode);
    const result = await stub.initialize(input, context.get("userId"));
    if (result.success) return context.json({ roomCode });
    if (result.error !== "room already exists") return context.json(result, 400);
  }
  return context.json({ error: "could not allocate a room code" }, 503);
});

app.post("/api/rooms/:roomCode/join", roomInputBodyLimit, async (context) => {
  const roomCode = context.req.param("roomCode");
  if (!isRoomCode(roomCode)) return context.json({ error: "invalid room code" }, 400);

  const body: unknown = await context.req.json();
  const input = { ...(typeof body === "object" && body ? body : {}), roomCode };
  if (!isValidJoinRoomInput(input)) {
    return context.json({ error: "invalid player profile" }, 400);
  }

  const stub = await getServerByName<Env, GuessRoom>(context.env.GUESS_ROOM, roomCode);
  const result = await stub.join(context.get("userId"), input);
  return context.json(result, result.error ? 400 : 200);
});

app.post("/api/rooms/:roomCode/preparation", async (context) => {
  const roomCode = context.req.param("roomCode");
  if (!isRoomCode(roomCode)) return context.json({ error: "invalid room code" }, 400);

  const userId = context.get("userId");
  const stub = await getServerByName<Env, GuessRoom>(context.env.GUESS_ROOM, roomCode);
  const preparation = await stub.beginPreparation(userId);
  if ("error" in preparation) {
    let status: 403 | 404 | 409 = 409;
    if (preparation.error === "room not found") status = 404;
    if (preparation.error === "only the host can prepare") status = 403;
    return context.json(preparation, status);
  }

  let rounds;
  try {
    rounds = await prepareContent(preparation.config, context.env.TMDB_API_READ_ACCESS_TOKEN);
  } catch (error) {
    await stub.cancelPreparation(userId, preparation.claimId);
    throw error;
  }

  const result = await stub.completePreparation(userId, preparation.claimId, rounds);
  if (result.error) await stub.cancelPreparation(userId, preparation.claimId);
  return context.json(result, result.error ? 400 : 200);
});

app.post("/api/rooms/:roomCode/socket-ticket", async (context) => {
  const roomCode = context.req.param("roomCode");
  if (!isRoomCode(roomCode)) return context.json({ error: "invalid room code" }, 400);

  const userId = context.get("userId");
  const stub = await getServerByName<Env, GuessRoom>(context.env.GUESS_ROOM, roomCode);
  if (!(await stub.hasPlayer(userId))) return context.json({ error: "player not found" }, 404);

  const ticket = await issueSocketTicket(userId, roomCode, context.env.AUTH_SIGNING_SECRET);
  return context.json({ ticket });
});

app.all("/parties/*", async (context) => {
  const response = await routePartykitRequest(context.req.raw, context.env, {
    prefix: "parties",
    onBeforeConnect: async (request, lobby) => {
      if (lobby.className !== "GUESS_ROOM" || !isRoomCode(lobby.name)) {
        return new Response("Not found", { status: 404 });
      }
      if (!allowsOrigin(request, context.env.APP_ORIGIN)) {
        return new Response("Forbidden", { status: 403 });
      }

      const url = new URL(request.url);
      const userId = await verifySocketTicket(
        url.searchParams.get("ticket") ?? "",
        lobby.name,
        context.env.AUTH_SIGNING_SECRET,
      );
      if (!userId) return new Response("Unauthorized", { status: 401 });

      url.searchParams.delete("ticket");
      const authenticatedRequest = new Request(url, request);
      authenticatedRequest.headers.set(AUTHENTICATED_USER_HEADER, userId);
      return authenticatedRequest;
    },
  });
  return response ?? context.notFound();
});

app.onError((error, context) => {
  console.error("Worker request failed", error);
  return context.json(
    { error: error instanceof SyntaxError ? "invalid request" : "request failed" },
    error instanceof SyntaxError ? 400 : 500,
  );
});

export { GuessRoom };
export default app;
