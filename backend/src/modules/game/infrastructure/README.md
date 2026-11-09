# game / infrastructure

Implementations of the ports: talking to the outside world.

- `tableRepository.js`: SQL for tables and hand history
- `liveTables.js`: tables being played, kept in memory
- `playersClient.js`: HTTP calls to the players service (2 s timeout, uses `shared/httpClient.js`)
- `turnTimer.js`: the 30 s turn timer

All SQL lives here and nowhere else.
