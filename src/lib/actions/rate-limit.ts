import { headers } from "next/headers";

const windows = new Map<string, { count: number; resetAt: number }>();

async function requestIp(): Promise<string> {
  const requestHeaders = await headers();
  return requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function enforceRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (windows.size > 1_000) {
    for (const [storedKey, value] of windows) {
      if (value.resetAt <= now) windows.delete(storedKey);
    }
  }

  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  if (current.count >= limit) throw new Error("too many provider requests; try again shortly");
  current.count++;
}

export async function limitPreparation(userId: string) {
  const ip = await requestIp();
  await enforceRateLimit(`prepare:${ip}:${userId}`, 4, 60_000);
}

export async function limitPublicSearch() {
  const ip = await requestIp();
  await enforceRateLimit(`search:${ip}`, 30, 60_000);
}
