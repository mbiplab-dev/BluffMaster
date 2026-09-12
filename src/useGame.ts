import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";
import type { Snapshot, Reply, Command, OpenRoom, Reaction } from "../shared/types";

export function useGame(notify: (text: string) => void) {
  const [state, setState] = useState<Snapshot | null>(null);
  const [rooms, setRooms] = useState<OpenRoom[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const reactionTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const socketRef = useRef<Socket | null>(null);
  const currentRef = useRef<Snapshot | null>(null);
  const offset = useRef(0);
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  const act = useCallback(
    async (
      type: string,
      payload: Record<string, unknown> = {},
    ): Promise<boolean> => {
      const connection = socketRef.current;
      if (!connection?.connected) {
        notifyRef.current("Reconnecting to the table…");
        return false;
      }
      const command: Command = { id: crypto.randomUUID(), type, payload };
      if (type !== "voice" && type !== "reaction") setBusy(true);
      try {
        let result: Reply;
        try {
          result = await connection
            .timeout(5000)
            .emitWithAck("command", command);
        } catch {
          result = await connection
            .timeout(5000)
            .emitWithAck("command", command);
        }
        if (!result.ok) notifyRef.current(result.error ?? "Please try again.");
        return result.ok;
      } catch {
        notifyRef.current(
          "Connection is taking longer than usual. Your table will sync automatically.",
        );
        return false;
      } finally {
        if (type !== "voice" && type !== "reaction") setBusy(false);
      }
    },
    [],
  );
  useEffect(() => {
    const connection = io({
      auth: { token: sessionStorage.getItem("bluff-session") },
      autoConnect: false,
    });
    socketRef.current = connection;
    setSocket(connection);
    connection.on("connect", () => setConnected(true));
    connection.on("disconnect", () => setConnected(false));
    connection.on("connect_error", (error) => {
      setConnected(false);
      notifyRef.current(
        error.message === "websocket error" ||
          error.message === "xhr poll error"
          ? "Unable to reach the table. Reconnecting…"
          : error.message,
      );
    });
    connection.on("rooms", (rooms: OpenRoom[]) => setRooms(rooms));
    connection.on("session", (session: { token: string; hasRoom: boolean }) => {
      sessionStorage.setItem("bluff-session", session.token);
      connection.auth = { token: session.token };
      if (!session.hasRoom)
        void act("practice", {
          name: localStorage.getItem("bluff-name") || "You",
          avatar: Number(localStorage.getItem("bluff-avatar") || 0),
        });
    });
    connection.on("state", (next: Snapshot) => {
      if (
        currentRef.current?.code === next.code &&
        currentRef.current.version > next.version
      )
        return;
      offset.current = next.serverNow - Date.now();
      currentRef.current = next;
      setState(next);
    });
    connection.on("reaction", (reaction: Reaction) => {
      setReactions((current) =>
        current.some((item) => item.id === reaction.id)
          ? current
          : [...current, reaction].slice(-12),
      );
      const timer = setTimeout(() => {
        setReactions((current) => current.filter((item) => item.id !== reaction.id));
        reactionTimers.current.delete(reaction.id);
      }, 2600);
      reactionTimers.current.set(reaction.id, timer);
    });
    connection.on("left", () => {
      currentRef.current = null;
      setState(null);
    });
    connection.on("removed", ({ reason }: { reason: string }) => {
      currentRef.current = null;
      setState(null);
      notifyRef.current(reason);
      void act("practice", {
        name: localStorage.getItem("bluff-name") || "You",
        avatar: Number(localStorage.getItem("bluff-avatar") || 0),
      });
    });
    connection.connect();
    return () => {
      connection.removeAllListeners();
      connection.disconnect();
      reactionTimers.current.forEach((timer) => clearTimeout(timer));
      reactionTimers.current.clear();
      socketRef.current = null;
    };
  }, [act]);
  return { state, rooms, connected, busy, socket, act, offset, reactions };
}
