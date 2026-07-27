"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PartySocket } from "partysocket";
import type {
  CommandArgs,
  CommandName,
  CommandResult,
  RoomSnapshot,
  ServerMessage,
} from "@guessx/game";

import { getRoomSocketTicket } from "@/lib/actions";

type ConnectionValue = {
  snapshot: RoomSnapshot | null;
  status: "connecting" | "connected" | "not_found" | "error";
  error: string;
  command: (command: CommandName, args?: CommandArgs) => Promise<CommandResult>;
};

type PendingCommand = {
  resolve: (result: CommandResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

const RoomConnectionContext = createContext<ConnectionValue | null>(null);

/** Owns the room socket and exposes request-correlated commands plus the latest player snapshot. */
export function RoomConnectionProvider({
  roomCode,
  displayName,
  avatar,
  children,
}: {
  roomCode: string;
  displayName: string;
  avatar: string;
  children: ReactNode;
}) {
  const socketRef = useRef<PartySocket | null>(null);
  const pendingRef = useRef(new Map<string, PendingCommand>());
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionValue["status"]>("connecting");
  const [error, setError] = useState("");

  useEffect(() => {
    const pendingCommands = pendingRef.current;
    let socket: PartySocket;
    try {
      socket = new PartySocket({
        host: window.location.host,
        protocol: window.location.protocol === "https:" ? "wss" : "ws",
        party: "guess-room",
        room: roomCode,
        query: async () => {
          try {
            const ticket = await getRoomSocketTicket({ roomCode, displayName, avatar });
            return { ticket };
          } catch (cause) {
            setStatus("error");
            setError(cause instanceof Error ? cause.message : "could not authorize connection");
            throw cause;
          }
        },
      });
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "could not connect to the room");
      return;
    }

    socketRef.current = socket;
    const handleOpen = () => {
      setStatus("connecting");
    };
    const receive = (event: MessageEvent) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(String(event.data)) as ServerMessage;
      } catch {
        setStatus("error");
        setError("the room returned an invalid response");
        return;
      }

      if (message.type === "snapshot") {
        setSnapshot(message.snapshot);
        setStatus("connected");
        setError("");
        return;
      }
      if (message.type === "roomNotFound") {
        setStatus("not_found");
        return;
      }
      if (message.type === "error") {
        setStatus("error");
        setError(message.error);
        return;
      }

      const pending = pendingRef.current.get(message.requestId);
      if (!pending) return;
      clearTimeout(pending.timeout);
      pendingRef.current.delete(message.requestId);
      pending.resolve(message.result);
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", receive);
    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", receive);
      socket.close(1000, "page closed");
      socketRef.current = null;
      for (const pending of pendingCommands.values()) {
        clearTimeout(pending.timeout);
        pending.resolve({ error: "connection closed" });
      }
      pendingCommands.clear();
    };
  }, [roomCode, displayName, avatar]);

  const command = useCallback(
    (name: CommandName, args?: CommandArgs) =>
      new Promise<CommandResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          resolve({ error: "not connected" });
          return;
        }

        const requestId = crypto.randomUUID();
        const timeout = setTimeout(() => {
          pendingRef.current.delete(requestId);
          resolve({ error: "request timed out" });
        }, 10_000);
        pendingRef.current.set(requestId, { resolve, timeout });
        socket.send(JSON.stringify({ type: "command", requestId, command: name, args }));
      }),
    [],
  );

  const value = useMemo(
    () => ({ snapshot, status, error, command }),
    [snapshot, status, error, command],
  );
  return <RoomConnectionContext.Provider value={value}>{children}</RoomConnectionContext.Provider>;
}

/** Returns the active room connection and rejects use outside its provider. */
export function useRoomConnection(): ConnectionValue {
  const value = useContext(RoomConnectionContext);
  if (!value) throw new Error("useRoomConnection must be used inside RoomConnectionProvider");
  return value;
}
