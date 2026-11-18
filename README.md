# Pokerface

Online Texas Hold'em where you play **face to face over webcams** and act with **hand signals** instead of clicking buttons. Reading people (and hiding your own tells) is back in the game.

## Run locally

Our local setup runs two backend services, separate databases in SQL Server, and the React frontend. The players API supports profiles, saved hand results and the leaderboard. The game backend currently provides health checks, and the frontend has a placeholder home page.

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
npm run lint
npm run format:check
npm run test:coverage
```

GitHub Actions runs lint, formatting, coverage and a production dependency audit on every PR and push. Coverage below 70% fails the checks. CI also builds the service images and runs the smoke test against the Compose stack with its own SQL Server container.

### UI

`docker compose up` builds the UI into `ui/dist` and serves it at http://localhost:5173. While working on the UI, use the Vite dev server instead, which reloads on every change. Stop the Compose `ui` service first, because both use port 5173:

```sh
cd ui
npm ci
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:5173 |
| `npm test` / `npm run test:coverage` | Vitest + Testing Library, fails below 70% coverage |
| `npm run lint` / `npm run format:check` | ESLint and Prettier |
| `npm run build` | Static files in `ui/dist` for Static Web Apps |

Service URLs come from `VITE_PLAYERS_URL` and `VITE_GAME_URL` (defaults: ports 3001 and 3002). Copy `ui/.env.example` to `ui/.env.local` to change them. Colours, fonts and shared components follow [docs/styling.md](docs/styling.md).

With the stack running, these checks also verify database isolation, migrations and removal of health-check rows:

```sh
docker compose exec -T players node --input-type=module < scripts/check-database.mjs
docker compose exec -T game node --input-type=module < scripts/check-database.mjs
```

### Azure deployment

Pokerface deploys to `rg-sdd-3a-g5` in IE's Azure subscription (West Europe). The [Bicep templates](infra/) create two Container Apps, two serverless SQL databases, a Static Web App, and the Container Apps logging workspace. CI runs first, then the deploy job builds and publishes SHA-tagged images, deploys the app, and checks both health endpoints and the UI.

To enable the first deployment:

1. Wait for IE to confirm that `sdd-3a-g5-github` can deploy to our resource group and trusts `iciaradelino/pokerface` on `main`. Add its client, tenant and subscription IDs as GitHub Actions secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID`. This uses OIDC, so there is no Azure client password.
2. Add three distinct generated passwords as Actions secrets: `SQL_ADMIN_PASSWORD`, `PLAYERS_DB_PASSWORD` and `GAME_DB_PASSWORD`. Generate a fresh value for each (for example, `printf 'Pf-%s-9!\n' "$(openssl rand -hex 24)"`). Keep the service passwords stable between runs; changing a service password requires rotating the matching SQL user.
3. Set the Actions variable `AZURE_DEPLOY_ENABLED` to `true` and run **CI** on `main` from the Actions tab. Subsequent pushes to `main` deploy automatically if CI passes. On first publication, GitHub may create the two GHCR packages as private: make `pokerface-players` and `pokerface-game` public, then rerun the failed deploy job. It checks that Azure can pull both images anonymously before creating resources.

The first successful deployment and live URL are tracked in [#2](https://github.com/iciaradelino/pokerface/issues/2). Monitoring is [#16](https://github.com/iciaradelino/pokerface/issues/16).

See the [architecture guide](docs/architecture.md) for code locations, plus our [Definition of Done](docs/scrum/definition-of-done.md) and [Sprint 0 record](docs/scrum/sprint-0.md).

## Core experience

- Each player's browser shows the **poker table in the center** (community cards, pot, chips) with **every player's camera feed placed around it** at their seat, including your own.
- Your camera is always pointed at you. Others can see your face while you decide, just like a real table.
- You act with gestures that the app recognizes from your camera feed. Your hole cards are only visible on your own screen.

## Gestures (initial set)

| Action    | Gesture                          | Real-table equivalent      |
|-----------|----------------------------------|----------------------------|
| Check     | Tap index finger down twice ✊   | Knocking on the table      |
| Call      | Thumbs up 👍                     | Nod / push chips           |
| Fold      | Thumbs down 👎                   | Mucking cards              |
| Raise     | Open palm, raise hand up/down to set amount, fist to confirm ✋ | Sliding chips forward |
| All-in    | Thumb, index and little finger out 🤟 | Pushing the whole stack |

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
