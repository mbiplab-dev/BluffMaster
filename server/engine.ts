import { randomInt, randomUUID } from "node:crypto";
import { playFlavor } from "./commentary.js";
import {
  RANKS,
  LIMITS,
  rankName,
  type Card,
  type Phase,
  type PublicPlayer,
  type Activity,
  type Claim,
  type Reveal,
  type Settings,
  type Snapshot,
  type Rank,
} from "../shared/types.js";

export interface Player extends PublicPlayer {
  hand: Card[];
  disconnectedAt: number | null;
}
export interface Room {
  code: string;
  version: number;
  practice: boolean;
  visibility: "public" | "private";
  hostId: string;
  players: Player[];
  spectators: Set<string>;
  phase: Phase;
  turnIndex: number;
  round: number;
  roundStarterIndex: number;
  roundRank: Rank | null;
  turnsTaken: number;
  pile: Card[];
  claim: (Claim & { cards: Card[] }) | null;
  lastPlay: Snapshot["lastPlay"];
  kickVote: Snapshot["kickVote"];
  blockedPlayerIds: string[];
  voteCooldowns: Record<string, number>;
  reveal: Reveal | null;
  winnerId: string | null;
  deadline: number;
  settings: Settings;
  requiredRank: Rank;
  activity: Activity[];
  touchedAt: number;
}
export const player = (
  id: string,
  name: string,
  avatar = 0,
  bot = false,
): Player => ({
  id,
  name: name.trim().slice(0, 20) || "Player",
  avatar: Math.abs(avatar) % 8,
  count: 0,
  ready: bot,
  connected: true,
  bot,
  muted: true,
  speaking: false,
  hand: [],
  disconnectedAt: null,
});
export function createRoom(
  code: string,
  host: Player,
  practice = false,
  visibility: "public" | "private" = "private",
): Room {
  return {
    code,
    version: 0,
    practice,
    visibility: practice ? "private" : visibility,
    hostId: host.id,
    players: [host],
    spectators: new Set(),
    phase: "lobby",
    turnIndex: 0,
    round: 1,
    roundStarterIndex: 0,
    roundRank: null,
    turnsTaken: 0,
    pile: [],
    claim: null,
    lastPlay: null,
    kickVote: null,
    blockedPlayerIds: [],
    voteCooldowns: {},
    reveal: null,
    winnerId: null,
    deadline: 0,
    settings: { turnSeconds: 30, challengeSeconds: 8, rankMode: "round" },
    requiredRank: "A",
    activity: [],
    touchedAt: Date.now(),
  };
}
export function log(
  room: Room,
  text: string,
  kind: Activity["kind"] = "info",
  actor?: string | Pick<Player, "id" | "name" | "avatar">,
) {
  const person =
    typeof actor === "string"
      ? room.players.find((p) => p.id === actor)
      : actor;
  room.activity.push({
    id: randomUUID(),
    text,
    kind,
    at: Date.now(),
    ...(person
      ? { actor: { id: person.id, name: person.name, avatar: person.avatar } }
      : {}),
  });
  room.activity = room.activity.slice(-30);
}
export function deck(): Card[] {
  const cards = RANKS.flatMap((rank) =>
    (["♠", "♥", "♣", "♦"] as const).map((suit) => ({
      id: randomUUID(),
      rank,
      suit,
    })),
  );
  for (let i = cards.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function requireRule(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function startGame(room: Room, actor: string, now = Date.now()) {
  requireRule(actor === room.hostId, "Only the host can start the game.");
  requireRule(
    room.phase === "lobby" || room.phase === "winner",
    "A game is already in progress.",
  );
  requireRule(
    room.players.length >= 2 && room.players.length <= 8,
    "You need 2–8 players.",
  );
  requireRule(
    room.players.every((p) => p.connected && (p.id === actor || p.ready)),
    "Wait for every player to be connected and ready.",
  );
  if (room.practice) room.settings.rankMode = "round";
  room.players.forEach((p) => {
    p.hand = [];
    // Readiness belongs to the lobby/rematch vote, never to the live deal.
    // `win()` creates the next vote afresh after this game ends.
    p.ready = false;
  });
  deck().forEach((c, i) => room.players[i % room.players.length].hand.push(c));
  room.players.forEach((p) =>
    p.hand.sort((a, b) => RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank)),
  );
  Object.assign(room, {
    phase: "dealing",
    pile: [],
    claim: null,
    lastPlay: null,
    reveal: null,
    winnerId: null,
    turnIndex: 0,
    round: 1,
    roundStarterIndex: 0,
    roundRank: null,
    turnsTaken: 0,
    requiredRank: "A",
    deadline: now + 2200,
  });
  log(room, "A fresh deck. A clean slate. Trust nobody.");
}
function beginTurn(room: Room, now: number) {
  room.phase = "turn";
  room.claim = null;
  room.reveal = null;
  room.deadline = now + room.settings.turnSeconds * 1000;
}
function advance(room: Room, now: number) {
  if (room.settings.rankMode === "round") {
    room.turnsTaken++;
    if (room.turnsTaken >= room.players.length) {
      beginRound(room, (room.roundStarterIndex + 1) % room.players.length, now);
      return;
    }
    room.turnIndex =
      (room.roundStarterIndex + room.turnsTaken) % room.players.length;
    beginTurn(room, now);
    return;
  }
  room.turnIndex = (room.turnIndex + 1) % room.players.length;
  if (room.turnIndex === 0) room.round++;
  if (room.settings.rankMode === "ascending")
    room.requiredRank = RANKS[(RANKS.indexOf(room.requiredRank) + 1) % 13];
  beginTurn(room, now);
}
function beginRound(room: Room, starterIndex: number, now: number) {
  room.round++;
  room.roundStarterIndex = starterIndex;
  room.turnIndex = starterIndex;
  room.turnsTaken = 0;
  room.roundRank = null;
  log(
    room,
    `Round ${room.round}: ${room.players[starterIndex].name} starts and chooses the next rank.`,
    "info",
    room.players[starterIndex],
  );
  beginTurn(room, now);
}
function win(room: Room, id: string) {
  room.phase = "winner";
  room.winnerId = id;
  room.deadline = 0;
  room.players.forEach((p) => {
    // A rematch is an explicit vote from every human at the table. Practice
    // opponents are always prepared, but the host must opt in too.
    p.ready = p.bot;
  });
  log(
    room,
    `${room.players.find((p) => p.id === id)?.name} takes the crown. Well played.`,
    "win",
    id,
  );
}
export function playCards(
  room: Room,
  actor: string,
  ids: string[],
  rank: string,
  now = Date.now(),
) {
  requireRule(room.phase === "turn", "Wait for the next turn.");
  const p = room.players[room.turnIndex];
  requireRule(p.id === actor, "It is not your turn.");
  requireRule(RANKS.includes(rank as Rank), "Choose a valid rank.");
  requireRule(
    room.settings.rankMode !== "round" ||
      room.roundRank === null ||
      rank === room.roundRank,
    `This round is locked to ${room.roundRank ? rankName(room.roundRank) : "its opening rank"}. Play that rank or pass.`,
  );
  requireRule(
    room.settings.rankMode !== "ascending" || rank === room.requiredRank,
    `Claim ${rankName(room.requiredRank)} this turn.`,
  );
  requireRule(
    Array.isArray(ids) &&
      ids.length >= 1 &&
      ids.length <= LIMITS.cardsPerPlay &&
      new Set(ids).size === ids.length,
    "Select 1–52 different cards from your hand.",
  );
  requireRule(
    ids.every((id) => p.hand.some((c) => c.id === id)),
    "You can only play cards in your hand.",
  );
  const cards = p.hand.filter((c) => ids.includes(c.id));
  if (room.settings.rankMode === "round" && room.roundRank === null)
    room.roundRank = rank as Rank;
  p.hand = p.hand.filter((c) => !ids.includes(c.id));
  room.pile.push(...cards);
  room.claim = {
    playerId: actor,
    rank: rank as Rank,
    count: cards.length,
    cards,
    accepted: [],
  };
  room.phase = "challenge";
  room.lastPlay = {
    playerId: actor,
    rank: rank as Rank,
    count: cards.length,
    outcome: "pending",
  };
  room.deadline = now + room.settings.challengeSeconds * 1000;
  log(
    room,
    `${p.name} played ${cards.length} ${rankName(rank as Rank, cards.length)}. ${playFlavor(room.activity.filter((event) => event.kind === "play").at(-1)?.text)}`,
    "play",
    p,
  );
}
function finishClaim(room: Room, now: number) {
  if (room.lastPlay) room.lastPlay.outcome = "accepted";
  const last = room.players.find((p) => p.id === room.claim?.playerId);
  if (last && last.hand.length === 0) win(room, last.id);
  else advance(room, now);
}
export function acceptClaim(room: Room, actor: string, now = Date.now()) {
  requireRule(
    room.phase === "challenge" && room.claim,
    "There is no claim to accept.",
  );
  requireRule(
    room.players.some((p) => p.id === actor) && room.claim.playerId !== actor,
    "Only other players may accept the claim.",
  );
  requireRule(
    !room.claim.accepted.includes(actor),
    "You already accepted this claim.",
  );
  room.claim.accepted.push(actor);
  if (room.claim.accepted.length === room.players.length - 1)
    finishClaim(room, now);
}
export function callBluff(room: Room, actor: string, now = Date.now()) {
  requireRule(
    room.phase === "challenge" && room.claim,
    "The challenge window has closed.",
  );
  requireRule(
    room.players.some((p) => p.id === actor) && room.claim.playerId !== actor,
    "You cannot challenge your own claim.",
  );
  requireRule(
    !room.claim.accepted.includes(actor),
    "You already accepted this claim.",
  );
  const liar = room.claim.cards.some((c) => c.rank !== room.claim!.rank);
  if (room.lastPlay) room.lastPlay.outcome = liar ? "caught" : "truthful";
  room.reveal = {
    cards: [...room.claim.cards],
    liar,
    callerId: actor,
    loserId: liar ? room.claim.playerId : actor,
    winnerId: liar ? actor : room.claim.playerId,
    pileCount: room.pile.length,
  };
  room.phase = "reveal";
  room.deadline = now + 2600;
  log(
    room,
    `${room.players.find((p) => p.id === actor)?.name} called BLUFF! ${liar ? "Caught lying." : "The claim was true."}`,
    "bluff",
    actor,
  );
}
export function passTurn(room: Room, actor: string, now = Date.now()) {
  requireRule(
    room.phase === "turn" && room.players[room.turnIndex].id === actor,
    "It is not your turn.",
  );
  log(room, `${room.players[room.turnIndex].name} passed.`, "info", actor);
  advance(room, now);
}
export function tick(room: Room, now = Date.now()): boolean {
  if (!room.deadline || now < room.deadline) return false;
  if (room.phase === "dealing") beginTurn(room, now);
  else if (room.phase === "turn") {
    log(
      room,
      `${room.players[room.turnIndex].name} ran out of time. Turn passed.`,
      "info",
      room.players[room.turnIndex],
    );
    advance(room, now);
  } else if (room.phase === "challenge") finishClaim(room, now);
  else if (room.phase === "reveal") {
    const loser = room.players.find((p) => p.id === room.reveal!.loserId)!;
    // Newly collected cards are the first visible cards, not hidden on a later hand page.
    loser.hand.unshift(...room.pile);
    room.pile = [];
    log(
      room,
      `${loser.name} picks up ${room.reveal!.pileCount} cards.`,
      "info",
      loser,
    );
    room.phase = "resolution";
    room.deadline = now + Math.max(1100, 800 + room.reveal!.pileCount * 25);
  } else if (room.phase === "resolution") {
    const empty = room.players.find((p) => p.hand.length === 0);
    if (empty) win(room, empty.id);
    else if (room.settings.rankMode === "round") {
      const starter = room.players.findIndex(
        (p) => p.id === room.reveal!.winnerId,
      );
      beginRound(room, starter, now);
    } else advance(room, now);
  } else return false;
  return true;
}
export function snapshot(room: Room, selfId: string): Snapshot {
  return {
    code: room.code,
    version: room.version,
    practice: room.practice,
    visibility: room.visibility ?? "private",
    hostId: room.hostId,
    selfId,
    spectator: !room.players.some((p) => p.id === selfId),
    spectators: room.spectators.size,
    players: room.players.map(({ hand, disconnectedAt: _, ...p }) => ({
      ...p,
      count: hand.length,
    })),
    hand: room.players.find((p) => p.id === selfId)?.hand ?? [],
    phase: room.phase,
    turnId: room.players[room.turnIndex]?.id ?? "",
    round: room.round,
    roundStarterId: room.players[room.roundStarterIndex]?.id ?? "",
    roundRank: room.roundRank,
    turnsTaken: room.turnsTaken,
    pileCount: room.pile.length,
    lastPlay: room.lastPlay ?? null,
    kickVote: room.kickVote ?? null,
    claim: room.claim
      ? {
          playerId: room.claim.playerId,
          rank: room.claim.rank,
          count: room.claim.count,
          accepted: room.claim.accepted,
        }
      : null,
    reveal: room.reveal,
    winnerId: room.winnerId,
    deadline: room.deadline,
    serverNow: Date.now(),
    settings: room.settings,
    requiredRank: room.requiredRank,
    activity: room.activity,
  };
}
/** Bots see only their own hand and public claims; they never inspect an opponent's cards. */
export function botAct(room: Room, now = Date.now()): boolean {
  if (room.phase === "turn") {
    const p = room.players[room.turnIndex];
    if (!p.bot) return false;
    const rank =
      room.settings.rankMode === "round" && room.roundRank
        ? room.roundRank
        : room.settings.rankMode === "ascending"
          ? room.requiredRank
          : p.hand[randomInt(p.hand.length)].rank;
    const honest = p.hand.filter((c) => c.rank === rank).slice(0, 3);
    const cards =
      honest.length && randomInt(10) > 2
        ? honest
        : [p.hand[randomInt(p.hand.length)]];
    playCards(
      room,
      p.id,
      cards.map((c) => c.id),
      rank,
      now,
    );
    return true;
  }
  if (room.phase === "challenge" && room.claim) {
    const p = room.players.find(
      (p) =>
        p.bot &&
        p.id !== room.claim!.playerId &&
        !room.claim!.accepted.includes(p.id),
    );
    if (!p) return false;
    const impossible =
      p.hand.filter((c) => c.rank === room.claim!.rank).length +
        room.claim.count >
      4;
    if (impossible || randomInt(10) < 2) callBluff(room, p.id, now);
    else acceptClaim(room, p.id, now);
    return true;
  }
  return false;
}
