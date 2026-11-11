# Architecture guide

We use two Node.js + Express backends and a React + Vite frontend. Each backend runs in its own container and owns its own database. We keep everything in one repository.

## Where to put code

| Owner | Area | Location |
|---|---|---|
| Ali | Gesture detection, confirmation progress and tutorial | `ui/gestures/` |
| Olivia | Poker rules: dealing, betting, hand evaluation and payouts | `services/game/src/engine/` |
| Lara | Tables API, WebSockets, timers and calls to players | `services/game/` |
| Laura | Profiles, balances, results and leaderboard; webcam video | `services/players/` and `ui/video/` |
| Iciar | Pages, table display, buttons and frontend integration | `ui/` |
| Matteo | Local setup, CI/CD, Azure and monitoring | `docker-compose.yml`, `db/`, `.github/workflows/`, `infra/`, `scripts/` |

## Skeleton

```text
pokerface/
├── services/
│   ├── players/
│   │   ├── src/          # server.js, app.js, database.js
│   │   ├── migrations/   # Numbered SQL changes
│   │   ├── test/
│   │   ├── Dockerfile
│   │   └── package.json  # Own dependencies and lockfile
│   └── game/
│       ├── src/
│       │   ├── server.js
│       │   ├── app.js
│       │   ├── database.js
│       │   └── engine/
│       ├── migrations/
│       ├── test/
│       ├── Dockerfile
│       └── package.json
├── ui/                   # Frontend pages and components
│   ├── gestures/
│   └── video/
├── db/                   # Local databases and logins
├── scripts/              # Setup and smoke/database checks
├── infra/                # Azure Bicep
├── .github/workflows/    # GitHub Actions
├── docs/                 # Decisions, data model and Scrum
├── prototype/            # Original gesture experiment
└── docker-compose.yml
```

The players backend supports profile CRUD, hand results and the top-10 leaderboard. The game backend currently provides health checks, and the React frontend has a placeholder home page. The engine, gestures, video, infrastructure and workflow folders are still placeholders.

## How the parts connect

- The frontend sends actions over HTTP and receives live game state over WebSockets.
- `game` calls `players` over HTTP when someone joins and to save results after a hand. Calls need timeouts; repeated results use `handId` to avoid counting twice.
- Each service accesses only its own database. We agree on request and state formats in [plan.md](../plan.md) before changing them.
- Inside each backend, `server.js` handles startup, `app.js` handles HTTP routes and middleware, and `database.js` handles SQL connections, migrations and health checks.
- Keep the poker engine as ordinary functions without HTTP or database code. Put its tests in `services/game/test/`. The backend validates all actions and keeps other players' cards private.
- Add each service's SQL changes to its own `migrations/` folder and tests to its own `test/` folder. Keep applied migrations unchanged.
