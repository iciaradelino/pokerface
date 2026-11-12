import { Avatar } from './Avatar.jsx';
import { formatChips } from './Chips.jsx';
import { Logo } from './Logo.jsx';
import './TopBar.css';

/** Logo on the left; your chips and avatar on the right once the player has loaded. */
export function TopBar({ player }) {
  return (
    <header className="top-bar">
      <Logo />
      {player && (
        <div className="row top-bar__me">
          <span className="pill pill--quiet tabular">
            <span className="top-bar__chip" aria-hidden="true" />
            {formatChips(player.chips)} <span className="muted">play chips</span>
          </span>
          <Avatar name={player.name} colourKey={player.avatar} />
        </div>
      )}
    </header>
  );
}
