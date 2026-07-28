const CODE_PARTS = /^([A-HJ-NP-Z]{2})[-\s–—]?(\d{4})$/i;
const INVITE_CODE = /\/room\/([A-HJ-NP-Z]{2})[-\s–—]?(\d{4})(?:[/?#]|$)/i;

export function normalizeRoomCode(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(INVITE_CODE) ?? trimmed.match(CODE_PARTS);
  return match ? `${match[1].toUpperCase()}-${match[2]}` : trimmed.toUpperCase();
}
