# Video (`ui/video/`)

Webcam tiles for the table. Owner: Laura.

Peer-to-peer WebRTC, one connection per other player (a mesh, fine up to 6 players). The video
never goes through our servers. Public STUN only, no TURN (plan.md §2), so two players behind
strict NATs may not connect; their tile shows "Video unavailable" and the game still works.

| File            | What it is                                                                  |
| --------------- | --------------------------------------------------------------------------- |
| `mesh.js`       | The connections. No React, no WebSocket: it gets `send` and `handleSignal`. |
| `useVideo.js`   | React hook: asks for the camera, runs the mesh, returns what to show.       |
| `VideoTile.jsx` | The picture for one seat, with a fallback and a notice.                     |

## Using it

```jsx
const { camera, local, remotes, retry, hasMic, micOn, toggleMic } = useVideo({
  playerId,
  peerIds: state.seats.map((seat) => seat.playerId),
  send, // (toPlayerId, data) => sends { type: "signal", from, to, data } on the table socket
  onSignal, // (listener) => unsubscribe; listener(from, data) for each incoming "signal"
});

<VideoTile
  stream={isMe ? local : remotes[seat.playerId]?.stream}
  isMe={isMe}
  camera={camera}
  state={remotes[seat.playerId]?.state}
  onRetry={retry}
>
  {/* the seat silhouette, shown until there is a picture */}
</VideoTile>;
```

`send` and `onSignal` must keep the same identity between renders (wrap them in `useCallback`).

## What the game service has to do

Relay `{ type: "signal", from, to, data }` to the player `to` at the same table, and nothing else
(plan.md §6). The server should set `from` itself from the connection, not trust the client, and
drop signals for players who are not at the table. `data` is `{ description }` (an SDP offer or
answer) or `{ candidate }`, and the server does not need to read it.

## Decisions

- **Video and sound.** The mic uses echo cancellation, and my own tile is muted so I never hear
  myself. If only the microphone fails (missing or blocked), it falls back to the camera alone.
  `toggleMic()` mutes by disabling the audio track, so the camera keeps working. Whoever uses
  the hook decides where to put the mute button (it is not part of `VideoTile`).
- **320x240 at 15 fps.** Six tiles at full size are heavy on a weak connection.
- **"Perfect negotiation".** Both players can offer at once without clashing: the one with the
  higher id is "polite" and backs down. No coordination needed.
