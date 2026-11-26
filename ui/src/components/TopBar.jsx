import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Avatar } from './Avatar.jsx';
import { formatChips } from './Chips.jsx';
import { Logo } from './Logo.jsx';
import './TopBar.css';

// The pages reached from your avatar, instead of a row of nav links.
export const MENU_LINKS = [
  { to: '/menu', label: 'Main menu' },
  { to: '/tutorial', label: 'How to play' },
  { to: '/profile', label: 'Profile & settings' },
];

/** Logo on the left; your chips and avatar on the right once the player has loaded. */
export function TopBar({ player, showMainMenu = false }) {
  return (
    <header className="top-bar">
      <div className="row top-bar__nav">
        <Logo />
        {showMainMenu && (
          <Link className="btn btn--ghost top-bar__main-menu" to="/menu">
            Main menu
          </Link>
        )}
      </div>
      {player && (
        <div className="row top-bar__me">
          <span className="pill pill--quiet tabular">
            <span className="top-bar__chip" aria-hidden="true" />
            {formatChips(player.chips)} <span className="muted">play chips</span>
          </span>
          <PlayerMenu player={player} />
        </div>
      )}
    </header>
  );
}

/** Your avatar as a button that opens a small menu: Main menu, How to play, Profile & settings. */
function PlayerMenu({ player }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const wrapper = useRef(null);
  const button = useRef(null);
  const menuId = useId();

  // Closes on a click anywhere else, or on Escape (back to the avatar, so focus is not lost).
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!wrapper.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="top-bar__menu" ref={wrapper}>
      <button
        ref={button}
        type="button"
        className="top-bar__avatar"
        aria-label={`${player.name}: open menu`}
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <Avatar name={player.name} colourKey={player.avatar} />
      </button>

      {open && (
        <nav id={menuId} className="top-bar__dropdown" aria-label="Menu">
          <p className="top-bar__dropdown-name">{player.name}</p>
          <ul>
            {MENU_LINKS.map(({ to, label }) => (
              <li key={to}>
                <Link
                  to={to}
                  className="top-bar__link"
                  aria-current={pathname === to ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
