import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlayingCard, parseCard } from '../src/components/PlayingCard.jsx';
import { Avatar, colourIndex, initials, playerColour } from '../src/components/Avatar.jsx';
import { formatChips, formatDelta } from '../src/components/Chips.jsx';
import { Button } from '../src/components/Button.jsx';

describe('PlayingCard', () => {
  it('parses engine card strings', () => {
    expect(parseCard('Td')).toMatchObject({ rank: '10', label: 'Ten of diamonds' });
    expect(parseCard('As').suit.red).toBe(false);
    expect(parseCard('9h').suit.red).toBe(true);
    expect(parseCard('Xx')).toBeNull();
    expect(parseCard(undefined)).toBeNull();
  });

  it('names the card for screen readers', () => {
    render(<PlayingCard card="Kh" />);
    expect(screen.getByRole('img', { name: 'King of hearts' })).toHaveClass('playing-card--red');
  });

  it('shows the back when the card is hidden', () => {
    render(<PlayingCard />);
    expect(screen.getByRole('img', { name: 'Hidden card' })).toHaveClass('playing-card--back');
  });
});

describe('Avatar', () => {
  it('builds initials', () => {
    expect(initials('Alex')).toBe('AL');
    expect(initials('  Ana   Belén ')).toBe('AB');
    expect(initials('')).toBe('?');
  });

  it('keeps colours stable and within the six player colours', () => {
    expect(colourIndex('player-123')).toBe(colourIndex('player-123'));
    expect(colourIndex(7)).toBe(1);
    expect(colourIndex(-1)).toBe(5);
    for (const key of ['a', 'bb', 'Sofía', 42]) {
      expect(colourIndex(key)).toBeGreaterThanOrEqual(0);
      expect(colourIndex(key)).toBeLessThan(6);
    }
  });

  it('renders the initials in the seat colour', () => {
    const { container } = render(<Avatar name="Marco" colourKey={2} />);
    expect(container.firstChild).toHaveTextContent('MA');
    expect(container.firstChild.style.getPropertyValue('--avatar-bg')).toBe('var(--player-3)');
  });
});

describe('chip formatting', () => {
  it('formats amounts and deltas', () => {
    expect(formatChips(8450)).toBe('8,450');
    expect(formatChips(-1200)).toBe('−1,200');
    expect(formatDelta(450)).toBe('+450');
    expect(formatDelta(-400)).toBe('−400');
    expect(formatDelta(0)).toBe('0');
  });
});

describe('Button', () => {
  it('applies variant and size classes', () => {
    render(
      <Button variant="lime" size="primary" block>
        Start
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Start' });
    expect(button).toHaveClass('btn', 'btn--lime', 'btn--primary-size', 'btn--block');
    expect(button).toHaveAttribute('type', 'button');
  });
});

describe('chosen colours', () => {
  it('maps colour names to the player colour tokens', () => {
    expect(colourIndex('lime')).toBe(0);
    expect(colourIndex('violet')).toBe(5);
    expect(playerColour('pink')).toBe('var(--player-2)');
  });
});
