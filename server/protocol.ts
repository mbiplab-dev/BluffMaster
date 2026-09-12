import { RANKS, REACTIONS, type Command, LIMITS } from "../shared/types.js";

const allowed = new Set([
  "create",
  "practice",
  "join",
  "spectate",
  "ready",
  "start",
  "play",
  "accept",
  "bluff",
  "pass",
  "settings",
  "kick",
  "vote-kick",
  "voice",
  "reaction",
  "leave",
]);
const record = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.length > 0 && value.length <= max;
/** Validate transport shape before any room mutation; game rules remain in the engine. */
export function validateCommand(input: unknown): Command {
  if (
    !record(input) ||
    !text(input.id, 80) ||
    typeof input.type !== "string" ||
    !allowed.has(input.type)
  )
    throw new Error("Invalid game command.");
  const data = input.payload ?? {};
  if (!record(data)) throw new Error("Invalid command payload.");
  const type = input.type;
  if (["create", "practice", "join", "spectate"].includes(type)) {
    if (
      data.name !== undefined &&
      (!text(data.name, 20) ||
        !(data.name as string).trim() ||
        /[\u0000-\u001f\u007f]/.test(data.name as string))
    )
      throw new Error("Use a name with 1–20 printable characters.");
    if (
      data.avatar !== undefined &&
      (typeof data.avatar !== "number" ||
        !Number.isInteger(data.avatar) ||
        data.avatar < 0 ||
        data.avatar > 7)
    )
      throw new Error("Choose a valid avatar.");
    if (
      data.visibility !== undefined &&
      data.visibility !== "public" &&
      data.visibility !== "private"
    )
      throw new Error("Choose public or private.");
  }
  if (
    ["join", "spectate"].includes(type) &&
    (typeof data.code !== "string" || !/^[A-Z0-9]{6}$/i.test(data.code.trim()))
  )
    throw new Error("Enter a six-character room code.");
  if (
    type === "play" &&
    (!Array.isArray(data.ids) ||
      data.ids.length < 1 ||
      data.ids.length > LIMITS.cardsPerPlay ||
      data.ids.some((id) => !text(id, 80)) ||
      !RANKS.includes(data.rank as never))
  )
    throw new Error("Select 1–52 cards and a valid rank.");
  if (
    ["kick", "vote-kick"].includes(type) &&
    !text(type === "kick" ? data.playerId : data.targetId, 80)
  )
    throw new Error("Choose a player.");
  if (
    type === "voice" &&
    (typeof data.muted !== "boolean" ||
      (data.speaking !== undefined && typeof data.speaking !== "boolean"))
  )
    throw new Error("Invalid microphone status.");
  if (type === "reaction" && !REACTIONS.includes(data.emoji as never))
    throw new Error("Choose a table reaction.");
  if (type === "settings") {
    if (
      data.turnSeconds !== undefined &&
      ![20, 30, 45, 60].includes(data.turnSeconds as number)
    )
      throw new Error("Invalid turn duration.");
    if (
      data.challengeSeconds !== undefined &&
      ![5, 8, 12].includes(data.challengeSeconds as number)
    )
      throw new Error("Invalid challenge duration.");
    if (
      data.rankMode !== undefined &&
      data.rankMode !== "round" &&
      data.rankMode !== "free" &&
      data.rankMode !== "ascending"
    )
      throw new Error("Invalid rank sequence.");
  }
  return { id: input.id as string, type, payload: data };
}
