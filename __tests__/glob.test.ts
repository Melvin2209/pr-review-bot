import { describe, expect, it } from 'vitest';
import { matchesAny } from '../src/glob.js';

describe('matchesAny', () => {
  it('matches dotfiles and nested paths', () => {
    expect(matchesAny('.github/workflows/ci.yml', ['**/*.yml'])).toBe(true);
    expect(matchesAny('packages/a/package-lock.json', ['**/package-lock.json'])).toBe(true);
    expect(matchesAny('package-lock.json', ['**/package-lock.json'])).toBe(true);
  });

  it('supports brace expansion and returns false without a match', () => {
    expect(matchesAny('src/a.tsx', ['src/**/*.{ts,tsx}'])).toBe(true);
    expect(matchesAny('lib/a.ts', ['src/**/*.{ts,tsx}'])).toBe(false);
    expect(matchesAny('anything', [])).toBe(false);
  });
});
