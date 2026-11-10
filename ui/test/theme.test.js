import { afterEach, describe, expect, it } from 'vitest';
import { getTheme, setTheme } from '../src/theme.js';

afterEach(() => setTheme('system'));

describe('theme', () => {
  it('defaults to the system theme', () => {
    expect(getTheme()).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('forces and remembers a theme', () => {
    setTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(getTheme()).toBe('dark');

    setTheme('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(getTheme()).toBe('system');
  });
});
