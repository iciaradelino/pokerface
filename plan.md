# Pokerface: Team Plan

Group Assignment: build an MVP as a Scrum team, deploy it to Azure through a pipeline, and monitor it in production.
**Deadline:** 24 Nov 23:59 (commit tagged `submission` on `main`). **Sprint Review:** 25–26 Nov. Assignment 2 is due 22 Nov at the same time, so keep the scope small.

> A small product that works, is tested, deploys itself and is monitored scores higher than an ambitious one that doesn't run. **Keep `main` deployable at all times.** Gestures and video are what make the product interesting, but they come after the graded basics.

---

## 1. Product and architecture

**MVP:** players create a profile, create or join a private table by code, and play Texas Hold'em hands (2–6 players, play chips only). You act with hand gestures, and on-screen buttons are always there as a fallback. Webcam tiles are placed around the table if time allows.

**Required by the brief → how we meet it**

| Requirement | Our answer |
|---|---|
| Exactly 2 services, each in its own container with its own DB, talking over HTTP | `players` and `game` (below) |
| ≥1 entity with full CRUD | **Player** profile (name, avatar, chip balance, gesture settings) in `players` |
| ≥1 feature beyond CRUD | Poker engine: dealing, betting, side pots, hand evaluation. Plus a leaderboard |
| Static UI on Static Web Apps, calls services from the browser, CORS limited to the UI's origin | `ui/`: **React + Vite**, built to static files |
| Backend Python (Flask/FastAPI) or Node (Express) | **Node.js + Express** for both services (see §1a) |
| No auth beyond a simple mechanism | A player picks a name; the player id is kept in `localStorage`. No passwords |

**Services**

| Service | Owns (database) | Endpoints (draft) |
|---|---|---|
| `players` | `players`, `hand_results` | `POST/GET/PUT/DELETE /players[/:id]`, `POST /players/:id/results`, `GET /leaderboard`, `GET /health` |
| `game` | `tables`, `seats`, `hands` (history) | `POST/GET/DELETE /tables[/:id]`, `POST /tables/:id/join`, `POST /tables/:id/actions`, `GET /health`, WebSocket `/tables/:id/ws` |

- **Requests that cross between services:** when a player joins a table, `game` calls `GET /players/:id` to check the player exists and to get their chips. At the end of each hand, `game` calls `POST /players/:id/results` to send the chip changes. Every such call has a timeout, and the service URL comes from an environment variable (`PLAYERS_URL`).
- **Commands over HTTP, updates over WebSocket:** actions are `POST /tables/:id/actions`, so they are logged, timed and easy to test. The WebSocket only pushes state to clients and relays WebRTC signaling. Check the `Origin` header on WebSocket connections yourself, because CORS doesn't apply to them.
- **Hidden cards:** the server sends public state to everyone and hole cards only to their owner.
- **One replica:** Container Apps runs at most 1 replica, so live table state can stay in memory. If the container scales to zero, any hand in progress is lost; table settings and finished hands are stored in the DB. Write this down as a decision.
- **Partial failure:**
  - `players` down → hands already running keep going; joining shows "Player service unavailable, try again"; results are retried at the end of the next hand.
  - `game` down → profile and leaderboard still work, and the lobby shows "Tables unavailable".
  - In both cases: a clear message, never a stack trace or a request that hangs.
- **Video:** peer-to-peer WebRTC in the browser, with signaling through the `game` WebSocket and only public STUN. No TURN server (that would be another service, which is out of scope).
- **Out of scope:** a third container, Redis or any other message broker, Kubernetes, other databases, real auth, payments.

### 1a. Stack (decided)

**Backend: Node.js 22 LTS + Express** for both services. **Frontend: React + Vite** in `ui/`, built to static files for Static Web Apps.

Why:
- **One language** (JavaScript) for everything: the gesture code (MediaPipe), WebRTC and the UI already have to be JavaScript, so all 6 of us can review any PR and share one lint/test/Docker setup.
- **Real-time is simple:** `ws` attaches to the Express HTTP server, so the API, WebSocket state updates and video signaling run in one container.
- **JSON end to end:** game state goes from engine to WebSocket to UI with no conversion.
- **React** because the table re-renders on every state update (seats, stacks, timer, gesture ring), which gets messy with plain JS. **Vite** builds the static files Static Web Apps needs.

| Need | Pick |
|---|---|
| Runtime / base image | Node 22 LTS, `node:22-alpine` (runs as the built-in non-root `node` user) |
| Web framework / WebSocket | Express, `ws` |
| SQL Server driver | `mssql` (connection pool, our own retry with backoff) |
| Migrations | Our own runner for numbered `.sql` files + a `schema_migrations` table |
| Tests / coverage | Vitest + Supertest, 70% coverage threshold set in the Vitest config |
| Lint / format | ESLint + Prettier |
| Security scan | `npm audit` in CI (CodeQL optional) |
| Hand evaluator | **Written by us** (it's the non-CRUD feature); a library may only be used in tests to check our results |

Rules: pin exact versions (`package-lock.json`, `npm ci`), and keep each service under ~12 third-party packages. This choice is the stack decision record in `docs/decisions.md`.

---

## 2. Ownership (one area per person)

Everyone is a Developer. Each owner writes their area's code, tests and decision record, and presents it at the Review. In the Review Q&A you can be asked about any part you claim to have built, so **open your own PRs** (your individual contribution statement links to them).

| # | Area | Owner | Deliverables | Docs they write | Review talk |
|---|---|---|---|---|---|
| 1 | **Gesture control** (client) | _M1_ | Gesture module from `prototype/gestures/` that emits `{action, amount}` and progress (0..1) and only runs on your turn; raise limits come from the game state; a short gesture tutorial page; client unit tests | `decisions.md`: gesture recognition in the browser | Live gesture demo |
| 2 | **Poker engine** (`services/game/src/engine`) | _M2_ | Pure rules library: deck/shuffle (secure RNG), blinds, betting rounds, legal actions, side and split pots, hand evaluator, `getPublicState` / `getPrivateState`. Main source of `game`'s **≥70% coverage** | `decisions.md`: the non-CRUD feature | How a hand is resolved |
| 3 | **Game service** (`services/game`) | _M3_ | Express API + WebSocket, tables, turn timer, migrations, `/health`, request logging, calls to `players` with timeout and failure handling, signaling relay, Dockerfile, cross-service integration test | `decisions.md`: architecture/split; `data-model.md` (game) | Architecture and partial failure |
| 4 | **Players service + video** | _M4_ | `services/players`: Player CRUD, results, leaderboard, migrations, `/health`, logging, Dockerfile, tests. **Sprint 2:** WebRTC mesh in the client (camera permissions, tiles, join/leave) | `decisions.md`: storage/data model; `data-model.md` (players) | CRUD, leaderboard, video |
| 5 | **UI** (`ui/`) | _M5_ | Static site: profile, lobby (create/join by code), table (cards, pot, seats, active player, timer), fallback buttons and raise slider, gesture progress ring, error messages when a service is down, `config.js` with service URLs | `README.md` (product + how to run locally) | Live product walkthrough |
| 6 | **DevOps and monitoring** | _M6_ | `docker-compose.yml` + `db/init.sql`, CI/CD workflows, Azure setup as **Bicep** (credited), branch protection, secrets, Log Analytics dashboard, SLO query, post-deploy health check, smoke test | `decisions.md`: deployment/pipeline + monitoring; README Azure section | Pipeline run live, dashboard + SLO |

**Shared by everyone:** `AI_USAGE.md` (each person adds rows for their own AI-assisted work, including workflows, Dockerfiles and IaC). Reviewing each other's PRs.

### Scrum roles (rotate each sprint, record them in `docs/scrum/sprint-N.md`)

| Sprint | Product Owner | Scrum Master |
|---|---|---|
| 0 | _M1_ | _M6_ |
| 1 | _M5_ | _M2_ |
| 2 | _M3_ | _M4_ |

- **PO:** owns backlog order and acceptance criteria, and accepts items at the Review.
- **SM:** runs Planning, Review and Retro, and writes that sprint's `docs/scrum/sprint-N.md` (goal, items selected, done/not done, retro agreements).

---

## 3. Timeline

### Sprint 0 (4–10 Nov): setup
- [ ] Team repo on GitHub, shared with the professor; **branch protection** on `main` (PR + 1 approval + CI green, no direct pushes).
- [ ] GitHub Project board with user stories + acceptance criteria (PO).
- [ ] `docs/scrum/definition-of-done.md` (see §5).
- [ ] Agree on contracts (§6) and the repo layout (§7).
- [ ] **Local skeleton:** `docker compose up` brings up both services + SQL Server + nginx UI, and each `/health` returns 200 (M6, with M3/M4 for the services).
- [ ] Ask for / store the group's service principal as GitHub secrets.

### Sprint 1 (11–18 Nov): pipeline first, then the first feature end to end
- [ ] **Days 1–2: Hello World deployed to Azure by the pipeline** (most important milestone). Nothing else gets merged until this works.
- [ ] Player CRUD working through the UI on Azure.
- [ ] Engine passes tests for a full hand (blinds → showdown → payout, side pots).
- [ ] Create/join table → play one full hand with **buttons** between 2 browsers, on Azure.
- [ ] Results sent to `players`; partial failure handled for the join call.
- [ ] Coverage ≥70% enforced in CI.
- [ ] Planning + Review + Retro outcomes in `docs/scrum/sprint-1.md`.

### Sprint 2 (19–24 Nov): MVP complete, monitoring, docs
- [ ] Gestures drive real turns (with hold-to-confirm and fallback buttons).
- [ ] Leaderboard.
- [ ] Webcam tiles around the table (WebRTC). **Drop this if it puts the deadline at risk.**
- [ ] Log Analytics dashboard (request count, error rate, response time) + SLO query.
- [ ] Partial failure tested both ways.
- [ ] All documentation (§4) done; README has the live URL and team list.
- [ ] **24 Nov:** tag `submission` on `main`; one member submits the URL + SHA on Blackboard; **each member** submits their own contribution statement.

### Review (25–26 Nov): 10 min + 5 min questions; everyone presents
1. Live product from its public URL: sprint goal and the items completed (M5, M1, M4)
2. A change merged just before or during the Review going through the pipeline (have a recorded run as backup) (M6)
3. Architecture, partial failure, engine (M3, M2)
4. Dashboard + SLO (M6); next sprint + main retro agreement (Sprint 2 SM)

---

## 4. Grading checklist (do not miss these)

**Containers and code**
- [ ] One Dockerfile per service: **no `COPY . .`**, no secrets/.env in the image, pinned dependencies, **non-root user**.
- [ ] `docker-compose.yml` at the root brings the whole system up from a clean clone (SQL Server 2022 container with one DB per service, `db/init.sql` run by a one-off service, UI served by `nginx:alpine` with the folder mounted).
- [ ] Versioned migration files (`migrations/001_init.sql`…) applied in order on startup, recorded in `schema_migrations`, never edited after they're applied.
- [ ] `GET /health` → `200 {"status":"ok","db":"ok","version":"<sha>"}` when the service can read and write its own DB, `503` otherwise.
- [ ] One log line per request to stdout: method, path, status, duration. INFO level, no request bodies.
- [ ] DB connection with **retries and backoff** (a serverless DB waking from pause returns error 40613 for up to about a minute).
- [ ] Every call to the other service has a timeout and a designed failure message.

**Azure** (Assignment 2 §7 contract, group version)
- [ ] All resources go in `rg-sdd-<class>-g<N>`, and their names start with `sdd-<class>-g<N>`: `-players`, `-game`, `-sql`, `-players-db`, `-game-db`, `-ui`, `-env`.
- [ ] At most 2 Container Apps (Consumption, **min 0 / max 1 replica**), 2 serverless SQL DBs (Gen5, 0.5–1 vCore, shortest auto-pause, 2 GB, locally redundant backups), 1 Static Web App.
- [ ] One SQL login per service, with access to its own DB only. Firewall: allow Azure services.
- [ ] Use the **group's** service principal (not the class one from Assignment 2). Config only through environment variables and secrets. Nothing changed by hand after setup.
- [ ] No other Azure services, clouds or platforms (Render, Vercel…).

**CI/CD** (GitHub Actions)
- [ ] CI on every PR and push: lint, format check, tests with coverage (**fail below 70%** on each service's core logic), build images. Recommended: `npm audit` / CodeQL.
- [ ] CI uses a SQL Server service container, **never the Azure DB**.
- [ ] CD on merge to `main`: push images to GHCR tagged with the **commit SHA**, deploy both services + UI only if CI passed, apply migrations, **fail the run if `/health` isn't 200 in time**.
- [ ] Credited extras: Bicep IaC, release tags, blue-green/canary with revisions, smoke test against the live URL.

**Monitoring**
- [ ] Request logs can be queried in Log Analytics.
- [ ] Dashboard (saved queries or a Workbook): request count, error rate, response time.
- [ ] SLO with its query, e.g. *"99% of `POST /tables/{id}/actions` under 300 ms over 7 days"*.

**Documentation**
- [ ] `README.md`: what the product does, live URL, architecture diagram that matches the deployment, run locally, run tests, reproduce the Azure setup, team list with GitHub usernames.
- [ ] `docs/decisions.md`: 4–6 records (context, decision, alternatives, consequences): architecture/split, storage, deployment and pipeline, monitoring, plus the stack, frontend and non-CRUD feature choices.
- [ ] `docs/data-model.md`: entities + relationships diagram, matching the migrations.
- [ ] `docs/scrum/definition-of-done.md` + `sprint-0.md`, `sprint-1.md`, `sprint-2.md` (roles held included).
- [ ] `AI_USAGE.md`: one row per significant AI-assisted piece of work.

**Security**
- [ ] No secrets in the repo or its history. If one leaks: within 24 h, rotate it (if we created it) or tell the professor (if they provided it), remove it from the code, and record the incident in the README. **If a leak is never reported, the grade is capped at 40/100.**

**Rubric weights:** Product/Architecture/Code 25%, DevOps Pipeline 20%, Cloud 15%, Testing 10%, Monitoring 10%, Scrum 10%, Docs & Review 10%. Your individual grade can go up or down by up to 30% based on contribution statements and Git history.

---

## 5. Definition of Done (starting version)

An item is done when:
1. It meets its acceptance criteria.
2. It has tests, and coverage stays ≥70% on core logic.
3. It was merged to `main` through a PR approved by another member, with CI green.
4. It was deployed to Azure by the pipeline, and `/health` is green.
5. The related docs were updated (README, decisions, data model, AI_USAGE).

---

## 6. Shared contracts (agree in Sprint 0; tell the affected owners before changing one)

- **Action** (UI → `game`): `POST /tables/:id/actions` `{ playerId, action: "check"|"call"|"fold"|"raise"|"allin", amount? }` → `200` new state, or `409` if it's illegal or not your turn.
- **Public state** (WebSocket → everyone): `{ type:"state", stage, board, pots, dealer, currentPlayer, timerEndsAt, seats:[{playerId, name, stack, bet, status}] }`
- **Private state** (WebSocket → one player): `{ type:"private", holeCards, legalActions, minRaise, maxRaise }`
- **Signaling** (WebSocket relay): `{ type:"signal", from, to, data }`
- **Gesture module → UI:** `onProgress(action, 0..1)`, `onRaiseAmount(n)`, `onFire(action, amount?)`
- **`game` → `players`:** `GET /players/:id`, `POST /players/:id/results { handId, delta }` (the `handId` lets `players` ignore a retried result it has already saved).

## 7. Repo layout

```
.github/workflows/      ci.yml, cd.yml                      (M6)
infra/                  main.bicep                          (M6)
db/init.sql                                                 (M6)
docker-compose.yml                                          (M6)
services/players/       Dockerfile, migrations/, src/, test/ (M4)
services/game/          Dockerfile, migrations/, src/, test/ (M3)
services/game/src/engine/                                   (M2)
ui/                     static site                         (M5)
ui/gestures/            gesture module + tutorial           (M1)
ui/video/               WebRTC                              (M4)
docs/                   decisions.md, data-model.md, scrum/
prototype/              existing experiments (not deployed)
README.md, AI_USAGE.md
```

## 8. Working agreements

- One branch per backlog item, PR into `main`, 1 approval from someone other than the author. Small PRs, merged often.
- Short sync at the start of each class session; tell people about blockers in the group chat the same day.
- Each person keeps a list of their PR links for the contribution statement.
