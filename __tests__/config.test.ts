import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_CONFIG, parseConfig } from '../src/config.js';

describe('parseConfig', () => {
  it('returns the defaults for a missing or empty file', () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(parseConfig('')).toEqual(DEFAULT_CONFIG);
    expect(parseConfig('# only a comment\n')).toEqual(DEFAULT_CONFIG);
  });

  it('does not let callers mutate the defaults', () => {
    parseConfig(null).size.exclude.push('oops');
    expect(DEFAULT_CONFIG.size.exclude).not.toContain('oops');
  });

  it('merges partial sections over the defaults', () => {
    const config = parseConfig(`
size:
  warn: 200
  max: 500
tests:
  severity: error
`);
    expect(config.size).toMatchObject({ enabled: true, warn: 200, max: 500, exclude: DEFAULT_CONFIG.size.exclude });
    expect(config.tests.severity).toBe('error');
    expect(config.leftovers).toEqual(DEFAULT_CONFIG.leftovers);
  });

  it('accepts `false` as a shorthand to disable a check', () => {
    const config = parseConfig('tests: false\ndependencies: false\n');
    expect(config.tests.enabled).toBe(false);
    expect(config.dependencies.enabled).toBe(false);
    expect(config.size.enabled).toBe(true);
  });

  it('supports add/remove on list fields', () => {
    const config = parseConfig(`
dependencies:
  allow:
    add: [MPL-2.0]
    remove: [Unlicense]
size:
  exclude:
    add: ['generated/**']
`);
    expect(config.dependencies.allow).toContain('MPL-2.0');
    expect(config.dependencies.allow).not.toContain('Unlicense');
    expect(config.dependencies.allow).toContain('MIT');
    expect(config.size.exclude).toEqual([...DEFAULT_CONFIG.size.exclude, 'generated/**']);
  });

  it('replaces lists given as plain arrays', () => {
    expect(parseConfig('dependencies:\n  allow: [MIT]\n').dependencies.allow).toEqual(['MIT']);
  });

  it('parses custom leftover rules', () => {
    const config = parseConfig(`
leftovers:
  rules:
    - name: print
      pattern: 'fmt\\.Println'
      severity: info
    - name: nocommit
      pattern: 'nocommit'
      flags: i
`);
    expect(config.leftovers.rules).toEqual([
      { name: 'print', pattern: 'fmt\\.Println', severity: 'info', flags: undefined },
      { name: 'nocommit', pattern: 'nocommit', severity: 'warning', flags: 'i' },
    ]);
  });

  it.each([
    ['size: [1, 2]', /`size` must be a mapping/],
    ['size:\n  warn: -1', /`size.warn` must be a non-negative integer/],
    ['size:\n  warn: 500\n  max: 100', /`size.max` \(100\) must be greater/],
    ['tests:\n  severity: fatal', /`tests.severity` must be error \| warning \| info/],
    ['leftovers:\n  rules:\n    - name: x\n      pattern: "("', /not a valid regex/],
    ['leftovers:\n  rules:\n    - name: x', /needs both `name` and `pattern`/],
    ['sizes:\n  warn: 1', /Unknown top-level key\(s\): sizes/],
    ['- just\n- a list', /must contain a YAML mapping/],
    ['size: {warn: 1', /Invalid YAML/],
  ])('rejects invalid config %#', (yaml, message) => {
    expect(() => parseConfig(yaml)).toThrow(ConfigError);
    expect(() => parseConfig(yaml)).toThrow(message);
  });
});
