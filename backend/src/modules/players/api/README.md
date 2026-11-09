# players / api

How clients reach the module: Express routes for profiles, results and the leaderboard.
Checks the shape of the input, calls the application, turns errors into `{ code, message }`.
No business rules and no SQL here. Formats: `docs/contracts.md`.
