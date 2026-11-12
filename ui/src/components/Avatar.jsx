import './Avatar.css';

export const PLAYER_COLOURS = 6;

/**
 * The colour a player picks. The players service stores it as `avatar`, a hex colour, and
 * defaults to lime (#B8F23A). Order and values match --player-1 … --player-6 in tokens.css.
 */
export const COLOUR_CHOICES = [
  { id: 'lime', label: 'Lime', hex: '#B8F23A' },
  { id: 'pink', label: 'Pink', hex: '#FF5FA2' },
  { id: 'blue', label: 'Blue', hex: '#5B8CFF' },
  { id: 'amber', label: 'Amber', hex: '#FFB020' },
  { id: 'teal', label: 'Teal', hex: '#2DD4BF' },
  { id: 'violet', label: 'Violet', hex: '#C084FC' },
];

/** CSS colour for a colour key, e.g. "pink" or "#FF5FA2" → "var(--player-2)". */
export function playerColour(key) {
  return `var(--player-${colourIndex(key) + 1})`;
}

/** "Alex" → "AL", "Ana Belén" → "AB" */
export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Picks one of the six player colours: a chosen colour ("pink" or its hex), a seat number, or any
 * other stable value such as a player id, so the same player keeps the same colour everywhere.
 */
export function colourIndex(key) {
  if (typeof key === 'number') return ((key % PLAYER_COLOURS) + PLAYER_COLOURS) % PLAYER_COLOURS;
  const wanted = String(key ?? '').toLowerCase();
  const chosen = COLOUR_CHOICES.findIndex(
    (choice) => choice.id === wanted || choice.hex.toLowerCase() === wanted,
  );
  if (chosen !== -1) return chosen;
  let hash = 0;
  for (const char of String(key ?? '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % PLAYER_COLOURS;
}

/** Round player badge with initials. size: "sm" | "md" | "lg" */
export function Avatar({ name, colourKey, size = 'md' }) {
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ '--avatar-bg': playerColour(colourKey ?? name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
