# Pokerface: Team Plan

**Deadline:** 24 Nov 23:59, commit tagged `submission` on `main`. **Sprint Review:** 25–26 Nov. Assignment 2 is due 22 Nov at the same time, so keep the scope small.
**Priorities:** a small product that works, is tested, deploys itself and is monitored. Keep `main` deployable. Gestures and video come after the graded basics.

## 1. Product and architecture

**MVP:** create a profile, create or join a private table by code, and play Hold'em (2–6 players, play chips only). You act with gestures, and buttons are always there as a fallback. Webcam tiles if time allows.

| Requirement | Our answer |
|---|---|
| 2 services, own container + own DB each, HTTP between them | `players` and `game` |
| ≥1 entity with full CRUD | **Player** (name, avatar, chips, gesture settings) |
| ≥1 feature beyond CRUD | Poker engine (betting, side pots, hand evaluation) + leaderboard |
| Static UI on Static Web Apps, CORS limited to the UI's origin | `ui/`, React + Vite |
| Simple auth only | Player id in `localStorage`, no passwords |

| Service | Database tables | Endpoints |
|---|---|---|
| `players` | `players`, `hand_results` | CRUD `/players[/:id]`, `POST /players/:id/results`, `GET /leaderboard`, `GET /health` |
| `game` | `tables`, `seats`, `hands` | `POST/GET/DELETE /tables[/:id]`, `POST /tables/:id/join`, `POST /tables/:id/actions`, `GET /health`, WS `/tables/:id/ws` |

- **Calls between services:** `game` calls `GET /players/:id` when a player joins and `POST /players/:id/results` after each hand. The URL comes from `PLAYERS_URL`, and every call has a timeout.
- **HTTP for actions, WebSocket for updates.** Actions are HTTP so they're logged and measurable. The WebSocket only pushes state and relays video signaling. Check its `Origin` header yourself, because CORS doesn't cover WebSockets.
- **Hidden cards:** public state goes to everyone; hole cards only to their owner.
- **Max 1 replica:** live table state stays in memory. A scale-to-zero loses the hand in progress; tables and finished hands are in the DB. Record this as a decision.
- **Partial failure:**
  - `players` down → running hands continue, joining shows "Player service unavailable", results are retried with the next hand.
  - `game` down → profile and leaderboard still work, and the lobby shows "Tables unavailable".
- **Video:** peer-to-peer WebRTC, signaling through the `game` WebSocket, public STUN only (no TURN).
- **Out of scope:** a 3rd container, brokers/Redis, Kubernetes, other DBs, real auth, payments.

### Stack (decided)

**Node.js 22 + Express** for both services, **React + Vite** for the UI. Why:
- One language for everything: gestures, WebRTC and UI must be JavaScript anyway, so anyone can review any PR.
- `ws` runs on the Express server: API, WebSocket and signaling in one container.
- JSON end to end: engine → WebSocket → UI with no conversion.
- React handles a table that re-renders constantly; Vite builds the static files.

| Need | Pick |
|---|---|
| Base image | `node:22-alpine`, runs as the non-root `node` user |
| Framework / WebSocket | Express, `ws` |
| DB driver | `mssql` + our own retry with backoff |
| Migrations | Our own runner: numbered `.sql` files + `schema_migrations` table |
| Tests | Vitest + Supertest, 70% coverage threshold in config |
| Lint / format | ESLint + Prettier |
| Security | `npm audit` in CI (CodeQL optional) |
| Hand evaluator | **Written by us** (it's the non-CRUD feature); a library only to check results in tests |

Pin versions (`package-lock.json`, `npm ci`); ~12 third-party packages max per service. This is the stack record in `docs/decisions.md`.

## 2. Ownership

Each owner builds, tests, documents and presents their area. Open your own PRs: your contribution statement links to them, and you can be questioned on anything you claim to have built.

| # | Owner | Area | Deliverables | Docs | Review talk |
|---|---|---|---|---|---|
| 1 | _M1_ | **Gestures** (`ui/gestures/`) | Module from `prototype/gestures/`: emits `{action, amount}` + progress, active only on your turn, raise limits from game state; tutorial page; tests | Gesture decision | Gesture demo |
| 2 | _M2_ | **Poker engine** (`services/game/src/engine/`) | Shuffle (secure RNG), blinds, betting, legal actions, side/split pots, evaluator, public/private state. Carries `game`'s 70% coverage | Non-CRUD feature decision | How a hand resolves |
| 3 | _M3_ | **Game service** (`services/game/`) | API + WebSocket, tables, turn timer, migrations, `/health`, logging, calls to `players` with timeout/failure handling, signaling relay, Dockerfile, cross-service integration test | Architecture decision; `data-model.md` (game) | Architecture, partial failure |
| 4 | _M4_ | **Players service + video** | `services/players/`: CRUD, results, leaderboard, migrations, `/health`, logging, Dockerfile, tests. Sprint 2: WebRTC tiles in `ui/video/` | Storage decision; `data-model.md` (players) | CRUD, leaderboard, video |
| 5 | _M5_ | **UI** (`ui/`) | Profile, lobby, table (cards, pot, seats, timer), fallback buttons + raise slider, gesture ring, service-down messages, `config.js` with service URLs | `README.md` product + run locally | Product walkthrough |
| 6 | _M6_ | **DevOps + monitoring** | Compose + `db/init.sql`, CI/CD, Bicep IaC, branch protection, secrets, dashboard, SLO, post-deploy health check, smoke test | Deployment + monitoring decisions; README Azure section | Live pipeline, dashboard + SLO |

Everyone adds their own AI-assisted work to `AI_USAGE.md` and reviews others' PRs.

**Scrum roles** (record in `docs/scrum/sprint-N.md`). The PO owns the backlog and acceptance criteria. The SM runs the events and writes the sprint file (goal, selected, done/not done, retro agreements).

| Sprint | PO | SM |
|---|---|---|
| 0 | _M1_ | _M6_ |
| 1 | _M5_ | _M2_ |
| 2 | _M3_ | _M4_ |

## 3. Timeline

**Sprint 0 (4–10 Nov): setup**
- [ ] Team repo shared with the professor. Branch protection on `main`: PR, 1 approval, CI green.
- [ ] GitHub Project with user stories + acceptance criteria. `definition-of-done.md` (§5).
- [ ] Agree on contracts (§6) and the repo layout (§7).
- [ ] `docker compose up` brings everything up, and both `/health` endpoints return 200.
- [ ] Group service principal stored as GitHub secrets.

**Sprint 1 (11–18 Nov): pipeline, then the first feature end to end**
- [ ] **Days 1–2: Hello World deployed to Azure by the pipeline.** Nothing else gets merged until this works.
- [ ] Player CRUD live on Azure.
- [ ] Engine tests pass for a full hand, side pots included.
- [ ] A full hand played with buttons between 2 browsers on Azure, with results sent to `players`.
- [ ] Join-call failure handled. 70% coverage enforced in CI.

**Sprint 2 (19–24 Nov): MVP, monitoring, docs**
- [ ] Gestures drive real turns. Leaderboard.
- [ ] WebRTC tiles. **Drop them if the deadline is at risk.**
- [ ] Dashboard + SLO query. Partial failure tested both ways.
- [ ] All docs (§4). README has the live URL + team list.
- [ ] **24 Nov:**
  - Tag `submission`.
  - One member submits the URL + SHA on Blackboard.
  - **Every member** submits their own contribution statement (their PRs, roles held, % per member).

**Review (10 min + 5 min Q&A, everyone presents):**
1. Live product and completed items (M5, M1, M4).
2. A change going through the pipeline live, with a recorded run as backup (M6).
3. Architecture, partial failure, engine (M3, M2).
4. Dashboard + SLO (M6); next sprint + retro agreement (Sprint 2 SM).

## 4. Grading checklist

**Containers and code**
- [ ] Dockerfile per service: no `COPY . .`, no secrets/.env, pinned dependencies, non-root user.
- [ ] Compose brings the system up from a clean clone: SQL Server 2022 with 1 DB per service, `db/init.sql` one-off service, UI on `nginx:alpine` (folder mounted).
- [ ] Numbered migrations applied on startup, recorded in `schema_migrations`, never edited after they're applied.
- [ ] `/health`: `200 {"status":"ok","db":"ok","version":"<sha>"}` if the DB can be read and written, otherwise `503`.
- [ ] One log line per request (method, path, status, duration), INFO level, no bodies.
- [ ] DB retries with backoff (a paused DB returns error 40613 for up to ~1 min).
- [ ] Timeout + clear error on every call to the other service.

**Azure**
- [ ] All resources in `rg-sdd-<class>-g<N>`, with names prefixed `sdd-<class>-g<N>`: `-players`, `-game`, `-sql`, `-players-db`, `-game-db`, `-ui`, `-env`.
- [ ] At most:
  - 2 Container Apps (Consumption, min 0 / max 1 replica).
  - 2 serverless SQL DBs (Gen5, 0.5–1 vCore, shortest auto-pause, 2 GB, locally redundant backups).
  - 1 Static Web App.
- [ ] One SQL login per service, with access to its own DB only. Firewall allows Azure services.
- [ ] Use the **group's** service principal. Config only through environment variables and secrets. No manual changes after setup. No other Azure services or platforms.

**CI/CD**
- [ ] CI on every PR and push: lint, format check, tests with coverage (fail below 70%), image build. Uses a SQL Server container, **never the Azure DB**.
- [ ] CD on merge to `main`:
  - Push SHA-tagged images to GHCR.
  - Deploy both services + UI only if CI passed.
  - Apply migrations.
  - Fail the run if `/health` isn't 200 in time.
- [ ] Credited extras: Bicep, release tags, blue-green/canary with revisions, smoke test against the live URL.

**Monitoring:** request logs in Log Analytics; a dashboard with request count, error rate and response time; an SLO with its query, e.g. *99% of `POST /tables/{id}/actions` < 300 ms over 7 days*.

**Docs**
- [ ] `README.md`: product, live URL, architecture diagram matching the deployment, run locally, tests, Azure setup, team with GitHub usernames.
- [ ] `docs/decisions.md`: 4–6 records (context, decision, alternatives, consequences).
- [ ] `docs/data-model.md`: diagram matching the migrations.
- [ ] `docs/scrum/`: DoD + `sprint-0/1/2.md`.
- [ ] `AI_USAGE.md`.

**Secrets:** none in the repo or its history. If one leaks, within 24 h:
- Rotate it if we created it, or tell the professor if they provided it.
- Remove it from the code.
- Record it in the README.

An unreported leak caps the grade at 40/100.

**Weights:**

| Category | Weight |
|---|---|
| Product / Architecture / Code | 25% |
| Pipeline | 20% |
| Cloud | 15% |
| Testing | 10% |
| Monitoring | 10% |
| Scrum | 10% |
| Docs & Review | 10% |

Individual grades can move by up to ±30%, based on contribution statements and Git history.

## 5. Definition of Done

1. Meets its acceptance criteria.
2. Tested; coverage stays ≥70%.
3. Merged through a PR approved by another member, with CI green.
4. Deployed by the pipeline, with `/health` green.
5. Docs updated.

## 6. Shared contracts (tell the affected owners before changing one)

- **Action:** `POST /tables/:id/actions {playerId, action: check|call|fold|raise|allin, amount?}` → `200` + new state, or `409` if illegal or not your turn.
- **Public state (WS):** `{type:"state", stage, board, pots, dealer, currentPlayer, timerEndsAt, seats:[{playerId, name, stack, bet, status}]}`
- **Private state (WS):** `{type:"private", holeCards, legalActions, minRaise, maxRaise}`
- **Signaling (WS):** `{type:"signal", from, to, data}`
- **Gestures → UI:** `onProgress(action, 0..1)`, `onRaiseAmount(n)`, `onFire(action, amount?)`
- **`game` → `players`:** `GET /players/:id`, `POST /players/:id/results {handId, delta}`. `handId` lets `players` ignore a result it already saved, so retries are safe.

## 7. Repo layout

```
.github/workflows/  infra/  db/init.sql  docker-compose.yml   (M6)
services/players/   Dockerfile, migrations/, src/, test/      (M4)
services/game/      Dockerfile, migrations/, src/, test/      (M3)
services/game/src/engine/                                     (M2)
ui/   (M5)   ui/gestures/ (M1)   ui/video/ (M4)
docs/  decisions.md, data-model.md, scrum/
prototype/  (not deployed)    README.md  AI_USAGE.md
```

## 8. Working agreements

- One branch per backlog item. Small PRs, 1 approval from a non-author.
- Sync at the start of each class. Raise blockers in the chat the same day.
- Keep a list of your own PR links.
