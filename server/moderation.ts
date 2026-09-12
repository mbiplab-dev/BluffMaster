import { randomUUID } from "node:crypto";
import { LIMITS } from "../shared/types.js";
import { log, type Room } from "./engine.js";

function check(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function cancelKickVote(room: Room) {
  if (room.kickVote) {
    room.kickVote = null;
    log(room, "The player list changed. The kick vote was cancelled.");
  }
}
export function expireKickVote(room: Room, now = Date.now()) {
  if (room.kickVote && now >= room.kickVote.expiresAt) {
    room.kickVote = null;
    log(room, "The kick vote expired without enough votes.");
    return true;
  }
  return false;
}
/** Returns an evicted identity only after a valid, strict-majority vote succeeds. */
export function voteToKick(
  room: Room,
  actor: string,
  targetId: string,
  now = Date.now(),
): string | null {
  expireKickVote(room, now);
  check(!room.practice, "Vote kick is available in multiplayer rooms.");
  check(room.players.length >= 3, "Vote kick requires at least three players.");
  const voter = room.players.find((p) => p.id === actor);
  const target = room.players.find((p) => p.id === targetId);
  check(voter?.connected && !voter.bot, "Only connected players can vote.");
  check(target && !target.bot, "Choose a human player at this table.");
  check(targetId !== actor, "You cannot vote to kick yourself.");
  if (!room.kickVote) {
    check(
      room.blockedPlayerIds.length < LIMITS.removalsPerRoom,
      "This room reached its removal limit. Create a new room to continue moderation.",
    );
    check(
      now >= (room.voteCooldowns[actor] ?? 0),
      "Wait 60 seconds between starting kick votes.",
    );
    room.kickVote = {
      targetId,
      startedBy: actor,
      voters: [],
      required: Math.floor(room.players.length / 2) + 1,
      expiresAt: now + LIMITS.voteSeconds * 1000,
    };
    room.voteCooldowns[actor] = now + LIMITS.voteCooldownSeconds * 1000;
    log(
      room,
      `${voter.name} started a vote to remove ${target.name}. ${room.kickVote.required} votes required.`,
      "info",
      voter,
    );
  }
  const vote = room.kickVote;
  check(vote.targetId === targetId, "Finish the current kick vote first.");
  check(!vote.voters.includes(actor), "You already voted.");
  vote.voters.push(actor);
  if (vote.voters.length < vote.required) return null;
  room.blockedPlayerIds.push(targetId);
  room.kickVote = null;
  if (room.phase === "lobby" || room.phase === "winner")
    room.players = room.players.filter((p) => p.id !== targetId);
  else {
    // Keep every card and the exact seat/turn, while revoking the removed person's identity.
    const replacementId = randomUUID();
    target.id = replacementId;
    target.name = `${target.name.slice(0, 14)} · Auto`;
    target.bot = true;
    target.connected = true;
    target.muted = true;
    target.speaking = false;
    target.disconnectedAt = null;
    target.ready = true;
    if (room.claim) {
      if (room.claim.playerId === targetId) room.claim.playerId = replacementId;
      room.claim.accepted = room.claim.accepted.map((id) =>
        id === targetId ? replacementId : id,
      );
    }
    if (room.lastPlay?.playerId === targetId)
      room.lastPlay.playerId = replacementId;
    if (room.reveal) {
      if (room.reveal.winnerId === targetId)
        room.reveal.winnerId = replacementId;
      if (room.reveal.callerId === targetId)
        room.reveal.callerId = replacementId;
      if (room.reveal.loserId === targetId) room.reveal.loserId = replacementId;
    }
  }
  if (room.hostId === targetId)
    room.hostId = room.players.find((p) => p.connected && !p.bot)!.id;
  log(
    room,
    `${target.name.replace(" · Auto", "")} was removed by the table's vote.`,
    "info",
    {
      id: targetId,
      name: target.name.replace(" · Auto", ""),
      avatar: target.avatar,
    },
  );
  return targetId;
}
