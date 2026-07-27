import type { Env } from "@guessx/server";

declare global {
  interface CloudflareEnv extends Env {}
}

export {};
