import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Room } from "./engine.js";
import type { Reply } from "../shared/types.js";
import { Redis } from "@upstash/redis";

export interface Session {
  id: string;
  token: string;
  socketId?: string;
  roomCode?: string;
  seen: Map<string, Reply>;
  at: number;
}

/** A single authoritative process with durable rooms and resume identities. */
export class Storage {
  private db: DatabaseSync;
  private redis: Redis | null = null;
  constructor(
    // Vercel's bundle is read-only. A hosted Redis-backed storage adapter is
    // the next scaling step; this safe fallback keeps the realtime function
    // bootable in environments without a writable filesystem.
    path = process.env.BLUFF_DATABASE ||
      (process.env.VERCEL ? ":memory:" : resolve(".data/bluff.sqlite")),
  ) {
    const redisUrl = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (redisUrl && redisToken)
      this.redis = new Redis({ url: redisUrl, token: redisToken });
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, data TEXT NOT NULL);",
    );
  }
  load() {
    const rooms = new Map<string, Room>();
    const sessions = new Map<string, Session>();
    for (const row of this.db.prepare("SELECT data FROM rooms").all()) {
      const data = JSON.parse(String(row.data));
      // Spectator occupancy is live presence, not a reserved player seat.
      // Their sessions retain roomCode and can reclaim a slot on reconnect.
      const room: Room = { ...data, spectators: new Set() };
      room.visibility ??= "private";
      if (
        room.roundStarterIndex === undefined ||
        (room.practice && room.settings.rankMode !== "round")
      ) {
        // Upgrade pre-round games at their current seat without redealing private hands.
        room.settings.rankMode = "round";
        room.roundStarterIndex = room.turnIndex;
        room.turnsTaken = 0;
        room.roundRank = room.claim?.rank ?? null;
      }
      if (room.reveal && !room.reveal.winnerId)
        room.reveal.winnerId = room.reveal.liar
          ? room.reveal.callerId
          : room.claim!.playerId;
      room.lastPlay ??= null;
      room.kickVote ??= null;
      room.blockedPlayerIds ??= [];
      room.voteCooldowns ??= {};
      for (const event of room.activity) {
        if (event.actor) continue;
        const person = room.players.find((p) =>
          event.text.startsWith(`${p.name} `),
        );
        if (person)
          event.actor = {
            id: person.id,
            name: person.name,
            avatar: person.avatar,
          };
      }
      room.players.forEach((p) => {
        if (!p.bot) {
          p.connected = false;
          p.disconnectedAt = Date.now();
        }
        p.muted = true;
        p.speaking = false;
      });
      rooms.set(room.code, room);
    }
    for (const row of this.db.prepare("SELECT data FROM sessions").all()) {
      const data = JSON.parse(String(row.data));
      sessions.set(data.token, {
        ...data,
        socketId: undefined,
        seen: new Map(data.seen),
      });
    }
    return { rooms, sessions };
  }
  room(room: Room) {
    this.db
      .prepare("INSERT OR REPLACE INTO rooms VALUES (?, ?)")
      .run(
        room.code,
        JSON.stringify({ ...room, spectators: [...room.spectators] }),
      );
    if (this.redis) void this.redis.set(`bluff:room:${room.code}`, { ...room, spectators: [...room.spectators] });
  }
  session(session: Session) {
    this.db.prepare("INSERT OR REPLACE INTO sessions VALUES (?, ?)").run(
      session.token,
      JSON.stringify({
        ...session,
        socketId: undefined,
      seen: [...session.seen],
      }),
    );
    if (this.redis)
      void this.redis.set(`bluff:session:${session.token}`, {
        ...session,
        socketId: undefined,
        seen: [...session.seen],
      }, { ex: 60 * 60 * 24 });
  }
  async remoteRoom(code: string): Promise<Room | undefined> {
    if (!this.redis) return undefined;
    const data = await this.redis.get<Record<string, unknown>>(`bluff:room:${code}`);
    if (!data) return undefined;
    const room = data as unknown as Room;
    room.spectators = new Set((data.spectators as string[] | undefined) ?? []);
    return room;
  }
  async remoteSession(token: string): Promise<Session | undefined> {
    if (!this.redis) return undefined;
    const data = await this.redis.get<Record<string, unknown>>(`bluff:session:${token}`);
    if (!data) return undefined;
    return { ...(data as unknown as Session), socketId: undefined, seen: new Map((data.seen as [string, Reply][] | undefined) ?? []) };
  }
  deleteRoom(code: string) {
    this.db.prepare("DELETE FROM rooms WHERE code = ?").run(code);
  }
  deleteSession(token: string) {
    this.db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  close() {
    this.db.close();
  }
}
