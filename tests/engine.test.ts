import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createRoom,
  player,
  startGame,
  tick,
  playCards,
  callBluff,
  acceptClaim,
  passTurn,
  snapshot,
  botAct,
  deck,
  type Room,
} from "../server/engine.js";
import { RANKS, type Card } from "../shared/types.js";

function game(count = 4): Room {
  const room = createRoom("TEST01", player("host", "Host"));
  room.settings.rankMode = "free";
  for (let i = 1; i < count; i++) {
    const p = player(`p${i}`, `Player ${i}`);
    p.ready = true;
    room.players.push(p);
  }
  startGame(room, "host", 1000);
  tick(room, 3200);
  return room;
}
function arrange(room: Room, rank = "K") {
  const card = room.players
    .flatMap((p) => p.hand)
    .find((c) => c.rank === rank)!;
  const owner = room.players.find((p) => p.hand.some((c) => c.id === card.id))!;
  const host = room.players[0];
  if (owner !== host) {
    owner.hand = owner.hand.filter((c) => c.id !== card.id);
    owner.hand.push(host.hand.pop()!);
    host.hand.push(card);
  }
  return card;
}
function countCards(room: Room) {
  return room.players.reduce(
    (total, p) => total + p.hand.length,
    room.pile.length,
  );
}

for (let count = 2; count <= 8; count++) {
  test(`${count} players: unique balanced deal, clockwise turns, private snapshots`, () => {
    const room = game(count);
    assert.equal(room.phase, "turn");
    assert.equal(countCards(room), 52);
    const cards = room.players.flatMap((p) => p.hand);
    assert.equal(new Set(cards.map((c) => c.id)).size, 52);
    assert.equal(new Set(cards.map((c) => `${c.rank}${c.suit}`)).size, 52);
    assert.ok(
      Math.max(...room.players.map((p) => p.hand.length)) -
        Math.min(...room.players.map((p) => p.hand.length)) <=
        1,
    );
    for (const p of room.players) {
      const view = snapshot(room, p.id);
      assert.deepEqual(view.hand, p.hand);
      assert.ok(view.players.every((p) => !("hand" in p)));
      for (const hidden of room.players
        .filter((other) => other !== p)
        .flatMap((p) => p.hand))
        assert.ok(!JSON.stringify(view).includes(hidden.id));
    }
    assert.equal(snapshot(room, "spectator").hand.length, 0);
    for (let i = 0; i < count; i++)
      passTurn(room, room.players[i].id, 3500 + i);
    assert.equal(room.turnIndex, 0);
    assert.equal(room.round, 2);
  });
}
test("the deck contains all 52 rank/suit combinations", () => {
  const cards = deck();
  assert.equal(cards.length, 52);
  RANKS.forEach((rank) =>
    assert.equal(cards.filter((c) => c.rank === rank).length, 4),
  );
});
test("rejects unauthorized starts, unready rooms, invalid and duplicated cards, and out of turn actions", () => {
  const room = game();
  const p = room.players[0];
  assert.throws(() => startGame(room, "p1"), /host/);
  assert.throws(
    () => playCards(room, "p1", [room.players[1].hand[0].id], "K"),
    /not your turn/,
  );
  assert.throws(
    () => playCards(room, "host", ["stolen"], "K"),
    /only play cards/,
  );
  assert.throws(
    () => playCards(room, "host", [p.hand[0].id, p.hand[0].id], "K"),
    /different cards/,
  );
  assert.throws(() => playCards(room, "host", [], "K"), /Select/);
  assert.throws(
    () =>
      playCards(
        room,
        "host",
        Array.from({ length: 53 }, () => randomUUID()),
        "K",
      ),
    /Select/,
  );
  assert.throws(
    () => playCards(room, "host", [p.hand[0].id], "Z"),
    /valid rank/,
  );
  assert.equal(countCards(room), 52);
  const lobby = createRoom("LOBBY1", player("host", "Host"));
  lobby.players.push(player("p1", "One"));
  assert.throws(() => startGame(lobby, "host"), /ready/);
});
test("multi-card claim hides cards until challenge; correct challenge gives entire pile to liar", () => {
  const room = game();
  const p = room.players[0];
  const card = arrange(room, "K");
  const other = p.hand.find((c) => c.id !== card.id)!;
  playCards(room, "host", [card.id, other.id], "A", 4000);
  assert.equal(room.pile.length, 2);
  assert.equal(room.phase, "challenge");
  const view = snapshot(room, "p1");
  assert.ok(!("cards" in view.claim!));
  assert.ok(!JSON.stringify(view).includes(card.id));
  assert.throws(() => callBluff(room, "host"), /own claim/);
  const before = p.hand.length;
  callBluff(room, "p1", 4200);
  assert.equal(room.reveal?.liar, true);
  assert.equal(snapshot(room, "p1").reveal?.cards.length, 2);
  assert.throws(() => callBluff(room, "p2"), /closed/);
  tick(room, 6800);
  assert.equal(room.phase, "resolution");
  assert.equal(p.hand.length, before + 2);
  tick(room, 7900);
  assert.equal(room.phase, "turn");
  assert.equal(room.turnIndex, 1);
  assert.equal(countCards(room), 52);
});
test("incorrect challenge gives entire accumulated pile to challenger", () => {
  const room = game(2);
  const first = arrange(room, "K");
  playCards(room, "host", [first.id], "K", 4000);
  acceptClaim(room, "p1", 4100);
  const next = room.players[1].hand[0];
  playCards(room, "p1", [next.id], next.rank, 4200);
  const before = room.players[0].hand.length;
  callBluff(room, "host", 4300);
  assert.equal(room.reveal?.liar, false);
  assert.equal(room.reveal?.loserId, "host");
  tick(room, 6900);
  assert.equal(room.players[0].hand.length, before + 2);
  assert.equal(room.pile.length, 0);
  assert.equal(countCards(room), 52);
});
test("accept is one vote per opponent and spectators cannot vote or challenge", () => {
  const room = game();
  playCards(room, "host", [room.players[0].hand[0].id], "A", 4000);
  assert.throws(() => acceptClaim(room, "watcher"), /Only other/);
  assert.throws(() => callBluff(room, "watcher"), /cannot challenge/);
  assert.throws(() => acceptClaim(room, "host"), /Only other/);
  acceptClaim(room, "p1", 4100);
  assert.throws(() => acceptClaim(room, "p1"), /already accepted/);
  assert.throws(() => callBluff(room, "p1"), /already accepted/);
  acceptClaim(room, "p2", 4200);
  assert.equal(room.phase, "challenge");
  acceptClaim(room, "p3", 4300);
  assert.equal(room.phase, "turn");
});
function lastCardGame() {
  const room = game(2);
  room.players[1].hand.push(...room.players[0].hand.splice(1));
  return room;
}
test("last-card win waits for the full challenge window", () => {
  const room = lastCardGame();
  const c = room.players[0].hand[0];
  playCards(room, "host", [c.id], c.rank, 4000);
  assert.equal(room.winnerId, null);
  assert.equal(room.phase, "challenge");
  assert.equal(tick(room, 11999), false);
  tick(room, 12000);
  assert.equal(room.winnerId, "host");
  assert.equal(room.phase, "winner");
  assert.equal(countCards(room), 52);
  assert.ok(room.players.every((player) => !player.ready));
  room.players.forEach((player) => (player.ready = true));
  startGame(room, "host", 13000);
  assert.equal(room.phase, "dealing");
  assert.ok(room.players.every((player) => !player.ready));
});
test("last-card lie loses and prevents a premature winner", () => {
  const room = lastCardGame();
  const c = room.players[0].hand[0];
  playCards(room, "host", [c.id], c.rank === "K" ? "A" : "K", 4000);
  callBluff(room, "p1", 4100);
  tick(room, 6700);
  tick(room, 7800);
  assert.equal(room.winnerId, null);
  assert.equal(room.players[0].hand.length, 1);
  assert.equal(room.phase, "turn");
});
test("truthful last-card claim wins after incorrect challenge resolves", () => {
  const room = lastCardGame();
  const c = room.players[0].hand[0];
  playCards(room, "host", [c.id], c.rank, 4000);
  callBluff(room, "p1", 4100);
  tick(room, 6700);
  assert.equal(room.winnerId, null);
  tick(room, 7800);
  assert.equal(room.winnerId, "host");
  assert.equal(room.phase, "winner");
});
test("timed out turns pass safely and ascending ranks advance", () => {
  const room = game();
  room.settings.rankMode = "ascending";
  assert.throws(
    () => playCards(room, "host", [room.players[0].hand[0].id], "K", 4000),
    /Claim Aces/,
  );
  tick(room, 33200);
  assert.equal(room.turnIndex, 1);
  assert.equal(room.requiredRank, "2");
});
test("random bot games conserve all cards and terminate with validated winners", () => {
  for (let n = 2; n <= 8; n++) {
    const room = game(n);
    room.players.forEach((p) => (p.bot = true));
    let now = 4000;
    for (let i = 0; i < 20000 && room.phase !== "winner"; i++) {
      if (room.phase === "turn" || room.phase === "challenge")
        botAct(room, now);
      else tick(room, Math.max(now, room.deadline));
      now += 10;
      assert.equal(
        countCards(room),
        52,
        `Card conservation failed with ${n} players`,
      );
      const ids = [...room.pile, ...room.players.flatMap((p) => p.hand)].map(
        (c) => c.id,
      );
      assert.equal(new Set(ids).size, 52);
    }
    assert.equal(room.phase, "winner", `Bot game for ${n} players must finish`);
    assert.equal(
      room.players.find((p) => p.id === room.winnerId)?.hand.length,
      0,
    );
  }
});
