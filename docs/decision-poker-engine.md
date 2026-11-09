<!-- Paste this into docs/decisions.md as one of the 4-6 decision records. -->

## ADR: The poker engine (the non-CRUD feature)

**Context.** The product's core is a multiplayer No-Limit Texas Hold'em game. The rules are the
most complex logic in the system (betting rounds, minimum raises, all-ins, side and split
pots, hand ranking) and any bug costs players chips. Hole cards must stay private even though
the server knows all of them. The game service has to reach 70% test coverage on its core logic,
and it may scale to zero, so in-progress hands live in memory.

**Decision.** The rules live in a pure module inside the game service (`src/engine/`) with no
dependencies on Express, the database or WebSockets. Every function takes a state and returns a
new one without changing the input. The server is authoritative: clients send only intents such
as `{ type: "raise", amount: 120 }`, the engine checks them against the legal actions and the
server sends each player a filtered view (`viewTable(table, playerId)`) that contains only that
player's own hole cards and cards shown at showdown. The hand evaluator is written in-house:
it scores every 5-card combination of the 7 available cards (21 combinations), which is fast
enough for a 6-player table. Shuffling uses Node's `crypto.randomInt`.

**Alternatives.**

- _Rules inside the Express route handlers_: less code at first, but hard to test without HTTP
  and easy to get wrong when two handlers update the same table.
- _A third-party evaluator library (e.g. pokersolver)_: saves writing the evaluator, but adds
  a dependency for about 100 lines of well-tested code and hides the logic we need to explain.
- _Clients computing results_: no server work, but any player could cheat or see other
  players' cards.
- _`Math.random` for shuffling_: simpler, but predictable.

**Consequences.**

- The engine is tested on its own: unit tests for every rule, fixed decks to deal exact
  hands, and a randomized simulation that plays hundreds of hands and checks that chips are
  never created or lost and that no view ever leaks another player's cards. Coverage is
  about 99%, well above the 70% the pipeline requires.
- Errors carry stable codes (`NOT_YOUR_TURN`, `INVALID_AMOUNT`…), so the service and the UI
  can show clear messages instead of stack traces.
- Because the state is a plain object, it could later be stored in the database to survive
  scale-to-zero, but today a hand in progress is lost when the container stops (see the
  architecture decision).
- Simplifications, accepted for an MVP: the button simply moves to the next player with chips
  (no dead-button rule), several short all-ins that together add up to a full raise do not
  reopen betting, and every remaining hand is shown at showdown (no mucking).
