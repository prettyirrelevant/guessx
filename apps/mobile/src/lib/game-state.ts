export function isAnswerLocked(
  selected: string | null,
  answeredPlayerIds: ReadonlySet<string>,
  currentPlayerId: string,
): boolean {
  return selected !== null || answeredPlayerIds.has(currentPlayerId);
}
