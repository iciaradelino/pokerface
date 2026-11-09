# Pokerface

Online Texas Hold'em where you play **face to face over webcams** and act with **hand signals** instead of clicking buttons. Reading people (and hiding your own tells) is back in the game.

## Run locally

Our local setup runs two backend services, separate databases in SQL Server, and a placeholder web page. We will build the poker and profile features on top of this.

You need Docker Desktop running and Node.js 22+. On Apple Silicon, enable Rosetta emulation in Docker Desktop and give Docker at least 4 GB of memory.

```sh
node scripts/setup-local.mjs
docker compose up --build
```

The first command generates random local passwords in `.env`. It does not overwrite an existing file. `.env` is private and ignored by Git; `.env.example` lists the available settings. Keep your `.env`: changing its passwords does not update logins in an existing database.

| Component | Address |
|---|---|
| Web page | http://localhost:5173 |
| Players health | http://localhost:3001/health |
| Game health | http://localhost:3002/health |

Compose starts SQL Server, runs `db-init` to create both databases and logins, then starts the backends. `db-init` finishing with exit code 0 is normal. Each backend applies its numbered SQL migrations once, tracked in `schema_migrations`.

`/health` writes and reads a test row, then rolls back that change. Success returns `200 {"status":"ok","db":"ok","version":"local"}`; a database failure returns 503. `APP_VERSION` sets the version. Each service can access only its own database, and SQL Server is not exposed on a host port.

In another terminal:

```sh
node scripts/smoke.mjs
docker compose logs players game
```

Stop with Ctrl+C. For detached runs, use `docker compose up --build -d --wait --wait-timeout 180`, then `docker compose stop`. `docker compose down` also keeps the database volume; adding `--volumes` deletes it. Change local ports in `.env` if needed.

### Tests

Run in each of `services/players/` and `services/game/`:

```sh
npm ci
npm test
npm run test:coverage
```

Our tests cover health responses, recovery, allowed browser origins and request logs. We still need to add the full service tests and enforce 70% coverage in CI.

With the stack running, these checks also verify database isolation, migrations and removal of health-check rows:

```sh
docker compose exec -T players node --input-type=module < scripts/check-database.mjs
docker compose exec -T game node --input-type=module < scripts/check-database.mjs
```

### Azure deployment

We are class 3A, group 5. We will use `rg-sdd-3a-g5` and name our resources with the prefix `sdd-3a-g5`. We still need the professor's group credentials and access to the resource group. We will store the credentials in GitHub Actions secrets, then set up Bicep and CI/CD in [#2](https://github.com/iciaradelino/pokerface/issues/2). Monitoring is [#16](https://github.com/iciaradelino/pokerface/issues/16).

See the [architecture guide](docs/architecture.md) for code locations, plus our [Definition of Done draft](docs/scrum/definition-of-done.md) and [Sprint 0 record](docs/scrum/sprint-0.md).

## Core experience

- Each player's browser shows the **poker table in the center** (community cards, pot, chips) with **every player's camera feed placed around it** at their seat, including your own.
- Your camera is always pointed at you. Others can see your face while you decide, just like a real table.
- You act with gestures that the app recognizes from your camera feed. Your hole cards are only visible on your own screen.

## Gestures (initial set)

| Action    | Gesture                          | Real-table equivalent      |
|-----------|----------------------------------|----------------------------|
| Check     | Tap index finger down twice      | Knocking on the table      |
| Call      | Thumbs up                        | Nod / push chips           |
| Fold      | Thumbs down                      | Mucking cards              |
| Raise     | Open palm, raise hand up/down to set amount, fist to confirm | Sliding chips forward |
| All-in    | Both hands pushed forward        | Pushing the whole stack    |

- **Confirmation:** a gesture must be held for ~1 s (progress ring on your tile) so accidental movements don't count.
- **Fallback:** on-screen buttons are always available for accessibility and when detection fails.

## How it works

- **Video:** WebRTC between players. Peer-to-peer mesh is fine for up to 6 players; switch to an SFU (e.g. LiveKit) if tables get bigger.
- **Gesture recognition:** runs in the browser (MediaPipe Hands / Gesture Recognizer). Only the recognized action is sent to the server, never the video.
- **Game server:** authoritative. It holds the deck, deals, validates actions and turn order, and pushes state to clients over WebSockets. Clients never receive other players' hole cards.
- **Frontend:** we will build the web app with React + Vite and Canvas/CSS for the table, so no install is needed.

## MVP scope

1. Create / join a private table with a link (2–6 players).
2. Camera tiles laid out around a central table.
3. Full Hold'em hand loop: blinds, deal, betting rounds, showdown, pot payout.
4. Gesture detection for check, call, fold, raise, with hold-to-confirm and button fallback.
5. Play chips only, no real money.

## Later ideas

- Short gesture tutorial / calibration before the first hand.
- Highlight the active player's tile, with a turn timer around it.
- Reactions (emoji gestures), spectator mode, hand history.
- Custom gesture mapping per player.

## Risks & open questions

- **Detection reliability** across lighting, camera angles and skin tones: needs testing early.
- **Latency/bandwidth** with many video streams on weak connections.
- **Cheating:** players at the same location, or a second screen. Accepted for friends' games.
- **Privacy:** camera permissions, no recording by default.
- **Legal:** real-money play would mean gambling regulation, so it stays out of scope.
