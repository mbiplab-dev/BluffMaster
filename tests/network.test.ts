import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { io, type Socket } from "socket.io-client";
import type { Snapshot, Reply, OpenRoom } from "../shared/types.js";

let server: ChildProcess;
const url = "http://127.0.0.1:3107";
const clients: Socket[] = [];
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
before(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    env: { ...process.env, PORT: "3107", BLUFF_DATABASE: ":memory:" },
    stdio: "pipe",
  });
  let stderr = "";
  server.stderr?.on("data", (b) => (stderr += String(b)));
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(`${url}/api/health`)).ok) return;
    } catch {
      /* Server is starting. */
    }
    if (server.exitCode !== null) throw new Error(stderr);
    await pause(100);
  }
  throw new Error(`Test server did not start: ${stderr}`);
});
after(() => {
  clients.forEach((s) => s.disconnect());
  server?.kill("SIGTERM");
});

async function connect(token?: string) {
  const socket = io(url, {
    auth: { token },
    autoConnect: false,
    reconnection: false,
  });
  clients.push(socket);
  let state: Snapshot | undefined;
  let directory: OpenRoom[] = [];
  socket.on("rooms", (rooms) => (directory = rooms));
  socket.on("state", (s) => (state = s));
  const session = new Promise<{ token: string; selfId: string }>((resolve) =>
    socket.once("session", resolve),
  );
  socket.connect();
  const identity = await session;
  return {
    socket,
    identity,
    state: () => state!,
    directory: () => directory,
    act: async (
      type: string,
      payload: Record<string, unknown> = {},
      id = randomUUID(),
    ): Promise<Reply> =>
      socket.timeout(3000).emitWithAck("command", { type, payload, id }),
    wait: async (condition: (state: Snapshot) => boolean) => {
      for (let i = 0; i < 100; i++) {
        if (state && condition(state)) return state;
        await pause(50);
      }
      throw new Error(`State did not arrive: ${state?.phase}`);
    },
  };
}

for (let count = 2; count <= 8; count++) {
  test(`${count} live clients synchronize ready, deal, private cards and actions`, async () => {
    const group = await Promise.all(
      Array.from({ length: count }, () => connect()),
    );
    const host = group[0];
    assert.equal((await host.act("create", { name: "Host" })).ok, true);
    const code = host.state().code;
    for (let i = 1; i < count; i++) {
      assert.equal(
        (await group[i].act("join", { code, name: `Friend ${i}` })).ok,
        true,
      );
      await group[i].act("ready");
    }
    if (count === 8) {
      const extra = await connect();
      const denied = await extra.act("join", { code, name: "Ninth player" });
      assert.equal(denied.ok, false);
      assert.match(denied.error!, /full/);
      assert.equal((await extra.act("spectate", { code })).ok, true);
      assert.equal(extra.state().spectator, true);
      extra.socket.disconnect();
    }
    assert.equal((await host.act("start")).ok, true);
    await host.wait((s) => s.phase === "turn");
    for (const client of group) {
      await client.wait((s) => s.phase === "turn");
      assert.equal(client.state().players.length, count);
      assert.equal(client.state().turnId, host.identity.selfId);
      assert.ok(client.state().players.every((p) => !("hand" in p)));
    }
    const allCards = group.flatMap((c) => c.state().hand);
    assert.equal(allCards.length, 52);
    assert.equal(new Set(allCards.map((c) => c.id)).size, 52);
    const stolen = group[1].state().hand[0];
    assert.equal(
      (await host.act("play", { ids: [stolen.id], rank: "A" })).ok,
      false,
    );
    const played = host.state().hand.slice(0, 2);
    const commandId = randomUUID();
    assert.equal(
      (
        await host.act(
          "play",
          { ids: played.map((c) => c.id), rank: "K" },
          commandId,
        )
      ).ok,
      true,
    );
    assert.equal(
      (
        await host.act(
          "play",
          { ids: played.map((c) => c.id), rank: "K" },
          commandId,
        )
      ).ok,
      true,
    );
    await group[1].wait((s) => s.phase === "challenge");
    assert.equal(host.state().pileCount, 2);
    for (const hidden of played)
      assert.ok(!JSON.stringify(group[1].state()).includes(hidden.id));
    if (count === 3) {
      const race = await Promise.all([
        group[1].act("bluff"),
        group[2].act("bluff"),
      ]);
      assert.equal(race.filter((r) => r.ok).length, 1);
    } else assert.equal((await group[1].act("bluff")).ok, true);
    assert.equal((await group[1].act("bluff")).ok, false);
    await host.wait((s) => s.phase === "reveal");
    assert.equal(host.state().reveal?.cards.length, 2);
    group.forEach((c) => c.socket.disconnect());
  });
}
test("browser connections reject foreign origins and accept the same host", async () => {
  const foreign = io(url, {
    autoConnect: false,
    reconnection: false,
    extraHeaders: { Origin: "https://foreign.example" },
  });
  clients.push(foreign);
  const rejected = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Foreign origin was not rejected")),
      3000,
    );
    foreign.once("connect_error", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  foreign.connect();
  await rejected;
  foreign.disconnect();
  const same = io(url, {
    autoConnect: false,
    reconnection: false,
    extraHeaders: { Origin: url },
  });
  clients.push(same);
  const accepted = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Same origin was not accepted")),
      3000,
    );
    same.once("session", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  same.connect();
  await accepted;
  same.disconnect();
});

test("public directory, in-game spectator cap, and rejected joins preserve existing rooms", async () => {
  const host = await connect();
  const guest = await connect();
  const observer = await connect();
  await host.act("create", { name: "Discoverable", visibility: "public" });
  const code = host.state().code;
  await guest.act("create", { name: "Private" });
  const privateCode = guest.state().code;
  await pause(60);
  assert.ok(
    observer.directory().some((r) => r.code === code && r.status === "waiting"),
  );
  assert.ok(!observer.directory().some((r) => r.code === privateCode));
  assert.equal((await guest.act("join", { code })).ok, true);
  await guest.act("ready");
  await host.act("start");
  await pause(60);
  assert.ok(
    observer.directory().some((r) => r.code === code && r.status === "playing"),
  );
  const watchers = await Promise.all(
    Array.from({ length: 8 }, () => connect()),
  );
  for (const watcher of watchers) {
    assert.equal((await watcher.act("spectate", { code })).ok, true);
    assert.deepEqual(watcher.state().hand, []);
    assert.equal(
      (await watcher.act("vote-kick", { targetId: host.identity.selfId })).ok,
      false,
    );
  }
  await observer.act("create", { name: "Safe room" });
  const safeCode = observer.state().code;
  assert.equal((await observer.act("join", { code })).ok, false);
  const denied = await observer.act("spectate", { code });
  assert.equal(denied.ok, false);
  assert.match(denied.error!, /full/);
  assert.equal(observer.state().code, safeCode);
  await pause(60);
  assert.ok(!observer.directory().some((r) => r.code === code));
  watchers[0].socket.disconnect();
  await host.wait((s) => s.spectators === 7);
  assert.equal((await observer.act("spectate", { code })).ok, true);
  await host.wait((s) => s.spectators === 8);
  [host, guest, observer, ...watchers].forEach((c) => c.socket.disconnect());
});

test("concurrent vote kicks evict once, keep the active hand, migrate host and reject rejoining", async () => {
  const group = await Promise.all(Array.from({ length: 4 }, () => connect()));
  const [host, ...voters] = group;
  await host.act("create", { name: "Target" });
  const code = host.state().code;
  for (const voter of voters) {
    await voter.act("join", { code, name: "Voter" });
    await voter.act("ready");
  }
  await host.act("start");
  await host.wait((s) => s.phase === "turn");
  let removals = 0;
  host.socket.on("removed", () => removals++);
  const targetId = host.identity.selfId;
  await voters[0].act("vote-kick", { targetId });
  assert.equal(voters[0].state().kickVote?.required, 3);
  assert.equal((await voters[0].act("vote-kick", { targetId })).ok, false);
  const results = await Promise.all(
    voters.slice(1).map((v) => v.act("vote-kick", { targetId })),
  );
  assert.ok(results.every((r) => r.ok));
  const state = await voters[0].wait(
    (s) => s.kickVote === null && !s.players.some((p) => p.id === targetId),
  );
  const replacement = state.players.find((p) => p.bot)!;
  assert.equal(replacement.count, 13);
  assert.equal(state.turnId, replacement.id);
  assert.equal(
    state.players.reduce((total, p) => total + p.count, 0),
    52,
  );
  assert.notEqual(state.hostId, targetId);
  assert.equal(removals, 1);
  for (const type of ["join", "spectate"]) {
    const denied = await host.act(type, { code });
    assert.equal(denied.ok, false);
    assert.match(denied.error!, /removed/);
  }
  group.forEach((c) => c.socket.disconnect());
});

test("disconnect migrates host; reconnect restores the same lobby seat and private hand", async () => {
  const host = await connect();
  const friend = await connect();
  await host.act("create", { name: "Host" });
  const code = host.state().code;
  await friend.act("join", { code, name: "Friend" });
  host.socket.disconnect();
  await friend.wait((s) => s.hostId === friend.identity.selfId);
  assert.equal(friend.state().players.length, 2);
  const restored = await connect(host.identity.token);
  await restored.wait((s) => s.code === code);
  assert.equal(restored.state().selfId, host.identity.selfId);
  assert.equal(restored.state().spectator, false);
  await restored.act("ready");
  await friend.act("start");
  await restored.wait((s) => s.phase === "turn");
  const cards = restored.state().hand;
  restored.socket.disconnect();
  const resumed = await connect(host.identity.token);
  await resumed.wait((s) => s.phase === "turn");
  assert.deepEqual(resumed.state().hand, cards);
  assert.equal(resumed.state().players.length, 2);
  resumed.socket.disconnect();
  friend.socket.disconnect();
});
test("spectators receive no private cards and cannot act; cross-room signaling is rejected", async () => {
  const host = await connect();
  const friend = await connect();
  const spectator = await connect();
  const outsider = await connect();
  await host.act("create", { name: "Host" });
  const code = host.state().code;
  await friend.act("join", { code, name: "Friend" });
  await friend.act("ready");
  await host.act("start");
  assert.equal(
    (await spectator.act("join", { code, name: "Too late" })).ok,
    false,
  );
  await spectator.act("spectate", { code });
  assert.equal(spectator.state().hand.length, 0);
  assert.equal(spectator.state().spectator, true);
  assert.equal((await spectator.act("bluff")).ok, false);
  assert.equal((await spectator.act("start")).ok, false);
  await outsider.act("create", { name: "Outside" });
  await outsider.act("voice", { muted: false });
  await host.act("voice", { muted: false });
  let signals = 0;
  host.socket.on("signal", () => signals++);
  outsider.socket.emit("signal", {
    to: host.identity.selfId,
    description: { type: "offer", sdp: "not-in-this-room" },
  });
  await pause(100);
  assert.equal(signals, 0);
  [host, friend, spectator, outsider].forEach((c) => c.socket.disconnect());
});
test("room capacity, malformed commands, idempotent readiness, and host permissions", async () => {
  const host = await connect();
  const guest = await connect();
  await host.act("create", { name: "Host" });
  await guest.act("join", { code: host.state().code, name: "Guest" });
  const action = randomUUID();
  await guest.act("ready", {}, action);
  await guest.act("ready", {}, action);
  assert.equal(
    guest.state().players.find((p) => p.id === guest.identity.selfId)?.ready,
    true,
  );
  assert.equal((await guest.act("settings", { turnSeconds: 60 })).ok, false);
  assert.equal(
    (
      await host.act("settings", {
        turnSeconds: 45,
        challengeSeconds: 12,
        rankMode: "ascending",
      })
    ).ok,
    true,
  );
  assert.equal(host.state().settings.turnSeconds, 45);
  assert.equal(
    (await host.socket.timeout(3000).emitWithAck("command", null)).ok,
    false,
  );
  await host.act("kick", { playerId: guest.identity.selfId });
  await guest.wait((s) => s.spectator);
  assert.equal(guest.state().hand.length, 0);
  assert.equal(host.state().players.length, 1);
  host.socket.disconnect();
  guest.socket.disconnect();
});
