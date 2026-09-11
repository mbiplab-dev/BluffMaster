import test from "node:test";
import assert from "node:assert/strict";
import { layoutHand } from "../src/handLayout.js";

test("selections open a full gap and every card stays within the hand at phone, tablet and desktop widths", () => {
  for (const width of [280, 330, 400, 540, 700, 900]) {
    const count = width < 440 ? 6 : width < 650 ? 10 : 14;
    for (const choices of [[], [0], [3], [count - 1], [1, 3], [0, 2, 4, 5]]) {
      const selected = new Set(choices);
      const layout = layoutHand(count, selected, width, 145);
      assert.ok(layout.cardWidth >= 25);
      layout.cards.forEach((position, i) => {
        assert.ok(
          Math.abs(position.x) + layout.cardWidth / 2 <= width / 2 - 10,
        );
        if (i && (selected.has(i) || selected.has(i - 1)))
          assert.ok(
            position.x - layout.cards[i - 1].x >= layout.cardWidth + 13.99,
          );
      });
    }
  }
});
