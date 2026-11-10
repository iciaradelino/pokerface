// Input checks for the players API. Each function returns { value } or { error }.
export const DEFAULT_AVATAR = '#B8F23A';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLOR = /^#[0-9a-f]{6}$/i;
const MAX_SETTINGS_LENGTH = 1000;

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Validates the body of POST /players (create) and PUT /players/:id (update).
 * Unknown fields are ignored, so a client cannot set `chips`.
 * On update, omitted optional fields stay `undefined` so the stored value is kept.
 */
export function validatePlayerInput(body, { forCreate }) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const name = typeof body.name === 'string' ? body.name.trim() : body.name;
  if (typeof name !== 'string' || name.length < 1 || name.length > 30) {
    return { error: 'name is required and must be 1 to 30 characters' };
  }

  let avatar = body.avatar;
  if (avatar === undefined) {
    avatar = forCreate ? DEFAULT_AVATAR : undefined;
  } else if (typeof avatar !== 'string' || !COLOR.test(avatar)) {
    return { error: 'avatar must be a hex colour such as #B8F23A' };
  }

  let gestureSettings = body.gestureSettings;
  if (gestureSettings === undefined) {
    gestureSettings = forCreate ? {} : undefined;
  } else if (
    gestureSettings === null ||
    typeof gestureSettings !== 'object' ||
    Array.isArray(gestureSettings) ||
    JSON.stringify(gestureSettings).length > MAX_SETTINGS_LENGTH
  ) {
    return { error: 'gestureSettings must be a small JSON object' };
  }

  return { value: { name, avatar, gestureSettings } };
}
