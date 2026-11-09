# Contracts

Every piece of data that passes between parts built by different people. Code against these
formats; if you need a change, open a PR that edits this file and request a review from
everyone listed as a consumer of that section.

Status: **agreed** on 9 November 2026. The team asked Person 2 to decide the formats; this is the
version everyone codes against. "Owner" below means who implements that part, not who may change
it: every change goes through a PR reviewed by the consumers of that section.

## 0. Conventions

- All messages are JSON. Field names use `camelCase`.
- **Chips** are whole numbers (integers). No decimals anywhere.
- **Cards** are two-character strings: rank (`2`–`9`, `T`, `J`, `Q`, `K`, `A`) + suit
  (`c`, `d`, `h`, `s`). Example: `"As"` ace of spades, `"Td"` ten of diamonds.
- **Player id**: the `id` the players service gives a profile (a UUID). The UI stores it in the
  browser after the profile is created and sends it with every request. There is no login
  (the assignment allows a simple mechanism).
- **Times** are ISO 8601 strings in UTC, e.g. `"2026-11-20T18:04:05.000Z"`.
- **Errors** always look like this, from every service, over HTTP and WebSocket:
  ```json
  {
    "code": "INVALID_AMOUNT",
    "message": "Raise to a whole amount between 20 and 1000"
  }
  ```
  `code` is for code (stable, uppercase); `message` can be shown to the player as is.

## 1. Players service REST API

Owner: Person 4. Consumers: Person 5 (UI), Person 3 (game service).

| Method   | Path                    | Body                   | Success                          | Errors                 |
| -------- | ----------------------- | ---------------------- | -------------------------------- | ---------------------- |
| `POST`   | `/players`              | `{ "name": "Ana" }`    | `201` profile                    | `400 INVALID_NAME`     |
| `GET`    | `/players/{id}`         |                        | `200` profile                    | `404 PLAYER_NOT_FOUND` |
| `PUT`    | `/players/{id}`         | `{ "name": "Ana B." }` | `200` profile                    | `400`, `404`           |
| `DELETE` | `/players/{id}`         |                        | `204`                            | `404`                  |
| `GET`    | `/leaderboard?limit=10` |                        | `200` list                       |                        |
| `POST`   | `/results`              | hand result (below)    | `201`, or `200` if already saved | `400`                  |
| `GET`    | `/health`               |                        | `200 { "status": "ok" }`         |                        |

**Profile**

```json
{
  "id": "6f1c2a9e-5b7d-4c1e-9a3f-2d8b7e4c1a05",
  "name": "Ana",
  "createdAt": "2026-11-12T10:00:00.000Z"
}
```

`name`: 1 to 20 characters, trimmed.

**Leaderboard entry** (sorted by `netChips`, highest first)

```json
{
  "playerId": "6f1c2a9e-…",
  "name": "Ana",
  "handsPlayed": 42,
  "handsWon": 11,
  "netChips": 1350
}
```

**Hand result** (`POST /results`, sent by the game service after every hand)

```json
{
  "tableId": "b2e4…",
  "handNumber": 1,
  "finishedAt": "2026-11-20T18:04:05.000Z",
  "players": [
    { "id": "p-ana", "net": 120, "won": true },
    { "id": "p-ben", "net": -90, "won": false },
    { "id": "p-cy", "net": -30, "won": false }
  ]
}
```

- `net` is chips won or lost in that hand; the values always add up to 0.
- `won` is true if the player won (part of) a pot someone else also paid into.
- `tableId` + `handNumber` is unique: if the same result arrives twice (a retry), the players
  service saves it once and answers `200`.
- The game service calls this with a **2 s timeout**. If it fails, the game continues and the
  failure is logged; the leaderboard simply misses that hand.

## 2. Game service REST API (lobby)

Owner: Person 3. Consumer: Person 5.

| Method | Path             | Body                  | Success                     | Errors                |
| ------ | ---------------- | --------------------- | --------------------------- | --------------------- |
| `POST` | `/tables`        | `{ "playerId": "…" }` | `201 { "tableId", "code" }` | `400`                 |
| `GET`  | `/tables/{code}` |                       | `200` table summary         | `404 TABLE_NOT_FOUND` |
| `GET`  | `/health`        |                       | `200 { "status": "ok" }`    |                       |

`code` is 6 characters, uppercase letters and digits without look-alikes (no `0`, `O`, `1`,
`I`), e.g. `"K7QX3M"`. Players share it to join.

**Table summary**

```json
{
  "tableId": "b2e4…",
  "code": "K7QX3M",
  "seatsTaken": 3,
  "maxSeats": 6,
  "handInProgress": false
}
```

Table settings are fixed for the MVP: blinds 5/10, starting stack 1000, 2–6 seats.

## 3. WebSocket (live table)

Owner: Person 3. Consumers: Persons 1, 4 and 5.

Connect to `wss://<game-service>/ws?code=K7QX3M&playerId=<id>`. Connecting seats the player at the
table (taking the first free seat) and the server immediately sends them a `state` message.
The game service fetches the player's name from the players service (`GET /players/{id}`, 2 s
timeout). If that service is down, the player is still seated with the name `"Guest"`, so games
keep working when the players service fails.
Every message has a `type`.

### Client → server

| `type`      | Fields                       | When                                                                                                                                    |
| ----------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `startHand` |                              | No hand is running and at least 2 players are seated. Only for the first hand: the next ones start automatically 5 s after a hand ends. |
| `action`    | `action`: see 4.1            | It is your turn.                                                                                                                        |
| `leave`     |                              | Leaving the table. Mid-hand you fold. Closing the socket does the same.                                                                 |
| `signal`    | `to`: player id, `data`: any | WebRTC video signaling (offer, answer, ICE candidate).                                                                                  |

```json
{ "type": "action", "action": { "type": "raise", "amount": 60 } }
```

### Server → client

| `type`   | Fields                                         | When                                                           |
| -------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `state`  | `table`: see 4.3, `turnEndsAt`: time or `null` | After every change, to every player, each with their own view. |
| `error`  | `code`, `message`                              | Only to the player whose message failed.                       |
| `signal` | `from`: player id, `data`: any                 | Relayed video signaling, unchanged.                            |

```json
{ "type": "error", "code": "NOT_YOUR_TURN", "message": "It is not your turn" }
```

**Turn timer:** 30 s per turn. `turnEndsAt` lets the UI draw the countdown. When it runs out the
server plays the default action: check if possible, otherwise fold.

**The server never trusts the client**: it checks every action against the rules, whatever
the UI enabled.

## 4. Engine formats

Owner: Person 2. Consumers: Persons 1, 3, 4, 5. These travel inside the WebSocket messages
above. The examples are real engine output.

### 4.1 Action (gestures and buttons → server)

| Gesture             | Button         | Action                              |
| ------------------- | -------------- | ----------------------------------- |
| Thumbs down         | Fold           | `{ "type": "fold" }`                |
| Double tap          | Check          | `{ "type": "check" }`               |
| Thumbs up           | Call           | `{ "type": "call" }`                |
| Palm up/down + fist | Raise + slider | `{ "type": "raise", "amount": 60 }` |
| Both hands forward  | All-in         | `{ "type": "allIn" }`               |

**`amount` is the total the player's bet will be on this street ("raise to"), not the chips
added.** If the current bet is 20 and I raise to 60, I send `60`, not `40`. `raise` is also used
for the first bet of a street.

### 4.2 Legal actions (server → player whose turn it is)

Part of the table view (`table.hand.legalActions`); `null` when it is not your turn.

```json
{
  "actions": ["fold", "check", "raise", "allIn"],
  "toCall": 0,
  "minRaiseTo": 10,
  "maxRaiseTo": 970,
  "allInTo": 970
}
```

| Field                      | Meaning                                                              | Used by                  |
| -------------------------- | -------------------------------------------------------------------- | ------------------------ |
| `actions`                  | Which actions are allowed now. Enable only these buttons / gestures. | UI, gestures             |
| `toCall`                   | Chips needed to call. Show it on the Call button ("Call 25").        | UI                       |
| `minRaiseTo`, `maxRaiseTo` | Raise slider limits ("raise to" amounts).                            | UI slider, raise gesture |
| `allInTo`                  | What the bet becomes if the player goes all-in.                      | UI                       |

### 4.3 Table view (server → each player)

What the UI draws. Each player gets their own version: their own hole cards, nobody else's.
Spectator views have no hole cards at all.

```json
{
  "config": {
    "smallBlind": 5,
    "bigBlind": 10,
    "startingStack": 1000,
    "maxSeats": 6
  },
  "handNumber": 1,
  "buttonSeat": 0,
  "seats": [
    { "id": "p-ana", "name": "Ana", "stack": 970, "leaving": false },
    { "id": "p-ben", "name": "Ben", "stack": 970, "leaving": false },
    { "id": "p-cy", "name": "Cy", "stack": 970, "leaving": false },
    null,
    null,
    null
  ],
  "hand": {
    "handNumber": 1,
    "phase": "flop",
    "board": ["Qs", "8h", "Tc"],
    "smallBlind": 5,
    "bigBlind": 10,
    "buttonId": "p-ana",
    "toAct": "p-ben",
    "currentBet": 0,
    "pot": 90,
    "players": [
      {
        "id": "p-ana",
        "stack": 970,
        "streetBet": 0,
        "totalBet": 30,
        "folded": false,
        "allIn": false,
        "holeCards": null
      },
      {
        "id": "p-ben",
        "stack": 970,
        "streetBet": 0,
        "totalBet": 30,
        "folded": false,
        "allIn": false,
        "holeCards": ["Js", "4d"]
      },
      {
        "id": "p-cy",
        "stack": 970,
        "streetBet": 0,
        "totalBet": 30,
        "folded": false,
        "allIn": false,
        "holeCards": null
      }
    ],
    "actions": [
      {
        "playerId": "p-ben",
        "type": "smallBlind",
        "amount": 5,
        "to": 5,
        "phase": "preflop"
      },
      {
        "playerId": "p-cy",
        "type": "bigBlind",
        "amount": 10,
        "to": 10,
        "phase": "preflop"
      },
      {
        "playerId": "p-ana",
        "type": "raise",
        "amount": 30,
        "to": 30,
        "phase": "preflop"
      },
      {
        "playerId": "p-ben",
        "type": "call",
        "amount": 25,
        "to": 30,
        "phase": "preflop"
      },
      {
        "playerId": "p-cy",
        "type": "call",
        "amount": 20,
        "to": 30,
        "phase": "preflop"
      }
    ],
    "legalActions": {
      "actions": ["fold", "check", "raise", "allIn"],
      "toCall": 0,
      "minRaiseTo": 10,
      "maxRaiseTo": 970,
      "allInTo": 970
    },
    "result": null
  },
  "lastResult": null
}
```

This is Ben's view: only his own cards are visible.

| Field                      | Meaning                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `seats`                    | Always `maxSeats` long; `null` is an empty seat. `stack` is live during a hand.               |
| `buttonSeat`               | Index in `seats` of the dealer button.                                                        |
| `hand`                     | `null` before the first hand. Stays filled after a hand ends, so the showdown can be shown.   |
| `hand.phase`               | `"preflop"`, `"flop"`, `"turn"`, `"river"` or `"complete"`.                                   |
| `hand.board`               | 0, 3, 4 or 5 cards.                                                                           |
| `hand.toAct`               | Id of the player whose turn it is; `null` when the hand is over.                              |
| `hand.pot`                 | All chips bet in this hand so far.                                                            |
| `hand.players[].streetBet` | Chips in front of the player on this street (draw them next to the seat).                     |
| `hand.players[].holeCards` | Your own 2 cards, revealed cards at showdown, otherwise `null`. Folded cards are never shown. |
| `hand.actions`             | Everything that happened in this hand, oldest first (for a log or animations).                |
| `hand.result`              | `null` until the hand ends, then the result below.                                            |
| `lastResult`               | Result of the last finished hand.                                                             |

### 4.4 Hand result (inside the view when a hand ends)

```json
{
  "handNumber": 1,
  "showdown": true,
  "board": ["Qs", "8h", "Tc", "Qc", "7s"],
  "pots": [
    {
      "amount": 210,
      "eligible": ["p-ana", "p-ben"],
      "winners": [{ "id": "p-ana", "amount": 210, "handName": "Two Pair" }]
    }
  ],
  "revealed": { "p-ana": ["Ts", "Jh"], "p-ben": ["Js", "4d"] },
  "hands": {
    "p-ana": { "name": "Two Pair", "cards": ["Ts", "Jh", "Qs", "Tc", "Qc"] },
    "p-ben": { "name": "Pair", "cards": ["Js", "Qs", "8h", "Tc", "Qc"] }
  },
  "players": [
    {
      "id": "p-ana",
      "startStack": 1000,
      "endStack": 1120,
      "net": 120,
      "won": true
    },
    {
      "id": "p-ben",
      "startStack": 1000,
      "endStack": 910,
      "net": -90,
      "won": false
    },
    {
      "id": "p-cy",
      "startStack": 1000,
      "endStack": 970,
      "net": -30,
      "won": false
    }
  ]
}
```

- `pots`: main pot first, then side pots. `handName` is `null` when everyone else folded.
- `showdown: false` means everyone else folded: `revealed` and `hands` are empty.
- `hands[id].cards` are the 5 cards that make the hand (to highlight them).
- The game service turns `players` into the `POST /results` body (section 1).

## 5. Error codes

| Code                  | HTTP | Meaning                                               |
| --------------------- | ---- | ----------------------------------------------------- |
| `INVALID_ACTION`      | 400  | Unknown action type or malformed message              |
| `INVALID_AMOUNT`      | 400  | Raise amount outside `minRaiseTo`–`maxRaiseTo`        |
| `INVALID_NAME`        | 400  | Profile name empty or too long                        |
| `ILLEGAL_ACTION`      | 409  | Action not allowed now (e.g. check when facing a bet) |
| `NOT_YOUR_TURN`       | 409  | Acting out of turn                                    |
| `HAND_IN_PROGRESS`    | 409  | `startHand` while a hand is running                   |
| `NOT_ENOUGH_PLAYERS`  | 409  | `startHand` with fewer than 2 players with chips      |
| `NO_HAND`             | 409  | Action when no hand is running                        |
| `TABLE_FULL`          | 409  | All seats taken                                       |
| `ALREADY_SEATED`      | 409  | Joining a table you are already at                    |
| `TABLE_NOT_FOUND`     | 404  | No table with that code                               |
| `PLAYER_NOT_FOUND`    | 404  | No profile with that id                               |
| `PLAYERS_UNAVAILABLE` | 503  | Players service down or too slow (2 s timeout)        |
| `INTERNAL_ERROR`      | 500  | Anything unexpected (details only in the logs)        |

The UI shows `message` to the player and can use `code` to decide what to do (e.g. on
`PLAYERS_UNAVAILABLE`, show the profile page as temporarily unavailable but let the game go on).
