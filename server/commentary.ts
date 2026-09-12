import { randomInt } from "node:crypto";

export const PLAY_LINES = {
  setups: [
    "Or did they?",
    "That’s their story.",
    "A very confident claim.",
    "Nothing suspicious here.",
    "Delivered with a straight face.",
    "Bold move. Very bold.",
  ],
  replies: [
    "Trust is optional.",
    "The table has questions.",
    "Poker face: activated.",
    "Your eyebrows may disagree.",
    "Someone’s feeling lucky.",
    "Let the mind games begin.",
  ],
} as const;

/** Choose once on the server so everyone sees the same joke; never inspect hidden cards. */
export function playFlavor(
  previous = "",
  choose: (max: number) => number = randomInt,
) {
  let setup = choose(PLAY_LINES.setups.length);
  const reply = choose(PLAY_LINES.replies.length);
  let text = `${PLAY_LINES.setups[setup]} ${PLAY_LINES.replies[reply]}`;
  if (previous.endsWith(text)) {
    setup = (setup + 1) % PLAY_LINES.setups.length;
    text = `${PLAY_LINES.setups[setup]} ${PLAY_LINES.replies[reply]}`;
  }
  return text;
}
