# players / application

Use cases: what the players module can do, step by step (e.g. \`createProfile(name)\`).
Calls the domain and talks to the outside world only through **ports**: objects passed in by the
entrypoint (a repository, an HTTP client…), documented with JSDoc in `ports.js`.

May import: its own `domain/` and `application/`. Never infrastructure, api, shared, express or the database.
Tests use fake ports: no database, no network.
