import './Avatar.css';

export const PLAYER_COLOURS = 6;

/** "Alex" → "AL", "Ana Belén" → "AB" */
export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Picks one of the six player colours from a stable value (a player id or seat number),
 * so the same player keeps the same colour everywhere.
 */
export function colourIndex(key) {
  if (typeof key === 'number') return ((key % PLAYER_COLOURS) + PLAYER_COLOURS) % PLAYER_COLOURS;
  let hash = 0;
  for (const char of String(key ?? '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % PLAYER_COLOURS;
}

/** Round player badge with initials. size: "sm" | "md" | "lg" */
export function Avatar({ name, colourKey, size = 'md' }) {
  const colour = colourIndex(colourKey ?? name);
  return (
    <span
      className={`avatar avatar--${size}`}
      style={{ '--avatar-bg': `var(--player-${colour + 1})` }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
