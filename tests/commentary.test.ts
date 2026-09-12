import test from "node:test";
import assert from "node:assert/strict";
import { PLAY_LINES, playFlavor } from "../server/commentary.js";
import { createRoom, player, log } from "../server/engine.js";

test("play commentary pairs configurable lines and avoids immediate repeats", () => {
  const combinations = new Set<string>();
  for (let i = 0; i < PLAY_LINES.setups.length; i++)
    for (let j = 0; j < PLAY_LINES.replies.length; j++) {
      let call = 0;
      combinations.add(playFlavor("", () => (call++ === 0 ? i : j)));
    }
  assert.equal(
    combinations.size,
    PLAY_LINES.setups.length * PLAY_LINES.replies.length,
  );
  const first = playFlavor("", () => 0);
  assert.match(first, /Or did they/);
  assert.notEqual(
    playFlavor(first, () => 0),
    first,
  );
});
test("activity captures only public identity and preserves it after players leave", () => {
  const p = player("p1", "Mia", 3);
  const room = createRoom("FEED01", p);
  log(room, "Mia played 2 Kings.", "play", p);
  assert.deepEqual(room.activity[0].actor, {
    id: "p1",
    name: "Mia",
    avatar: 3,
  });
  p.name = "Changed";
  room.players = [];
  assert.equal(room.activity[0].actor!.name, "Mia");
  assert.ok(!JSON.stringify(room.activity).includes("hand"));
});
