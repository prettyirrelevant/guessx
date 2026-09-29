import {
  createContext,
  use,
  useCallback,
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
  JoinRoomInput,
  RoomSnapshot,
  ServerMessage,
} from "@guessx/game";

type ConnectionValue = {
  snapshot: RoomSnapshot | null;
  status: "connecting" | "connected" | "not_found" | "error";
  error: string;
  command: (command: CommandName, args?: CommandArgs) => Promise<CommandResult>;
  serverNow: () => number;
};

type PendingCommand = {
  resolve: (result: CommandResult) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type RoomConnectionProviderProps = JoinRoomInput & {
  children: ReactNode;
  getTicket: (input: JoinRoomInput) => Promise<string>;
  randomUUID: () => string;
  socketOptions: () => { host: string; protocol: "ws" | "wss" };
};

const RoomConnectionContext = createContext<ConnectionValue | null>(null);
const COMMAND_TIMEOUT_MS = 15_000;
const CLOCK_SAMPLES = 5;

export function RoomConnectionProvider({
  roomCode,
  displayName,
  avatar,
  getTicket,
  randomUUID,
  socketOptions,
  children,
}: RoomConnectionProviderProps) {
  const socketRef = useRef<PartySocket | null>(null);
  const pendingRef = useRef(new Map<string, PendingCommand>());
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionValue["status"]>("connecting");
  const [error, setError] = useState("");
  const clockSamples = useRef<number[]>([]);
  const clockOffset = useRef(0);

  useEffect(() => {
    const pendingCommands = pendingRef.current;
    const { host, protocol } = socketOptions();
    const socket = new PartySocket({
      host,
      protocol,
      party: "guess-room",
      room: roomCode,
      id: randomUUID(),
      query: async () => {
        try {
          return { ticket: await getTicket({ roomCode, displayName, avatar }) };
        } catch (cause) {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : "could not authorize connection");
          throw cause;
        }
      },
    });

    socketRef.current = socket;
    const handleOpen = () => setStatus("connecting");
    const handleClose = () =>
      setStatus((current) =>
        current === "not_found" || current === "error" ? current : "connecting",
      );
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
        const samples = [...clockSamples.current, message.snapshot.serverTime - Date.now()];
        clockSamples.current = samples.slice(-CLOCK_SAMPLES);
        clockOffset.current = Math.max(...clockSamples.current);
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
    socket.addEventListener("close", handleClose);
    socket.addEventListener("message", receive);
    return () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("message", receive);
      socket.close(1000, "connection closed");
      socketRef.current = null;
      for (const pending of pendingCommands.values()) {
        clearTimeout(pending.timeout);
        pending.resolve({ error: "connection closed" });
      }
      pendingCommands.clear();
    };
  }, [avatar, displayName, getTicket, randomUUID, roomCode, socketOptions]);

  const command = useCallback(
    (name: CommandName, args?: CommandArgs) =>
      new Promise<CommandResult>((resolve) => {
        const socket = socketRef.current;
        if (!socket) {
          resolve({ error: "not connected" });
          return;
        }

        const requestId = randomUUID();
        const timeout = setTimeout(() => {
          pendingRef.current.delete(requestId);
          resolve({ error: "request timed out" });
        }, COMMAND_TIMEOUT_MS);
        pendingRef.current.set(requestId, { resolve, timeout });
        socket.send(JSON.stringify({ type: "command", requestId, command: name, args }));
      }),
    [randomUUID],
  );

  const serverNow = useCallback(() => Date.now() + clockOffset.current, []);

  const value = useMemo(
    () => ({ snapshot, status, error, command, serverNow }),
    [command, error, serverNow, snapshot, status],
  );

  return <RoomConnectionContext value={value}>{children}</RoomConnectionContext>;
}

export function useRoomConnection(): ConnectionValue {
  const value = use(RoomConnectionContext);
  if (!value) throw new Error("useRoomConnection must be used inside RoomConnectionProvider");
  return value;
}

export function useSecondsLeft(deadline: number | undefined): number {
  const { serverNow } = useRoomConnection();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const update = () =>
      setSeconds(deadline ? Math.ceil(Math.max(0, deadline - serverNow()) / 1_000) : 0);
    update();
    if (!deadline) return;
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [deadline, serverNow]);

  return seconds;
}
