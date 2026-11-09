/** Machine-readable error codes. The game service maps these to HTTP/WebSocket messages. */
export const ErrorCode = Object.freeze({
  INVALID_CONFIG: 'INVALID_CONFIG',
  INVALID_ACTION: 'INVALID_ACTION',
  ILLEGAL_ACTION: 'ILLEGAL_ACTION',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  NOT_YOUR_TURN: 'NOT_YOUR_TURN',
  UNKNOWN_PLAYER: 'UNKNOWN_PLAYER',
  HAND_OVER: 'HAND_OVER',
  HAND_IN_PROGRESS: 'HAND_IN_PROGRESS',
  NO_HAND: 'NO_HAND',
  NOT_ENOUGH_PLAYERS: 'NOT_ENOUGH_PLAYERS',
  SEAT_TAKEN: 'SEAT_TAKEN',
  TABLE_FULL: 'TABLE_FULL',
  ALREADY_SEATED: 'ALREADY_SEATED',
});

/** Error thrown for any rule violation. `code` is stable; `message` is safe to show to a player. */
export class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}
