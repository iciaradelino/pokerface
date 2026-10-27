# Pokerface

Online Texas Hold'em where you play **face to face over webcams** and act with **hand signals** instead of clicking buttons. Reading people (and hiding your own tells) is back in the game.

## Core experience

- Each player's browser shows the **poker table in the center** (community cards, pot, chips) with **every player's camera feed placed around it** at their seat, including your own.
- Your camera is always pointed at you. Others can see your face while you decide, just like a real table.
- You act with gestures that the app recognizes from your camera feed. Your hole cards are only visible on your own screen.

## Gestures (initial set)

| Action    | Gesture                          | Real-table equivalent      |
|-----------|----------------------------------|----------------------------|
| Check     | Tap index finger down twice      | Knocking on the table      |
| Call      | Thumbs up                        | Nod / push chips           |
| Fold      | Flat hand swipe away             | Mucking cards              |
| Raise     | Open palm, raise hand up/down to set amount, fist to confirm | Sliding chips forward |
| All-in    | Both hands pushed forward        | Pushing the whole stack    |

- **Confirmation:** a gesture must be held for ~1 s (progress ring on your tile) so accidental movements don't count.
- **Fallback:** on-screen buttons are always available for accessibility and when detection fails.

## How it works

- **Video:** WebRTC between players. Peer-to-peer mesh is fine for up to 6 players; switch to an SFU (e.g. LiveKit) if tables get bigger.
- **Gesture recognition:** runs in the browser (MediaPipe Hands / Gesture Recognizer). Only the recognized action is sent to the server, never the video.
- **Game server:** authoritative. It holds the deck, deals, validates actions and turn order, and pushes state to clients over WebSockets. Clients never receive other players' hole cards.
- **Frontend:** web app (e.g. React + Canvas/CSS for the table), so no install is needed.

## MVP scope

1. Create / join a private table with a link (2–6 players).
2. Camera tiles laid out around a central table.
3. Full Hold'em hand loop: blinds, deal, betting rounds, showdown, pot payout.
4. Gesture detection for check, call, fold, raise, with hold-to-confirm and button fallback.
5. Play chips only, no real money.

## Later ideas

- Short gesture tutorial / calibration before the first hand.
- Highlight the active player's tile, with a turn timer around it.
- Reactions (emoji gestures), spectator mode, hand history.
- Custom gesture mapping per player.

## Risks & open questions

- **Detection reliability** across lighting, camera angles and skin tones: needs testing early.
- **Latency/bandwidth** with many video streams on weak connections.
- **Cheating:** players at the same location, or a second screen. Accepted for friends' games.
- **Privacy:** camera permissions, no recording by default.
- **Legal:** real-money play would mean gambling regulation, so it stays out of scope.
