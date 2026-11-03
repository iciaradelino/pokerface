# Pokerface: Project Plan

How we split the MVP (see [README.md](README.md)) across 6 people. Each member owns one area end to end: design, code, tests and demo. Owners can ask for help, but they decide how their part works and make sure it gets done.

## Overview

| # | Area | Owner | Main output |
|---|------|-------|-------------|
| 1 | Gesture control | _Member 1_ | Browser module that turns the webcam feed into poker actions |
| 2 | Poker engine | _Member 2_ | Pure Hold'em rules library with tests |
| 3 | Game server & real-time sync | _Member 3_ | Authoritative WebSocket server that runs tables |
| 4 | Video & WebRTC | _Member 4_ | Camera capture and peer-to-peer video between players |
| 5 | Table visuals & in-game UI | _Member 5_ | Table, cards, chips, seats and action controls |
| 6 | Lobby, onboarding, integration & QA | _Member 6_ | Create/join flow, tutorial, deployment, end-to-end testing |

```
 Browser (each player)                                  Server
┌──────────────────────────────────────────┐        ┌────────────────────────┐
│ [4] Camera / WebRTC ──► video tiles      │◄─P2P──►│                        │
│ [1] Gestures ──► action ─┐               │        │ [3] Rooms / WebSocket  │
│ [5] Table UI ◄── state   ├── WebSocket ──┼───────►│        │               │
│ [6] Lobby / tutorial     │               │        │ [2] Poker engine       │
└──────────────────────────┴───────────────┘        └────────────────────────┘
```

---

## 1. Gesture control (Member 1)

Builds on the existing prototype in `prototype/gestures/`.

**Scope**
- Turn the prototype into a reusable module: `createGestureController(videoEl, options)` that emits `{ action, amount? }` events.
- Gestures: check (double tap), call (thumbs up), fold (thumbs down), raise (palm up/down + fist to confirm), all-in (both hands forward).
- Hold-to-confirm with a progress value the UI can draw as a ring.
- Cooldown, confidence thresholds, and on/off control (only active on your turn).
- Raise amount limits come from the game state (min raise, stack), not hardcoded.
- Optional: short calibration step (hand size, lighting check) that Member 6 can use in the tutorial.

**Done when**
- Accuracy is measured on at least 5 people in different lighting (the prototype's stats panel can be reused), and the results are written down.
- False positives are rare enough that nobody acts by accident during normal talking or moving.
- The module has no knowledge of the network or the table UI.

**Depends on:** Member 5 for the progress ring and raise meter visuals, Member 2/3 for the current betting limits.

---

## 2. Poker engine (Member 2)

**Scope**
- Pure, framework-free game logic (no network, no timers): deck, shuffle (secure RNG), deal.
- Hand loop: blinds, dealer button rotation, preflop/flop/turn/river betting, showdown.
- Action validation: legal actions for the current player, min raise, all-in rules.
- Side pots when players are all-in for different amounts.
- Hand evaluation and tie-breaking / split pots.
- `getPublicState()` and `getPrivateState(playerId)` so hole cards never leak.

**Done when**
- Unit tests cover betting rounds, side pots, split pots, heads-up blind rules and all hand rankings.
- A scripted full hand can be run in a test with no server.

**Depends on:** nothing. This can start right away and should define the action/state formats early (see "Shared contracts").

---

## 3. Game server & real-time sync (Member 3)

**Scope**
- Node server with WebSockets (e.g. `ws` or Socket.IO).
- Rooms/tables: create, join by code/link, seat players (2–6), leave.
- Runs the poker engine for each table; validates every incoming action against it.
- Pushes state updates: public state to everyone, private hole cards only to their owner.
- Turn timer (auto-fold/check on timeout).
- Reconnection: a player who refreshes gets their seat and cards back.
- Acts as the **signaling channel** for WebRTC (relays offers/answers/ICE between peers for Member 4).

**Done when**
- Several browser tabs can play a full hand together using only the fallback buttons.
- Sending an illegal action or someone else's action is rejected.
- Hole cards of other players never appear in network traffic (check in dev tools).

**Depends on:** Member 2's engine API; Member 4 for the signaling message format.

---

## 4. Video & WebRTC (Member 4)

**Scope**
- Camera/mic permission flow, device selection, mute/camera-off.
- Peer-to-peer mesh between all players at a table (up to 6), using Member 3's server for signaling.
- STUN config (and TURN if possible, for players behind strict NATs).
- Share the local camera stream with Member 1's gesture module (one `getUserMedia`, used twice).
- Handle players joining/leaving mid-game and dropped connections.
- Bandwidth management: lower resolution/frame rate for remote tiles when needed.

**Done when**
- 4–6 players on different networks see each other with acceptable latency.
- Joining, leaving and reconnecting don't break other players' video.
- A short note on when we'd need to move to an SFU (e.g. LiveKit).

**Depends on:** Member 3 for signaling; Member 5 for where tiles go on screen.

---

## 5. Table visuals & in-game UI (Member 5)

**Scope**
- Frontend app setup (e.g. React + Vite) shared by everyone on the client side.
- Central table: community cards, pot(s), dealer button, blinds.
- Seats around the table holding each player's video tile, name, stack, current bet and status (folded, all-in, thinking).
- Your own hole cards, visible only on your screen.
- Active player highlight and turn timer ring.
- Gesture feedback: hold-to-confirm progress ring and raise amount meter on your tile.
- **Fallback buttons** (check/call/fold/raise slider/all-in) that are always available.
- Animations: dealing, chips moving to the pot, showdown reveal, winner highlight.
- Responsive layout for 2–6 seats.

**Done when**
- The full hand loop can be followed visually without reading logs.
- Works with mock state before the server is ready, and with real state after.

**Depends on:** shared state format (Members 2/3), video streams (Member 4), gesture events (Member 1).

---

## 6. Lobby, onboarding, integration & QA (Member 6)

**Scope**
- Landing page: create a table, get a shareable link, join with a name.
- Pre-game "green room": camera preview, gesture check, ready button.
- Gesture tutorial/calibration before the first hand (uses Member 1's module).
- Integration lead: keeps the shared contracts doc up to date, runs weekly integration sessions, merges parts together.
- Repo setup: monorepo structure, linting/formatting, CI running tests on every PR.
- Deployment (e.g. Render/Fly.io for the server, HTTPS required for camera access).
- End-to-end test plan and playtesting sessions; collects bugs and feedback.
- Privacy basics: clear camera permission messaging, no recording.

**Done when**
- A new person can open a link, set up their camera, learn the gestures and play a hand without help.
- The app is deployed at a public HTTPS URL and CI is green.

**Depends on:** everyone. This person checks that the parts actually fit together.

---

## Shared contracts (agree in week 1)

These are the boundaries between parts. Changes need a heads-up to the affected owners.

- **Action** (client → server): `{ type: "action", action: "check" | "call" | "fold" | "raise" | "allin", amount?: number }`
- **Public table state** (server → all): seats, stacks, bets, pot(s), community cards, stage, current player, dealer, timer.
- **Private state** (server → one player): their hole cards and legal actions (with min/max raise).
- **Signaling** (client ↔ server ↔ client): `{ type: "signal", to, from, data }` for WebRTC offers/answers/ICE.
- **Gesture events** (gesture module → UI): `progress(action, 0..1)`, `raiseAmount(n)`, `fire(action, amount?)`.

Suggested repo layout:

```
/packages
  /engine     (Member 2)
  /server     (Member 3)
  /client     (Members 1, 4, 5, 6)
    /gestures (Member 1)
    /video    (Member 4)
    /table    (Member 5)
    /lobby    (Member 6)
/prototype    (existing experiments)
```

## Milestones

| Week | Goal |
|------|------|
| 1 | Contracts agreed, repo set up, everyone has a hello-world of their part |
| 2–3 | Engine passes tests; server runs a hand with buttons; video works between 2 peers; gesture module extracted from prototype; table renders mock state |
| 4 | **First integration:** 2+ players play a full hand with buttons and video |
| 5 | Gestures connected to real turns; lobby and join-by-link working |
| 6 | 6-player playtest, tutorial, deployment |
| 7 | Bug fixing, polish, final demo |

## Working agreements

- One branch per feature, PR into `main`, at least one review from another member.
- Weekly sync (30 min): what's done, what's blocked, any contract changes.
- Each owner keeps a short README in their package explaining how to run and test it.
