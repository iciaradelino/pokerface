// Line icons from docs/styling.md: 20px, 2px stroke, rounded ends. Colour follows the text.
const PATHS = {
  camera: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="m15.5 10.5 5-3v9l-5-3" />
    </>
  ),
  thumbsUp: (
    <>
      <path d="M7 10v11" />
      <path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3l3.6-7a2.4 2.4 0 0 1 4.4 1.9Z" />
    </>
  ),
  thumbsDown: (
    // The thumbs up, upside down.
    <g transform="matrix(1 0 0 -1 0 24)">
      <path d="M7 10v11" />
      <path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.5l-2.3 7A2 2 0 0 1 17.5 21H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3l3.6-7a2.4 2.4 0 0 1 4.4 1.9Z" />
    </g>
  ),
  knock: <path d="M9 4v9M15 4v9M4 19h16" />,
  upDown: <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />,
  allIn: <path d="m4 7 5 5-5 5M11 7l5 5-5 5M20 6v12" />,
  chip: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </>
  ),
};

export function Icon({ name, size = 20, title }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : 'true'}
      aria-label={title}
    >
      {PATHS[name]}
    </svg>
  );
}
