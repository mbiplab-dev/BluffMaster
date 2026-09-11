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
  cardsPerPlay: 4,
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
} as const;
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
  rankMode: "free" | "ascending";
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
