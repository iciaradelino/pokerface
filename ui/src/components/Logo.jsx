import './Logo.css';

/** Lime badge with a spade (same drawing as public/favicon.svg), plus the word mark. */
export function Logo({ className = '' }) {
  return (
    <span className={`logo ${className}`}>
      <svg className="logo__mark" viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="10" fill="var(--color-lime)" />
        <path
          d="M16 7c-3 4-8 6.5-8 10.5a4 4 0 0 0 6.6 3L13 25h6l-1.6-4.5a4 4 0 0 0 6.6-3C24 13.5 19 11 16 7z"
          fill="var(--color-on-lime)"
        />
      </svg>
      <span className="logo__word">Pokerface</span>
    </span>
  );
}
