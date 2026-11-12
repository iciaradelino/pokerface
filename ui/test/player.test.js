import { afterEach, describe, expect, it } from 'vitest';
import { clearPlayerId, getPlayerId, savePlayerId, validateName } from '../src/player.js';

afterEach(() => clearPlayerId());

describe('player id', () => {
  it('is saved on this device and can be cleared', () => {
    expect(getPlayerId()).toBeNull();
    savePlayerId('p-1');
    expect(getPlayerId()).toBe('p-1');
    clearPlayerId();
    expect(getPlayerId()).toBeNull();
  });
});

describe('validateName', () => {
  it('accepts 1 to 20 characters after trimming', () => {
    expect(validateName(' A ')).toBeNull();
    expect(validateName('x'.repeat(20))).toBeNull();
  });

  it('rejects empty and long names', () => {
    expect(validateName('   ')).toMatch(/Enter a name/);
    expect(validateName('x'.repeat(21))).toMatch(/20 characters/);
  });
});
