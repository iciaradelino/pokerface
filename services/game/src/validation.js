// Input checks for the tables API. Each validate* function returns { value } or { error }.
import { randomInt } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Join codes leave out 0/O and 1/I, which are easy to confuse when read out loud.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
const CODE = /^[A-Z0-9]{6}$/;

// Same defaults and rules as the poker engine and migration 002.
export const DEFAULT_SETTINGS = Object.freeze({
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000,
  maxSeats: 6,
});
const MAX_BLIND = 1_000_000;
const MAX_STACK = 1_000_000_000;

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

export function generateTableId() {
  let id = '';
  for (let i = 0; i < CODE_LENGTH; i++) id += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return id;
}

/** Codes are typed by people, so 'k7qx2m' is accepted and read as 'K7QX2M'. Returns null if malformed. */
export function normalizeTableId(value) {
  if (typeof value !== 'string') return null;
  const id = value.toUpperCase();
  return CODE.test(id) ? id : null;
}

function isObject(body) {
  return body !== null && typeof body === 'object' && !Array.isArray(body);
}

const isWhole = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

/** Validates the body of POST /tables: { playerId, smallBlind?, bigBlind?, startingStack?, maxSeats? }. */
export function validateCreateTableInput(body) {
  if (!isObject(body)) return { error: 'Request body must be a JSON object' };
  if (!isUuid(body.playerId)) return { error: 'playerId must be a UUID' };

  const settings = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (body[key] !== undefined) settings[key] = body[key];
  }
  const { smallBlind, bigBlind, startingStack, maxSeats } = settings;
  if (!isWhole(smallBlind, 1, MAX_BLIND) || !isWhole(bigBlind, smallBlind, MAX_BLIND)) {
    return { error: `Blinds must be whole numbers from 1 to ${MAX_BLIND}, small blind not above the big blind` };
  }
  if (!isWhole(startingStack, bigBlind, MAX_STACK)) {
    return { error: 'startingStack must be a whole number of at least one big blind' };
  }
  if (!isWhole(maxSeats, 2, 6)) return { error: 'maxSeats must be a whole number from 2 to 6' };

  return { value: { playerId: body.playerId.toLowerCase(), settings } };
}

/** Validates the body of POST /tables/:id/join: { playerId }. */
export function validateJoinInput(body) {
  if (!isObject(body)) return { error: 'Request body must be a JSON object' };
  if (!isUuid(body.playerId)) return { error: 'playerId must be a UUID' };
  return { value: { playerId: body.playerId.toLowerCase() } };
}