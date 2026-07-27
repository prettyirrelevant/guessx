import type { GuessRoom } from "./room";

export interface Env {
  GUESS_ROOM: DurableObjectNamespace<GuessRoom>;
  AUTH_SIGNING_SECRET: string;
  TMDB_API_READ_ACCESS_TOKEN: string;
}
