const DEFAULT_API_URL = "https://guessx.enio.la";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL).replace(/\/+$/, "");

const workerUrl = new URL(API_URL);

export const SOCKET_HOST = workerUrl.host;
export const SOCKET_PROTOCOL = workerUrl.protocol === "https:" ? "wss" : "ws";

export function getSocketOptions() {
  return { host: SOCKET_HOST, protocol: SOCKET_PROTOCOL } as const;
}
