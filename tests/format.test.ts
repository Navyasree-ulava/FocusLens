import { describe, expect, it } from 'vitest';
import { formatMinutes } from '../src/format';

describe('formatMinutes', () => {
  it('formats minutes and hours without inventing a value', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(48)).toBe('48m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(86)).toBe('1h 26m');
  });

  it('rejects values that cannot represent elapsed time', () => {
    expect(() => formatMinutes(-1)).toThrow(RangeError);
    expect(() => formatMinutes(Number.NaN)).toThrow(RangeError);
  });
});
