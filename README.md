# BLUFF · Trust nobody. Play everybody.

A multiplayer Bluff / Cheat game for 2–8 players. Built with React, TypeScript, a server-authoritative Socket.IO engine, durable SQLite rooms, and optional peer-to-peer voice chat.

## Run locally

Use Node **22.13+** (Node 24 LTS recommended).

```sh
npm install
npm run dev
```

Open **http://localhost:3000**. A practice table with three server-controlled opponents opens automatically. Use **Create a room** to invite real players. Guests can open the invite link or enter the six-character code in **Join friends**. No accounts or API keys are required for the game.

For multiple local players, use separate browser profiles, private windows, or tabs. Each tab gets its own resume identity in session storage. Reloading or reconnecting the same tab restores its seat. Names and avatar preferences are saved locally.

Choose **Public** when creating a table to list it in **Rooms**, or **Private** to keep it invite-code only. The live directory offers **Join** before play and **Watch** after the deal. Private codes are invitation secrets, not passwords; don't share them publicly.

The colorful single-screen table adapts to desktop, tablet, portrait phones, and landscape phones. Smaller hands use card pages instead of shrinking the entire deck. Selected cards open space on both sides; selections persist across pages. Card flights target the actual recipient's hand, and a compact HUD keeps the current turn separate from the previous player's claimed rank and card count.

The practice table always uses round-locked rules, including when restoring an older table. Round changes announce the new starter. Pickups prepend cards in pile order, return the hand to its first page, and mark received cards NEW. Flights arrive in staggered left-to-right hand slots; overflow lands at the visible stack edge. Card ranges and the Next control make additional pages explicit. The center pile uses measured player/deck bounds, while claims stay at a readable text size (for example, “2 cards of 10”).

Voice commands use the compact microphone button in the top bar; there is no lower prompt strip. Activity entries carry the player's public name/avatar, including after they leave. Customize the randomized play commentary in `server/commentary.ts`: `PLAY_LINES.setups` and `PLAY_LINES.replies` provide 36 pairings, with immediate repeats avoided. The server chooses the wording once and synchronizes it to the room.

## Room safeguards

| Limit           | Behavior                                                                                |
| --------------- | --------------------------------------------------------------------------------------- |
| Players         | 2–8; new players cannot enter an active deal                                            |
| Spectators      | 8 per room; cannot play, vote, or join player voice chat                                |
| Cards per play  | Any number of owned cards (1–52), validated against the actor's private hand            |
| Vote kick       | Strict majority of seated players: 3 of 4, 5 of 8; minimum 3 seated players             |
| Vote timing     | One open vote, 30-second expiry, 60-second initiation cooldown per player               |
| Room actions    | 5 creates and 20 join attempts per identity per minute                                  |
| Traffic         | 30 commands/second per connection; 24 KB message ceiling                                |
| Server capacity | 500 rooms, 2,000 connections, 10,000 retained identities; directory capped at 100 rooms |

Open **Players** using the player-count button to start or join a kick vote. The target cannot vote for themselves; spectators, duplicate votes, and automated seats cannot vote. The threshold includes all occupied seats, including disconnected and automated players, so they cannot lower the majority needed. Roster changes cancel a pending vote. A successful removal revokes that identity's room access. During play, a fresh automated identity inherits the exact seat and cards so the game stays valid; host ownership transfers to a connected player. A room accepts at most 100 successful removals to bound its ban list.

These are anonymous guest identities, not authenticated accounts: clearing storage or using another browser can bypass an identity ban. Account-backed bans, abuse reporting, and edge/IP connection throttling are deployment extensions, not implemented guarantees.

## Play

1. The default is **round-locked Bluff**. The first player to play chooses a rank for the entire round. Select any number of your cards and press **Play cards**; their real ranks do not have to match the claim.
2. Other players have eight seconds to **Believe it** or **CALL BLUFF**. Accepting is final for that claim. The first valid challenge wins the race.
3. A challenge reveals only the last play. If any card differs from the locked rank, its owner picks up the entire pile and the challenger wins. Otherwise the challenger takes the pile and the player who made the claim wins. **The challenge winner starts a fresh round and chooses its rank.**
4. Each player gets exactly one clockwise turn per round, playing the locked rank or passing. The starter does not take a second turn. With no challenge, the next round starts one seat after the old starter: A→B→C→D, then B→C→D→A, then C→D→A→B. Passing (including a timeout) consumes that seat's turn. If the starter passes, the first actual play locks the rank. If everyone passes, the starter still rotates. Unchallenged pile cards stay on the table across rounds.
5. The first empty hand wins **after** the final claim survives acceptance or challenge. A caught final-card bluff does not win.

The host can change turn duration, challenge duration, and game variant between games in Preferences. Round-locked is the default; the earlier free-choice and ascending variants remain optional. Invite details include player readiness and host controls to move players to spectator seats. In-progress games accept spectators; existing players can rejoin their saved seats. Existing pre-round saved games upgrade at their current seat without redealing cards.

## Voice and accessibility

- **Join voice chat** requests microphone permission explicitly. Leaving stops every audio track, closes connections, and mutes the player. Mic badges and speaking rings reflect server-relayed activity.
- Voice commands use the browser's Speech Recognition API when available. Try “Bluff”, “I challenge”, “Pass”, “Ready”, “I claim Kings”, or “Play two cards”. Playing by voice uses the cards you have already selected. Rank selection alone never submits cards.
- Turn on **Push to talk** in Preferences, then hold **Space** to dictate a command. This setting controls recognition, independently of room voice chat.
- **B** calls bluff during a challenge; **Escape** clears a hand selection. Cards support Tab and Enter/Space. Modal dialogs trap focus natively.
- Every action has a visual control. Speech recognition and microphone failures show helpful fallbacks. Sound effects and higher contrast have independent preferences. Reduced-motion preferences are respected.
- Speech availability depends on browser, device, permissions, language, and the browser's recognition service. It may transmit speech to the browser vendor. It is not required to play.

## Production

```sh
npm run build
npm start
```

The same server serves the optimized client, HTTP API, and WebSocket connections on `PORT` (default 3000). Deploy behind **HTTPS**; microphone APIs require a secure context except on localhost. Preserve WebSocket upgrades and use a proxy idle timeout above the Socket.IO heartbeat interval.

Rooms and opaque session identities persist to `.data/bluff.sqlite`, with WAL journaling and restricted file permissions. Mount this directory on persistent storage. A restart marks human players disconnected until they resume. Back up the database using a SQLite-aware backup process. Do not expose the data directory; production serves only `dist`, and the development server explicitly denies `.data` access.

Run **one authoritative server process per database**. SQLite durability does not provide distributed game coordination. Horizontal scaling would require shared room ownership, shared timers, and a Socket.IO adapter; do not run multiple replicas against this implementation's room store.

Optional environment configuration (see `.env.example`; variables must be supplied by your shell or hosting platform):

| Variable          | Purpose                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| `PORT`            | HTTP and Socket.IO port, default `3000`                                                         |
| `BLUFF_DATABASE`  | SQLite file path; `:memory:` for isolated tests                                                 |
| `VOICE_CHAT`      | Set to `false` to disable voice chat without affecting gameplay                                 |
| `PUBLIC_ORIGIN`   | Exact browser origin, e.g. `https://bluff.example.com`; rejects other browser handshake origins |
| `TURN_URL`        | TURN relay endpoint, for example `turn:relay.example.com:3478`                                  |
| `TURN_USERNAME`   | Relay username                                                                                  |
| `TURN_CREDENTIAL` | Relay credential                                                                                |

Voice uses a modular WebRTC audio mesh. A public STUN server is configured by default. For reliable voice across restrictive NAT/firewall combinations, supply a TURN relay. Relay connection information is necessarily delivered to voice clients; use dedicated, scoped relay credentials. Real-world latency and audio quality depend on networks and devices.

Docker deployment:

```sh
docker build -t bluff .
docker run --name bluff -p 3000:3000 -v bluff-data:/app/.data bluff
```

TLS termination and TURN service provisioning are deployment responsibilities. The app is implemented locally; it is not automatically published to an external host.

Browser WebSocket handshakes must match `PUBLIC_ORIGIN`, or the request host when it is unset. Preserve the public Host header at your proxy or set this variable explicitly. Native clients without an Origin header remain allowed and must still pass game validation. Apply connection/IP throttling at the edge: anonymous identities and application capacity limits are not DDoS protection. Before a public launch, load-test your actual host and test real microphones, mobile browsers, and TURN traversal; synthetic local tests do not certify those environments.

## Architecture and trust boundary

```text
src/                 React UI, CSS table/card animations, audio and voice hooks
shared/types.ts      Public snapshot protocol and card/rank types
server/engine.ts     Deck, rule validation, turn phases, challenges, win detection
server/index.ts      Socket sessions, private snapshot routing, rooms and timers
server/storage.ts    Durable room and resume-identity storage
server/protocol.ts   Runtime command validation before mutation
server/moderation.ts Majority voting, expiry, cooldowns, and safe seat replacement
tests/               Engine, storage, real socket, and browser integration tests
```

The server cryptographically shuffles a complete 52-card deck and validates ownership, uniqueness, count, rank, actor, phase, and challenge eligibility. Clients never send truth/winner results. Public player objects contain card counts, never hands. Unrevealed claims contain no card identities. Spectators receive no private hand. Bots select from their own hand and public claims only.

Commands carry unique action IDs and are deduplicated per session, including reconnect retries. Timers run on the server; clients render a synchronized countdown. Signaling is limited to authenticated voice participants in the same room. Payload limits and command rate limits reject malformed or excessive traffic.

On a lost connection, the seat and cards remain reserved. After 45 seconds, an automatic player keeps an in-progress game moving; returning with the same identity takes the seat back. Explicit departures hand over immediately. Host ownership moves to a connected human. Empty rooms expire after 30 minutes; inactive session identities expire after 24 hours. A closed tab cannot be recovered in an unrelated browser without its resume token.

## Verification

```sh
npm test
npx playwright install chromium
npm run test:e2e
npm run build
```

The suite covers 2–8 player deals and live synchronization; private-card serialization; both challenge outcomes; last-card wins; ascending ranks; timing; invalid and duplicate commands; host migration; reconnects; spectators; persistence; mouse/keyboard controls; mobile overflow; speech command handling and fallbacks; and network interruption. Browser tests use mocked speech recognition and synthetic microphone devices where appropriate, not a claim of hardware speech accuracy. Test screenshots and failure traces are saved under `test-results`.

Additional checks cover public/private directory filtering, the spectator cap, concurrent kick votes and blocked rejoining, vote cooldowns/expiry, hand conservation during eviction, persistent last-play summaries, and eight-player layouts at phone/tablet/desktop sizes.

There are no third-party images or paid asset dependencies. Typography is self-hosted; cards and the felt table are rendered in CSS. Game sound effects are synthesized after a user gesture.
