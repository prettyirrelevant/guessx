export function secondsUntil(deadline: number | undefined, now = Date.now()): number {
  if (!deadline) return 0;
  return Math.ceil(Math.max(0, deadline - now) / 1_000);
}
