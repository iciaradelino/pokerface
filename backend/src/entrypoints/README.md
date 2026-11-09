# entrypoints

One file per container. Each one reads the config, builds **one** module, adds the shared middleware
(request log, CORS, errors, /health) and starts listening.

- `game.js` starts the game service (Dockerfile.game). Owner: Person 3.
- `players.js` starts the players service (Dockerfile.players). Owner: Person 4.

This is the only place that knows about everything; nothing imports an entrypoint.
