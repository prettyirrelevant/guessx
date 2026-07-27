import type { GuessRoom } from "./room";

export interface Env extends Cloudflare.Env {
  GUESS_ROOM: DurableObjectNamespace<GuessRoom>;
  APP_ORIGIN: string;
  AUTH_SIGNING_SECRET: string;
  TMDB_API_READ_ACCESS_TOKEN: string;
}
