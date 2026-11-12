import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, generateTableId, normalizeTableId } from '../src/validation.js';

describe('table codes', () => {
  it('generates 6-character codes without 0, O, 1 or I', () => {
    for (let i = 0; i < 200; i++) {
      const id = generateTableId();
      expect(id).toMatch(/^[A-Z2-9]{6}$/);
      expect(id).not.toMatch(/[01OI]/);
      expect([...id].every((c) => CODE_ALPHABET.includes(c))).toBe(true);
    }
  });

  it('normalizes typed codes and rejects malformed ones', () => {
    expect(normalizeTableId('k7qx2m')).toBe('K7QX2M');
    expect(normalizeTableId('K7QX2')).toBeNull();
    expect(normalizeTableId('K7QX2M!')).toBeNull();
    expect(normalizeTableId(undefined)).toBeNull();
  });
});