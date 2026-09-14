import express from "express";
import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { Server } from "socket.io";
import {
  createRoom,
  player,
  startGame,
  playCards,
  acceptClaim,
  callBluff,
  passTurn,
  tick,
  botAct,
  snapshot,
  log,
  type Room,
} from "./engine.js";
import {
  LIMITS,
  REACTIONS,
  type Command,
  type Reply,
  type OpenRoom,
  type ReactionEmoji,
} from "../shared/types.js";
import { Storage, type Session } from "./storage.js";
import { validateCommand } from "./protocol.js";
import { voteToKick, expireKickVote, cancelKickVote } from "./moderation.js";

export const app = express();
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(self)");
  if (process.env.NODE_ENV === "production")
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
  next();
});
export const http = createServer(app);
export const io = new Server(http, {
  path: "/api/socket",
  maxHttpBufferSize: 24_000,
  pingTimeout: 20_000,
  allowRequest: (req, callback) => {
    const origin = req.headers.origin;
    let allowed = !origin;
    try {
      allowed ||= process.env.PUBLIC_ORIGIN
        ? origin === new URL(process.env.PUBLIC_ORIGIN).origin
        : new URL(origin!).host === req.headers.host;
    } catch {
      /* Malformed origins are denied. */
    }
    callback(null, allowed && io.engine.clientsCount < LIMITS.connections);
  },
});
const storage = new Storage();
const { rooms, sessions } = storage.load();
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (
    sessions.size >= LIMITS.sessions &&
    !(typeof token === "string" && sessions.has(token))
  )
    return next(new Error("The server is at capacity. Try again later."));
  next();
});
const changedAt = new Map<string, number>();
const botTimes = new Map<string, number>();
const attempts = new Map<
  string,
  { since: number; creates: number; joins: number }
>();
function rateLimitRooms(id: string, type: string) {
  let budget = attempts.get(id);
  if (!budget || Date.now() - budget.since > 60_000) {
    budget = { since: Date.now(), creates: 0, joins: 0 };
    attempts.set(id, budget);
  }
  if (
    ["create", "practice"].includes(type) &&
    ++budget.creates > LIMITS.roomCreatesPerMinute
  )
    throw new Error("You can create up to 5 rooms per minute. Please wait.");
  if (
    ["join", "spectate"].includes(type) &&
    ++budget.joins > LIMITS.joinsPerMinute
  )
    throw new Error("Too many join attempts. Try again in a minute.");
}
let lastDirectory = "";
function openRooms(): OpenRoom[] {
  return [...rooms.values()]
    .filter(
      (room) =>
        room.visibility === "public" &&
        !room.practice &&
        (room.phase === "lobby"
          ? room.players.length < LIMITS.players
          : room.spectators.size < LIMITS.spectators) &&
        room.players.some((p) => p.connected && !p.bot),
    )
    .slice(0, LIMITS.directoryRooms)
    .map((room) => {
      const host = room.players.find((p) => p.id === room.hostId)!;
      return {
        code: room.code,
        hostName: host.name,
        avatar: host.avatar,
        players: room.players.length,
        ready: room.players.filter((p) => p.ready || p.id === room.hostId)
          .length,
        capacity: LIMITS.players,
        status: room.phase === "lobby" ? "waiting" : "playing",
        spectators: room.spectators.size,
        spectatorLimit: LIMITS.spectators,
      };
    });
}
function publishDirectory() {
  const directory = openRooms();
  const serialized = JSON.stringify(directory);
  if (serialized !== lastDirectory) {
    lastDirectory = serialized;
    io.emit("rooms", directory);
  }
}
const newCode = () => {
  let code: string;
  do {
    code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  } while (rooms.has(code));
  return code;
};
function publish(room: Room) {
  room.version++;
  if (room.players.some((p) => p.connected && !p.bot))
    room.touchedAt = Date.now();
  storage.room(room);
  for (const s of sessions.values())
    if (s.roomCode === room.code && s.socketId)
      io.to(s.socketId).emit("state", snapshot(room, s.id));
  publishDirectory();
}
function migrateHost(room: Room) {
  if (
    !room.players.some((p) => p.id === room.hostId && p.connected && !p.bot)
  ) {
    const next = room.players.find((p) => p.connected && !p.bot);
    if (next) {
      room.hostId = next.id;
      log(room, `${next.name} is now the host.`, "info", next);
    }
  }
}
function leave(s: Session, explicit = false) {
  const room = rooms.get(s.roomCode ?? "");
  if (!room) return;
  room.spectators.delete(s.id);
  const p = room.players.find((p) => p.id === s.id);
  if (p) {
    if (explicit && ["lobby", "winner"].includes(room.phase))
      cancelKickVote(room);
    if (explicit && (room.phase === "lobby" || room.phase === "winner"))
      room.players = room.players.filter((p) => p.id !== s.id);
    else {
      p.connected = false;
      p.disconnectedAt = Date.now();
      p.muted = true;
      p.speaking = false;
      if (explicit) p.bot = true;
    }
    log(
      room,
      `${p.name} ${explicit ? "left the table" : "disconnected. Their seat is saved"}.`,
      "info",
      p,
    );
  }
  migrateHost(room);
  publish(room);
  if (explicit) s.roomCode = undefined;
}
io.on("connection", async (socket) => {
  socket.emit("rooms", openRooms());
  const supplied = socket.handshake.auth?.token;
  let session =
    typeof supplied === "string" ? sessions.get(supplied) : undefined;
  if (!session && typeof supplied === "string") {
    session = await storage.remoteSession(supplied);
    if (session) sessions.set(session.token, session);
  }
  if (!session) {
    const token = randomBytes(32).toString("hex");
    session = { id: randomUUID(), token, seen: new Map(), at: Date.now() };
    sessions.set(token, session);
  }
  const s = session;
  const oldSocketId = s.socketId;
  s.socketId = socket.id;
  s.at = Date.now();
  storage.session(s);
  if (oldSocketId && oldSocketId !== socket.id)
    io.sockets.sockets.get(oldSocketId)?.disconnect(true);
  socket.emit("session", {
    token: s.token,
    selfId: s.id,
    hasRoom: rooms.has(s.roomCode ?? ""),
  });
  let existing = rooms.get(s.roomCode ?? "");
  if (!existing && s.roomCode) {
    existing = await storage.remoteRoom(s.roomCode);
    if (existing) rooms.set(existing.code, existing);
  }
  if (existing) {
    const p = existing.players.find((p) => p.id === s.id);
    if (p) {
      p.connected = true;
      p.bot = false;
      p.disconnectedAt = null;
    } else if (
      existing.spectators.has(s.id) ||
      existing.spectators.size < LIMITS.spectators
    )
      existing.spectators.add(s.id);
    else {
      s.roomCode = undefined;
      storage.session(s);
      socket.emit("removed", {
        reason: "The spectator seats filled while you were away.",
      });
    }
    migrateHost(existing);
    publish(existing);
  }
  let rateStart = Date.now(),
    rateCount = 0;
  const lastReactionAt = new Map<string, number>();
  let lastChatAt = 0;
  socket.on("command", async (command: Command, callback: (reply: Reply) => void) => {
    const ack = typeof callback === "function" ? callback : () => {};
    if (Date.now() - rateStart > 1000) {
      rateCount = 0;
      rateStart = Date.now();
    }
    if (++rateCount > LIMITS.commandsPerSecond)
      return ack({ ok: false, error: "A little slower, please." });
    try {
      command = validateCommand(command);
    } catch (error) {
      return ack({ ok: false, error: (error as Error).message });
    }
    if (s.seen.has(command.id)) return ack(s.seen.get(command.id)!);
    try {
      s.at = Date.now();
      rateLimitRooms(s.id, command.type);
      const data = command.payload ?? {};
      const name =
        typeof data.name === "string" ? data.name.trim().slice(0, 20) : "You";
      const avatar =
        typeof data.avatar === "number" && Number.isInteger(data.avatar)
          ? data.avatar
          : 0;
      let room = rooms.get(s.roomCode ?? "");
      if (!room && s.roomCode) {
        room = await storage.remoteRoom(s.roomCode);
        if (room) rooms.set(room.code, room);
      }
      if (command.type === "create" || command.type === "practice") {
        if (rooms.size >= LIMITS.rooms)
          throw new Error("The club is full. Try again shortly.");
        leave(s, true);
        room = createRoom(
          newCode(),
          player(s.id, name, avatar),
          command.type === "practice",
          data.visibility === "public" ? "public" : "private",
        );
        if (room.practice) {
          room.players.push(
            player(randomUUID(), "Jules", 1, true),
            player(randomUUID(), "Theo", 2, true),
            player(randomUUID(), "Mia", 3, true),
          );
        }
        rooms.set(room.code, room);
        s.roomCode = room.code;
        log(room, `${name} opened the table.`, "info", s.id);
        if (room.practice) startGame(room, s.id);
      } else if (command.type === "join" || command.type === "spectate") {
        const code = String(data.code ?? "")
          .trim()
          .toUpperCase();
        let target = rooms.get(code);
        if (!target) {
          target = await storage.remoteRoom(code);
          if (target) rooms.set(target.code, target);
        }
        if (!target || target.practice)
          throw new Error(
            "That room was not found. Check the six-character code.",
          );
        const saved = target.players.find((p) => p.id === s.id);
        if (target.blockedPlayerIds.includes(s.id))
          throw new Error(
            "You were removed from this room and cannot rejoin it.",
          );
        if (
          !saved &&
          command.type !== "spectate" &&
          target.phase !== "lobby" &&
          target.phase !== "winner"
        )
          throw new Error(
            "This game has started. You can join as a spectator.",
          );
        if (
          !saved &&
          command.type !== "spectate" &&
          target.players.length >= LIMITS.players
        )
          throw new Error("This table is full. You can join as a spectator.");
        if (
          !saved &&
          command.type === "spectate" &&
          !target.spectators.has(s.id) &&
          target.spectators.size >= LIMITS.spectators
        )
          throw new Error("The spectator seats are full.");
        if (s.roomCode !== code) leave(s, true);
        room = target;
        s.roomCode = code;
        if (saved) {
          saved.connected = true;
          saved.bot = false;
          saved.disconnectedAt = null;
        } else if (command.type === "spectate") room.spectators.add(s.id);
        else {
          cancelKickVote(room);
          room.spectators.delete(s.id);
          room.players.push(player(s.id, name, avatar));
          log(room, `${name} joined the table.`, "info", s.id);
        }
        migrateHost(room);
      } else {
        if (!room) throw new Error("Create or join a room first.");
        if (tick(room)) publish(room);
        const p = room.players.find((p) => p.id === s.id);
        if (!p && !["leave"].includes(command.type))
          throw new Error("Spectators cannot perform game actions.");
        switch (command.type) {
          case "ready":
            if (!["lobby", "winner"].includes(room.phase))
              throw new Error("A game is already in progress.");
            p!.ready = !p!.ready;
            // A finished table is a rematch vote: as soon as every seated,
            // connected player is ready, deal again without making somebody
            // hunt for a host-only button.  The host identity is still used
            // for the authoritative start validation.
            if (
              room.phase === "winner" &&
              room.players.length >= 2 &&
              room.players.every((player) => player.connected && player.ready)
            ) {
              log(room, "Everyone is ready. Shuffling the next game.", "info");
              startGame(room, room.hostId);
              cancelKickVote(room);
            }
            break;
          case "start":
            startGame(room, s.id);
            cancelKickVote(room);
            break;
          case "play":
            playCards(room, s.id, data.ids as string[], data.rank as string);
            break;
          case "accept":
            acceptClaim(room, s.id);
            break;
          case "bluff":
            callBluff(room, s.id);
            break;
          case "pass":
            passTurn(room, s.id);
            break;
          case "settings":
            if (
              room.hostId !== s.id ||
              !["lobby", "winner"].includes(room.phase)
            )
              throw new Error("The host can change rules between games.");
            if (
              room.practice &&
              data.rankMode !== undefined &&
              data.rankMode !== "round"
            )
              throw new Error(
                "The practice table uses round-locked Bluff. Create a room to play another variant.",
              );
            if (
              typeof data.turnSeconds === "number" &&
              [20, 30, 45, 60].includes(data.turnSeconds)
            )
              room.settings.turnSeconds = data.turnSeconds;
            if (
              typeof data.challengeSeconds === "number" &&
              [5, 8, 12].includes(data.challengeSeconds)
            )
              room.settings.challengeSeconds = data.challengeSeconds;
            if (
              data.rankMode === "round" ||
              data.rankMode === "free" ||
              data.rankMode === "ascending"
            )
              room.settings.rankMode = data.rankMode;
            break;
          case "kick": {
            if (
              room.hostId !== s.id ||
              !["lobby", "winner"].includes(room.phase)
            )
              throw new Error(
                "Players can only be removed by the host between games.",
              );
            if (data.playerId === s.id)
              throw new Error("Use Leave table to leave your own seat.");
            const removed = room.players.find((p) => p.id === data.playerId);
            if (!removed) throw new Error("That player has already left.");
            if (room.spectators.size >= LIMITS.spectators)
              throw new Error("The spectator seats are full.");
            cancelKickVote(room);
            room.players = room.players.filter((p) => p.id !== removed.id);
            room.spectators.add(removed.id);
            log(
              room,
              `${removed.name} is now watching from the sidelines.`,
              "info",
              removed,
            );
            break;
          }
          case "vote-kick": {
            const evicted = voteToKick(room, s.id, data.targetId as string);
            if (evicted)
              for (const target of sessions.values())
                if (target.id === evicted && target.roomCode === room.code) {
                  target.roomCode = undefined;
                  storage.session(target);
                  if (target.socketId)
                    io.to(target.socketId).emit("removed", {
                      reason:
                        "The table voted to remove you from the room. You can join a different room.",
                    });
                }
            break;
          }
          case "voice":
            p!.muted = data.muted !== false;
            p!.speaking = !p!.muted && data.speaking === true;
            break;
          case "reaction": {
            const at = Date.now();
            const previous = lastReactionAt.get(s.id) ?? 0;
            if (at - previous < LIMITS.reactionCooldownMs)
              throw new Error("Give the table a moment before another reaction.");
            const emoji = data.emoji as ReactionEmoji;
            if (!REACTIONS.includes(emoji)) throw new Error("Choose a table reaction.");
            lastReactionAt.set(s.id, at);
            const reaction = { id: randomUUID(), playerId: s.id, emoji, at };
            for (const member of sessions.values())
              if (member.roomCode === room.code && member.socketId)
                io.to(member.socketId).emit("reaction", reaction);
            break;
          }
          case "chat": {
            const at = Date.now();
            if (at - lastChatAt < 650)
              throw new Error("Give the table a moment before another message.");
            const text = String(data.text ?? "").trim();
            if (!text || text.length > 180) throw new Error("That message is not valid.");
            lastChatAt = at;
            const message = {
              id: randomUUID(),
              playerId: p!.id,
              name: p!.name,
              avatar: p!.avatar,
              text,
              at,
            };
            for (const member of sessions.values())
              if (member.roomCode === room.code && member.socketId)
                io.to(member.socketId).emit("chat", message);
            break;
          }
          case "leave":
            leave(s, true);
            socket.emit("left");
            break;
          default:
            throw new Error("Unknown action.");
        }
      }
      if (room) publish(room);
      const reply = { ok: true };
      s.seen.set(command.id, reply);
      storage.session(s);
      ack(reply);
    } catch (error) {
      const reply = {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "That action could not be completed.",
      };
      s.seen.set(command.id, reply);
      storage.session(s);
      ack(reply);
    }
    if (s.seen.size > 100) s.seen.delete(s.seen.keys().next().value!);
  });
  // Relay only between authenticated members of the same room. SDP never goes to spectators.
  socket.on(
    "signal",
    (data: { to: string; description?: unknown; candidate?: unknown }) => {
      if (Date.now() - rateStart > 1000) {
        rateCount = 0;
        rateStart = Date.now();
      }
      if (++rateCount > 60) return;
      const room = rooms.get(s.roomCode ?? "");
      if (
        !room ||
        !data ||
        typeof data.to !== "string" ||
        !room.players.some((p) => p.id === s.id && !p.muted)
      )
        return;
      if (!room.players.some((p) => p.id === data.to && !p.muted)) return;
      const target = [...sessions.values()].find(
        (t) => t.id === data.to && t.roomCode === room.code,
      );
      if (target?.socketId)
        io.to(target.socketId).emit("signal", {
          from: s.id,
          description: data.description,
          candidate: data.candidate,
        });
    },
  );
  socket.on("disconnect", () => {
    if (s.socketId === socket.id) {
      s.socketId = undefined;
      leave(s);
    }
  });
});
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    for (const [id, expiresAt] of Object.entries(room.voteCooldowns))
      if (now >= expiresAt) delete room.voteCooldowns[id];
    if (
      !room.players.some((p) => p.connected && !p.bot) &&
      now - room.touchedAt > 30 * 60_000
    ) {
      rooms.delete(room.code);
      storage.deleteRoom(room.code);
      publishDirectory();
      changedAt.delete(room.code);
      botTimes.delete(room.code);
      continue;
    }
    for (const p of room.players)
      if (
        !p.connected &&
        !p.bot &&
        p.disconnectedAt &&
        now - p.disconnectedAt > 45_000 &&
        !["lobby", "winner"].includes(room.phase)
      ) {
        p.bot = true;
        log(
          room,
          `${p.name} is away. An automatic player is keeping their seat warm.`,
          "info",
          p,
        );
        publish(room);
      }
    if (expireKickVote(room, now)) publish(room);
    if (tick(room, now)) publish(room);
    const stamp = `${room.phase}:${room.turnIndex}:${room.deadline}`;
    const stampHash = [...stamp].reduce(
      (a, c) => (a * 31 + c.charCodeAt(0)) | 0,
      0,
    );
    if (changedAt.get(room.code) !== stampHash) {
      changedAt.set(room.code, stampHash);
      botTimes.set(room.code, now + 2200);
    }
    if (now >= (botTimes.get(room.code) ?? Infinity)) {
      if (botAct(room, now)) publish(room);
      botTimes.set(room.code, now + 1200);
    }
  }
  for (const [token, s] of sessions)
    if (!s.socketId && now - s.at > 24 * 60 * 60_000) {
      sessions.delete(token);
      storage.deleteSession(token);
    }
  for (const [id, budget] of attempts)
    if (now - budget.since > 120_000) attempts.delete(id);
}, 200).unref();

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/voice-config", (_req, res) => {
  const iceServers: object[] = [{ urls: "stun:stun.l.google.com:19302" }];
  if (
    process.env.TURN_URL &&
    process.env.TURN_USERNAME &&
    process.env.TURN_CREDENTIAL
  ) {
    iceServers.push({
      urls: process.env.TURN_URL,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  res.json({ enabled: process.env.VOICE_CHAT !== "false", iceServers });
});
if (process.env.NODE_ENV === "production") {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
// Vercel imports this module as a WebSocket-capable function. In local/Docker
// deployments we still own the HTTP listener; never call listen() inside a
// serverless invocation.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3000);
  http.listen(port, "0.0.0.0", () =>
    console.log(`BLUFF is ready at http://localhost:${port}`),
  );
}
