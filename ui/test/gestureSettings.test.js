import { describe, expect, it } from 'vitest';
import { formatHold, gesturesOn, holdMsOf } from '../src/gestureSettings.js';

describe('gesture settings', () => {
  it('defaults to gestures on and a one-second hold', () => {
    expect(gesturesOn(null)).toBe(true);
    expect(gesturesOn({ gestureSettings: {} })).toBe(true);
    expect(gesturesOn({ gestureSettings: { enabled: false } })).toBe(false);
    expect(holdMsOf({ gestureSettings: {} })).toBe(1000);
    expect(holdMsOf({ gestureSettings: { holdMs: 'slow' } })).toBe(1000);
  });

  it('keeps a saved hold time within 0.5 to 2 seconds', () => {
    expect(holdMsOf({ gestureSettings: { holdMs: 1500 } })).toBe(1500);
    expect(holdMsOf({ gestureSettings: { holdMs: 50 } })).toBe(500);
    expect(holdMsOf({ gestureSettings: { holdMs: 9000 } })).toBe(2000);
  });

  it('shows the hold time in seconds', () => {
    expect(formatHold(1000)).toBe('1.0 s');
    expect(formatHold(1500)).toBe('1.5 s');
  });
});
