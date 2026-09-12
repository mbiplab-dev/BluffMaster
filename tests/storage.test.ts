import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../server/storage.js";
import {
  createRoom,
  player,
  startGame,
  snapshot,
  tick,
  playCards,
  acceptClaim,
} from "../server/engine.js";

test("server restarts retain the exact hand, room, identity and duplicate-action protection", () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "bluff-storage-")),
    "state.sqlite",
  );
  const store = new Storage(path);
  const room = createRoom("SAVE01", player("host", "Host"));
  room.players.push(player("guest", "Guest", 1));
  room.players[1].ready = true;
  room.spectators.add("watcher");
  startGame(room, "host");
  tick(room, room.deadline);
  playCards(room, "host", [room.players[0].hand[0].id], "5");
  acceptClaim(room, "guest");
  const session = {
    id: "host",
    token: "opaque-secret",
    roomCode: room.code,
    seen: new Map([["action1", { ok: true }]]),
    at: Date.now(),
    socketId: "old-socket",
  };
  store.room(room);
  store.session(session);
  store.close();
  const reopened = new Storage(path);
  const saved = reopened.load();
  assert.deepEqual(
    snapshot(saved.rooms.get("SAVE01")!, "host").hand,
    room.players[0].hand,
  );
  assert.equal(saved.rooms.get("SAVE01")!.players[0].connected, false);
  assert.equal(saved.rooms.get("SAVE01")!.spectators.size, 0);
  assert.equal(saved.rooms.get("SAVE01")!.roundRank, "5");
  assert.equal(saved.rooms.get("SAVE01")!.roundStarterIndex, 0);
  assert.equal(saved.rooms.get("SAVE01")!.turnsTaken, 1);
  assert.equal(saved.rooms.get("SAVE01")!.turnIndex, 1);
  assert.equal(saved.sessions.get("opaque-secret")!.socketId, undefined);
  assert.deepEqual(saved.sessions.get("opaque-secret")!.seen.get("action1"), {
    ok: true,
  });
  reopened.deleteRoom("SAVE01");
  reopened.deleteSession("opaque-secret");
  assert.equal(reopened.load().rooms.size, 0);
  assert.equal(reopened.load().sessions.size, 0);
  reopened.close();
});

test("legacy saved games upgrade to round play without exposing or redealing hands", () => {
  const store = new Storage(":memory:");
  const room = createRoom("OLD001", player("host", "Host"));
  room.players.push(player("guest", "Guest", 1, true));
  startGame(room, "host", 1000);
  tick(room, 3200);
  const cards = room.players.map((p) => [...p.hand]);
  const legacy = room as unknown as Record<string, unknown>;
  delete legacy.roundStarterIndex;
  delete legacy.turnsTaken;
  delete legacy.roundRank;
  room.settings.rankMode = "free";
  store.room(room);
  const restored = store.load().rooms.get(room.code)!;
  assert.equal(restored.settings.rankMode, "round");
  assert.equal(restored.roundStarterIndex, restored.turnIndex);
  assert.equal(restored.turnsTaken, 0);
  assert.equal(restored.roundRank, null);
  assert.deepEqual(
    restored.players.map((p) => p.hand),
    cards,
  );
  store.close();
});
