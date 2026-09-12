import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  player,
  startGame,
  tick,
  playCards,
  passTurn,
  callBluff,
  acceptClaim,
  snapshot,
  botAct,
  type Room,
} from "../server/engine.js";
import { voteToKick } from "../server/moderation.js";

function game(count = 4) {
  const room = createRoom("ROUND1", player("A", "A"));
  for (let i = 1; i < count; i++) {
    const p = player(String.fromCharCode(65 + i), String.fromCharCode(65 + i));
    p.ready = true;
    room.players.push(p);
  }
  startGame(room, "A", 1000);
  tick(room, 3200);
  return room;
}
function acceptAll(room: Room) {
  const actor = room.claim!.playerId;
  for (const p of room.players)
    if (p.id !== actor) acceptClaim(room, p.id, 4000);
}
function resolve(room: Room) {
  tick(room, room.deadline);
  tick(room, room.deadline);
}
test("practice games always start with the same round-locked rules as multiplayer", () => {
  const r = game();
  r.phase = "winner";
  r.practice = true;
  r.settings.rankMode = "free";
  r.players.forEach((p) => (p.ready = true));
  startGame(r, "A", 1000);
  tick(r, 3200);
  assert.equal(r.settings.rankMode, "round");
  playCards(r, "A", [r.players[0].hand[0].id], "10", 4000);
  acceptAll(r);
  assert.equal(r.roundRank, "10");
  assert.throws(
    () => playCards(r, "B", [r.players[1].hand[0].id], "K"),
    /locked/,
  );
  for (const id of ["B", "C", "D"]) passTurn(r, id, 5000);
  assert.equal(r.turnIndex, 1);
  assert.equal(r.round, 2);
  assert.equal(r.roundRank, null);
});
test("collected cards become the front of the hand in pile order", () => {
  const r = game();
  const card = r.players[0].hand[0];
  playCards(r, "A", [card.id], card.rank === "K" ? "A" : "K", 4000);
  callBluff(r, "D", 4100);
  const previous = [...r.players[0].hand];
  const pile = [...r.pile];
  tick(r, r.deadline);
  assert.deepEqual(r.players[0].hand, [...pile, ...previous]);
});
for (let n = 2; n <= 8; n++)
  test(`${n}-player rounds give everyone exactly one turn and rotate the starter`, () => {
    const r = game(n);
    assert.equal(r.settings.rankMode, "round");
    for (let round = 0; round < n + 1; round++) {
      const starter = round % n;
      assert.equal(r.round, round + 1);
      assert.equal(r.roundStarterIndex, starter);
      assert.equal(r.roundRank, null);
      for (let turn = 0; turn < n; turn++) {
        const index = (starter + turn) % n;
        assert.equal(r.turnIndex, index);
        assert.equal(r.turnsTaken, turn);
        if (turn < 2) {
          playCards(
            r,
            r.players[index].id,
            [r.players[index].hand[0].id],
            round % 2 === 0 ? "5" : "Q",
            4000,
          );
          assert.equal(r.roundRank, round % 2 === 0 ? "5" : "Q");
          if (turn < n - 1) assert.equal(r.round, round + 1);
          acceptAll(r);
        } else passTurn(r, r.players[index].id, 4000);
      }
    }
  });
test("passing, timeout and an all-pass round consume seats without locking or repeating a turn", () => {
  const r = game();
  passTurn(r, "A", 4000);
  assert.equal(r.roundRank, null);
  tick(r, r.deadline);
  assert.equal(r.turnIndex, 2);
  assert.equal(r.turnsTaken, 2);
  playCards(r, "C", [r.players[2].hand[0].id], "9", 5000);
  acceptAll(r);
  assert.equal(r.roundRank, "9");
  assert.equal(r.turnIndex, 3);
  passTurn(r, "D", 6000);
  assert.equal(r.round, 2);
  assert.equal(r.turnIndex, 1);
  assert.equal(r.roundRank, null);
  for (let i = 0; i < 4; i++) passTurn(r, r.players[r.turnIndex].id, 7000 + i);
  assert.equal(r.round, 3);
  assert.equal(r.turnIndex, 2);
  assert.equal(r.roundRank, null);
});
test("wrong-rank attempts and invalid ownership never mutate the rank, turn or hand", () => {
  const r = game();
  const before = JSON.stringify(snapshot(r, "A"));
  assert.throws(() => playCards(r, "A", ["foreign"], "5"), /only play/);
  assert.equal(
    JSON.stringify(snapshot(r, "A")).replace(/"serverNow":\d+/, ""),
    before.replace(/"serverNow":\d+/, ""),
  );
  playCards(r, "A", [r.players[0].hand[0].id], "5", 4000);
  acceptAll(r);
  const hand = [...r.players[1].hand];
  assert.throws(() => playCards(r, "B", [hand[0].id], "K"), /locked/);
  assert.deepEqual(r.players[1].hand, hand);
  assert.equal(r.roundRank, "5");
  assert.equal(r.turnIndex, 1);
});
for (const truthful of [true, false])
  test(`${truthful ? "truthful" : "lying"} challenged play awards next-round control to the challenge winner`, () => {
    const r = game();
    const c = r.players[0].hand[0];
    const rank = truthful ? c.rank : c.rank === "K" ? "A" : "K";
    playCards(r, "A", [c.id], rank, 4000);
    callBluff(r, "D", 4100);
    assert.equal(r.reveal!.winnerId, truthful ? "A" : "D");
    assert.equal(r.reveal!.loserId, truthful ? "D" : "A");
    resolve(r);
    assert.equal(r.round, 2);
    assert.equal(r.turnIndex, truthful ? 0 : 3);
    assert.equal(r.roundStarterIndex, r.turnIndex);
    assert.equal(r.roundRank, null);
    assert.equal(r.turnsTaken, 0);
    const winner = r.players[r.turnIndex];
    playCards(r, winner.id, [winner.hand[0].id], "9", 9000);
    assert.equal(r.roundRank, "9");
    acceptAll(r);
    for (let i = 1; i < 4; i++)
      passTurn(r, r.players[r.turnIndex].id, 10000 + i);
    assert.equal(r.round, 3);
    assert.equal(r.turnIndex, truthful ? 1 : 0);
  });
test("only the most recent play is revealed, while the loser takes the accumulated pile across rounds", () => {
  const r = game();
  playCards(
    r,
    "A",
    r.players[0].hand.slice(0, 3).map((c) => c.id),
    "5",
    4000,
  );
  acceptAll(r);
  for (const id of ["B", "C", "D"]) passTurn(r, id, 4100);
  assert.equal(r.round, 2);
  assert.equal(r.pile.length, 3);
  const cards = r.players[1].hand.slice(0, 2);
  playCards(
    r,
    "B",
    cards.map((c) => c.id),
    cards[0].rank,
    4200,
  );
  callBluff(r, "D", 4300);
  assert.deepEqual(r.reveal!.cards, cards);
  assert.equal(r.reveal!.pileCount, 5);
  const loser = r.players.find((p) => p.id === r.reveal!.loserId)!;
  const count = loser.hand.length;
  resolve(r);
  assert.equal(loser.hand.length, count + 5);
  assert.equal(r.pile.length, 0);
});
test("more than four cards are legal, but an empty hand only wins after its claim survives", () => {
  const r = game(2);
  const cards = [...r.players[0].hand];
  playCards(
    r,
    "A",
    cards.map((c) => c.id),
    "5",
    4000,
  );
  assert.equal(r.phase, "challenge");
  assert.equal(r.winnerId, null);
  assert.equal(r.claim!.count, 26);
  assert.equal(snapshot(r, "B").claim!.count, 26);
  assert.ok(!("cards" in snapshot(r, "B").claim!));
  callBluff(r, "B", 4100);
  resolve(r);
  assert.equal(r.winnerId, null);
  assert.equal(r.players[0].hand.length, 26);
  assert.equal(r.turnIndex, 1);
  const fresh = game(2);
  playCards(
    fresh,
    "A",
    fresh.players[0].hand.map((c) => c.id),
    "5",
    4000,
  );
  acceptAll(fresh);
  assert.equal(fresh.winnerId, "A");
});
test("evicting the challenge winner preserves their next-round starting seat", () => {
  const r = game();
  const c = r.players[0].hand[0];
  playCards(r, "A", [c.id], c.rank, 4000);
  callBluff(r, "D", 4100);
  voteToKick(r, "B", "A", 4200);
  voteToKick(r, "C", "A", 4201);
  voteToKick(r, "D", "A", 4202);
  assert.equal(r.reveal!.winnerId, r.players[0].id);
  resolve(r);
  assert.equal(r.turnIndex, 0);
  assert.equal(r.players[0].bot, true);
  assert.equal(r.round, 2);
});
test("round-locked bot games conserve the deck and finish", () => {
  for (let n = 2; n <= 8; n++) {
    const r = game(n);
    r.players.forEach((p) => (p.bot = true));
    for (let i = 0; i < 30000 && r.phase !== "winner"; i++) {
      if (r.phase === "turn" || r.phase === "challenge") botAct(r, 4000 + i);
      else tick(r, r.deadline);
      const cards = [...r.pile, ...r.players.flatMap((p) => p.hand)];
      assert.equal(cards.length, 52);
      assert.equal(new Set(cards.map((c) => c.id)).size, 52);
    }
    assert.equal(r.phase, "winner");
  }
});
