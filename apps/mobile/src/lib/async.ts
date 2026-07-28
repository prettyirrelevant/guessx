export function isAbortError(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}
