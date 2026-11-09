# game / api

How clients reach the module: Express routes (lobby) and the WebSocket (live table, video signaling).
Checks the shape of the input, calls the application, turns errors into `{ code, message }`.
No business rules and no SQL here. Formats: `docs/contracts.md`.
