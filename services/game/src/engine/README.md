# Poker engine

Pure No-Limit Texas Hold'em rules for the game service. No Express, no database, no
WebSocket: plain functions that take a state and return a new one. Owner: Olivia.

## How the game service uses it

```js
import {
  createTable,
  sitDown,
  startNextHand,
  act,
  actOnTimeout,
  standUp,
  viewTable,
  playerToAct,
  EngineError,
} from './engine/index.js';

let table = createTable({ smallBlind: 5, bigBlind: 10, startingStack: 1000 });
table = sitDown(table, { id: 'player-uuid', name: 'Ana' }); // seat chosen automatically
table = startNextHand(table);

try {
  table = act(table, playerId, { type: 'raise', amount: 40 });
} catch (err) {
  if (err instanceof EngineError) {
    /* send err.code + err.message to that player only */
  } else throw err;
}

// After every change, send each player their own view (never `table` itself):
for (const id of connectedPlayers) send(id, viewTable(table, id));

// Turn timer: when it expires for playerToAct(table)
table = actOnTimeout(table); // checks if possible, otherwise folds

// When a hand ends, table.lastResult holds the result for the players service.
```

Every function returns a **new** table and never changes the one passed in, so a failed
action cannot leave the table half-updated: keep the old value and report the error.

`table` contains the deck and everyone's hole cards. **Never send it to a client or log it.**
Send `viewTable(table, viewerId)`; pass `null` for a spectator.

## Messages in the plan's format (plan.md §6)

`messages.js` translates between the engine and the formats in `plan.md` §6:

```js
import { act, toEngineAction, publicState, privateState, handResults, httpStatusFor,
         EngineError } from './engine/index.js';

// POST /tables/:id/actions  { playerId, action: "check"|"call"|"fold"|"raise"|"allin", amount? }
try {
  table = act(table, body.playerId, toEngineAction(body));
} catch (err) {
  if (!(err instanceof EngineError)) throw err;
  return res.status(httpStatusFor(err)).json({ code: err.code, message: err.message });
}

// After every change: one "state" to everyone, one "private" to each player
broadcast(publicState(table, { timerEndsAt }));
for (const id of seatedPlayers) sendTo(id, privateState(table, id));

// When a hand ends: POST /players/:playerId/results with body { handId, delta }
for (const { playerId, body } of handResults(table, tableId)) await playersClient.saveResult(playerId, body);
```

**`amount` means "raise to"**: the total bet on this street after the raise, not the chips
added. `minRaise` and `maxRaise` use the same meaning.

- `stage`: `waiting`, `preflop`, `flop`, `turn`, `river`, `complete`.
- `seats[].status`: `active`, `folded`, `allin`, `waiting` (not in this hand), `out` (no chips).
- `result` (only when `stage` is `complete`): winners, amounts, hand names and cards shown.
- Additions to §6: `seat`, `handNumber`, `result` and `toCall`.
## Cards

Two-character strings: rank (`2`–`9`, `T`, `J`, `Q`, `K`, `A`) + suit (`c`, `d`, `h`, `s`).
Examples: `"As"` ace of spades, `"Td"` ten of diamonds.

## Actions (client → server)

| Gesture             | Action                               |
| ------------------- | ------------------------------------ |
| Fold (thumbs down)  | `{ "type": "fold" }`                 |
| Check (double tap)  | `{ "type": "check" }`                |
| Call (thumbs up)    | `{ "type": "call" }`                 |
| Raise (palm + fist) | `{ "type": "raise", "amount": 120 }` |
| All-in (both hands) | `{ "type": "allIn" }`                |

`amount` is the **total** the player's bet will be on this street ("raise to"), not the
extra chips. `raise` is also used for the first bet of a street.

## Legal actions (server → client)

`viewTable(table, id).hand.legalActions` is `null` unless it is that player's turn:

```json
{
  "actions": ["fold", "call", "raise", "allIn"],
  "toCall": 10,
  "minRaiseTo": 20,
  "maxRaiseTo": 1000,
  "allInTo": 1000
}
```

The gesture module and the raise slider should take their limits from `minRaiseTo` and
`maxRaiseTo`. Anything outside them is rejected with `INVALID_AMOUNT`.

## Errors

`EngineError.code` is one of: `INVALID_CONFIG`, `INVALID_ACTION`, `ILLEGAL_ACTION`,
`INVALID_AMOUNT`, `NOT_YOUR_TURN`, `UNKNOWN_PLAYER`, `HAND_OVER`, `HAND_IN_PROGRESS`,
`NO_HAND`, `NOT_ENOUGH_PLAYERS`, `SEAT_TAKEN`, `TABLE_FULL`, `ALREADY_SEATED`.
`message` is written to be shown to the player. Suggested HTTP status: 400 for
`INVALID_*`, 409 for everything else.

## Hand result (for the players service)

`table.lastResult` after a hand:

```json
{
  "handNumber": 7,
  "showdown": true,
  "board": ["3s", "8h", "9s", "Jd", "4c"],
  "pots": [
    {
      "amount": 300,
      "eligible": ["a", "b", "c"],
      "winners": [{ "id": "a", "amount": 300, "handName": "Pair" }]
    }
  ],
  "revealed": { "a": ["As", "Ad"], "b": ["Kc", "Kd"] },
  "hands": { "a": { "name": "Pair", "cards": ["As", "Ad", "Jd", "9s", "8h"] } },
  "players": [{ "id": "a", "startStack": 100, "endStack": 300, "net": 200, "won": true }]
}
```

`won` is true if the player won (part of) a pot someone else also put chips in, so getting
back an uncalled bet does not count as a win. The `net` values always add up to 0.

## Rules

- No-Limit Texas Hold'em, 2–6 players, play chips only. Defaults: blinds 5/10, stack 1000.
- The button moves one seat clockwise each hand to the next player with chips. Heads-up,
  the button posts the small blind and acts first before the flop and last after it.
- Players who cannot cover a blind post what they have and are all-in. Other players must
  still call the full big blind.
- Minimum bet is the big blind. A raise must be at least as big as the previous bet or raise
  on that street.
- An all-in smaller than a full raise does **not** reopen betting: players who already acted
  can only call or fold. A full raise reopens it.
- A player cannot raise when every opponent is all-in.
- When fewer than two players can still bet, the rest of the board is dealt without betting.
- At showdown every remaining player's cards are shown (no mucking). Folded cards are never
  shown, not even after the hand.
- Side pots: each player can win from each opponent at most what they put in themselves.
  Excess chips nobody called go back to their owner.
- Split pots are divided equally. Odd chips go to the winner(s) closest to the left of the
  button.
- Turn timeout: check if possible, otherwise fold.
- A player who leaves mid-hand folds, unless they are all-in: then they stay in and can win.
  Their seat is freed when the hand ends.
- The deck is shuffled with Node's `crypto.randomInt` (Fisher-Yates).

## Tests

```bash
npm ci
npm test               # all tests
npm run test:coverage  # fails below 70%
```

Tests can deal exact cards with a fixed deck (`startHand(params, { deck })`, see
`test/engine/helpers.js`) and reproduce shuffles with `seededRandomInt(seed)`.
`simulation.test.js` plays hundreds of random hands and checks that chips are never created
or lost and that no player ever sees another player's hole cards.
