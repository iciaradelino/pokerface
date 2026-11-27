const MIC = (
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </>
);

// Line icons from docs/styling.md: 20px, 2px stroke, rounded ends. Colour follows the text.
const PATHS = {
  mic: MIC,
  micOff: (
    <>
      {MIC}
      <path d="M4 4l16 16" />
    </>
  ),
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
  // Two fingers up in a V (check).
  peace: <path d="M9 3l1.5 9M15 3l-1.5 9M7 12h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5Z" />,
  upDown: <path d="M12 3v18M8 7l4-4 4 4M8 17l4 4 4-4" />,
  allIn: (
    <path d="M8 22v-2L3 14a1.5 1.5 0 0 1 2.2-2L8 14V4a1.5 1.5 0 0 1 3 0v7m0 0v-1a1.5 1.5 0 0 1 3 0v2m0 0v-1a1.5 1.5 0 0 1 3 0v2l2-5a1.5 1.5 0 0 1 2.8 1.1L20 17a5 5 0 0 1-3 4v1Z" />
  ),
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
