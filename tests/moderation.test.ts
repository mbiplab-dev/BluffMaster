import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  player,
  startGame,
  tick,
  playCards,
  callBluff,
  snapshot,
  acceptClaim,
} from "../server/engine.js";
import {
  voteToKick,
  expireKickVote,
  cancelKickVote,
} from "../server/moderation.js";
import { validateCommand } from "../server/protocol.js";

function room(count = 4) {
  const room = createRoom("KICK01", player("host", "Host"));
  for (let i = 1; i < count; i++) {
    const p = player(`p${i}`, `Player ${i}`);
    p.ready = true;
    room.players.push(p);
  }
  return room;
}
test("four-player vote needs three votes; target, spectators and duplicate votes are rejected", () => {
  const r = room();
  assert.throws(() => voteToKick(r, "watcher", "p3", 1000), /Only connected/);
  assert.throws(() => voteToKick(r, "p3", "p3", 1000), /yourself/);
  assert.equal(voteToKick(r, "host", "p3", 1000), null);
  assert.equal(r.kickVote?.required, 3);
  assert.throws(() => voteToKick(r, "host", "p3", 1100), /already voted/);
  assert.throws(() => voteToKick(r, "p1", "p2", 1100), /current kick vote/);
  assert.equal(voteToKick(r, "p1", "p3", 1200), null);
  assert.equal(r.players.length, 4);
  assert.equal(voteToKick(r, "p2", "p3", 1300), "p3");
  assert.equal(r.players.length, 3);
  assert.ok(r.blockedPlayerIds.includes("p3"));
});
test("active-game eviction transfers all cards to a new automated identity and keeps claim references valid", () => {
  const r = room();
  startGame(r, "host", 1000);
  tick(r, 3200);
  const c = r.players[0].hand[0];
  playCards(r, "host", [c.id], c.rank, 4000);
  callBluff(r, "p1", 4100);
  const originalHand = r.players[0].hand.map((c) => c.id);
  voteToKick(r, "p1", "host", 4200);
  voteToKick(r, "p2", "host", 4300);
  assert.equal(voteToKick(r, "p3", "host", 4400), "host");
  assert.notEqual(r.players[0].id, "host");
  assert.equal(r.players[0].bot, true);
  assert.deepEqual(
    r.players[0].hand.map((c) => c.id),
    originalHand,
  );
  assert.equal(r.claim?.playerId, r.players[0].id);
  assert.equal(r.lastPlay?.playerId, r.players[0].id);
  assert.equal(
    r.players.reduce((n, p) => n + p.hand.length, r.pile.length),
    52,
  );
  assert.equal(snapshot(r, "host").hand.length, 0);
  assert.notEqual(r.hostId, "host");
  tick(r, 6700);
  tick(r, 7800);
  assert.equal(r.phase, "turn");
});
test("vote expiry, initiation cooldown, roster changes and small tables are bounded", () => {
  const r = room();
  voteToKick(r, "host", "p3", 1000);
  assert.equal(expireKickVote(r, 30999), false);
  assert.equal(expireKickVote(r, 31000), true);
  assert.throws(() => voteToKick(r, "host", "p3", 32000), /60 seconds/);
  voteToKick(r, "host", "p3", 61000);
  cancelKickVote(r);
  assert.equal(r.kickVote, null);
  assert.throws(() => voteToKick(room(2), "host", "p1"), /at least three/);
});
test("last-play summary survives acceptance and only exposes the announced rank", () => {
  const r = room(2);
  startGame(r, "host", 1000);
  tick(r, 3200);
  const cards = r.players[0].hand.slice(0, 2);
  playCards(
    r,
    "host",
    cards.map((c) => c.id),
    "K",
    4000,
  );
  acceptClaim(r, "p1", 4100);
  const view = snapshot(r, "p1");
  assert.equal(view.claim, null);
  assert.deepEqual(view.lastPlay, {
    playerId: "host",
    rank: "K",
    count: 2,
    outcome: "accepted",
  });
  for (const c of cards) assert.ok(!JSON.stringify(view).includes(c.id));
});
test("transport validation rejects malformed data before any engine mutation", () => {
  for (const input of [
    null,
    [],
    {},
    { id: "x", type: "play", payload: [] },
    { id: "x", type: "voice", payload: { muted: "false" } },
    { id: "x", type: "create", payload: { name: "\n" } },
    { id: "x", type: "create", payload: { avatar: Infinity } },
    { id: "x", type: "settings", payload: { turnSeconds: -10 } },
    { id: "x", type: "join", payload: { code: "123" } },
  ])
    assert.throws(() => validateCommand(input));
  assert.equal(
    validateCommand({
      id: "ok",
      type: "create",
      payload: { name: "Sam", visibility: "public", avatar: 2 },
    }).type,
    "create",
  );
});
