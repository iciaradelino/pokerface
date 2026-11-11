// "Simple auth" from plan.md: the player id lives in localStorage on this device. No passwords.
const KEY = 'pokerface.playerId';

export function getPlayerId() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function savePlayerId(id) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // Storage blocked (private mode): the player works until the tab closes.
  }
}

export function clearPlayerId() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}

/** Display names: 1 to 20 characters after trimming. Returns an error message or null. */
export const NAME_MAX = 20;

export function validateName(name) {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Enter a name so friends know who you are.';
  if (trimmed.length > NAME_MAX) return `Use ${NAME_MAX} characters or fewer.`;
  return null;
}
