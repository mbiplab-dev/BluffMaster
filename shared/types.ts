export const RANKS = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
] as const;
export type Rank = (typeof RANKS)[number];
export const LIMITS = {
  players: 8,
  spectators: 8,
  cardsPerPlay: 52,
  voteSeconds: 30,
  voteCooldownSeconds: 60,
  commandsPerSecond: 30,
  roomCreatesPerMinute: 5,
  joinsPerMinute: 20,
  directoryRooms: 100,
  rooms: 500,
  sessions: 10000,
  connections: 2000,
  removalsPerRoom: 100,
  reactionCooldownMs: 750,
} as const;
export const REACTIONS = ["👀", "🤨", "😈", "😂", "🔥", "👏"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];
export interface Reaction {
  id: string;
  playerId: string;
  emoji: ReactionEmoji;
  at: number;
}
export interface KickVote {
  targetId: string;
  startedBy: string;
  voters: string[];
  required: number;
  expiresAt: number;
}
export type Suit = "♠" | "♥" | "♣" | "♦";
export interface Card {
  id: string;
  rank: Rank;
  suit: Suit;
}
export type Phase =
  | "lobby"
  | "dealing"
  | "turn"
  | "challenge"
  | "reveal"
  | "resolution"
  | "winner";
export interface PublicPlayer {
  id: string;
  name: string;
  avatar: number;
  count: number;
  ready: boolean;
  connected: boolean;
  bot: boolean;
  muted: boolean;
  speaking: boolean;
}
export interface Activity {
  id: string;
  text: string;
  kind: "play" | "bluff" | "info" | "win";
  at: number;
  actor?: { id: string; name: string; avatar: number };
}
export interface Claim {
  playerId: string;
  rank: Rank;
  count: number;
  accepted: string[];
}
export interface Reveal {
  cards: Card[];
  liar: boolean;
  callerId: string;
  loserId: string;
  winnerId: string;
  pileCount: number;
}
export interface LastPlay {
  playerId: string;
  rank: Rank;
  count: number;
  outcome: "pending" | "accepted" | "caught" | "truthful";
}
export interface Settings {
  turnSeconds: number;
  challengeSeconds: number;
  rankMode: "round" | "free" | "ascending";
}
export interface Snapshot {
  code: string;
  version: number;
  practice: boolean;
  visibility: "public" | "private";
  hostId: string;
  selfId: string;
  spectator: boolean;
  players: PublicPlayer[];
  spectators: number;
  hand: Card[];
  phase: Phase;
  turnId: string;
  round: number;
  roundStarterId: string;
  roundRank: Rank | null;
  turnsTaken: number;
  pileCount: number;
  claim: Claim | null;
  lastPlay: LastPlay | null;
  kickVote: KickVote | null;
  reveal: Reveal | null;
  winnerId: string | null;
  deadline: number;
  serverNow: number;
  settings: Settings;
  requiredRank: Rank;
  activity: Activity[];
}
export interface OpenRoom {
  code: string;
  hostName: string;
  avatar: number;
  players: number;
  ready: number;
  capacity: number;
  status: "waiting" | "playing";
  spectators: number;
  spectatorLimit: number;
}
export interface Command {
  id: string;
  type: string;
  payload?: Record<string, unknown>;
}
export interface Reply {
  ok: boolean;
  error?: string;
  token?: string;
  selfId?: string;
}
export const rankName = (rank: Rank, count = 2) => {
  const name =
    ({ A: "Ace", K: "King", Q: "Queen", J: "Jack" } as Record<string, string>)[
      rank
    ] || rank;
  return count === 1 ? name : `${name}s`;
};
