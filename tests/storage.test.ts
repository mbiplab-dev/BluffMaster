import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Storage } from "../server/storage.js";
import { createRoom, player, startGame, snapshot } from "../server/engine.js";

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
