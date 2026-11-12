// Table codes are the table id in the game service: 6 letters or digits, e.g. K7QX2M.
// The service reads them case-insensitively, so 'k7qx2m' works too.
export const CODE_LENGTH = 6;

/** Cleans what was typed or pasted: "k7-qx 2m" → "K7QX2M". Keeps at most 6 characters. */
export function normalizeCode(input) {
  return String(input ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, CODE_LENGTH);
}

export function isCompleteCode(code) {
  return /^[A-Z0-9]{6}$/.test(code);
}
