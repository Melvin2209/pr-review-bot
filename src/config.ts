import { parse } from 'yaml';
import type { Severity } from './types.js';

export interface LeftoverRule {
  name: string;
  pattern: string;
  severity: Severity;
  /** Extra regex flags, e.g. `i` for a case-insensitive rule. */
  flags?: string;
}

export interface Config {
  size: {
    enabled: boolean;
    /** Changed lines (additions + deletions) above which the PR gets a warning. */
    warn: number;
    /** Changed lines above which the PR gets an error. */
    max: number;
    exclude: string[];
  };
  tests: {
    enabled: boolean;
    severity: Severity;
    source: string[];
    test: string[];
    ignore: string[];
  };
  leftovers: {
    enabled: boolean;
    rules: LeftoverRule[];
    exclude: string[];
  };
  dependencies: {
    enabled: boolean;
    devDependencies: boolean;
    allow: string[];
    deny: string[];
    /** Severity for a license that is neither allowed nor denied (or unknown). */
    unknownSeverity: Severity;
  };
  score: {
    penalties: Record<Severity, number>;
    /** Cap on what a single check can remove, so 40 TODOs don't hide everything else. */
    maxPenaltyPerCheck: number;
  };
  comment: {
    enabled: boolean;
    header: string;
  };
}

export const DEFAULT_CONFIG: Config = {
  size: {
    enabled: true,
    warn: 400,
    max: 1000,
    exclude: [
      '**/package-lock.json',
      '**/yarn.lock',
      '**/pnpm-lock.yaml',
      '**/poetry.lock',
      '**/Cargo.lock',
      '**/go.sum',
      'dist/**',
      '**/*.snap',
      '**/*.min.js',
    ],
  },
  tests: {
    enabled: true,
    severity: 'warning',
    source: ['src/**/*.{ts,tsx,js,jsx,mjs,cjs}', 'lib/**/*.{ts,tsx,js,jsx}', 'app/**/*.{ts,tsx,js,jsx}', '**/*.py'],
    test: [
      '**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}',
      '**/__tests__/**',
      '**/test/**',
      '**/tests/**',
      '**/test_*.py',
      '**/*_test.py',
    ],
    ignore: ['**/*.d.ts', '**/index.{ts,js}', '**/types.ts', '**/__init__.py', '**/*.config.*'],
  },
  leftovers: {
    enabled: true,
    rules: [
      { name: 'TODO', pattern: '\\b(TODO|FIXME|XXX|HACK)\\b', severity: 'warning' },
      { name: 'console.log', pattern: '\\bconsole\\.(log|debug|trace)\\s*\\(', severity: 'error' },
      { name: 'debugger', pattern: '^\\s*debugger\\s*;?\\s*$', severity: 'error' },
      { name: 'focused test', pattern: '\\b(it|describe|test)\\.only\\s*\\(', severity: 'error' },
      { name: 'print()', pattern: '^\\s*print\\(', severity: 'warning' },
    ],
    exclude: ['**/*.md', '**/*.{test,spec}.*', '**/__tests__/**', 'dist/**', '**/*.lock', '.pr-review.yml'],
  },
  dependencies: {
    enabled: true,
    devDependencies: true,
    allow: ['MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Unlicense', 'CC0-1.0', 'BlueOak-1.0.0', 'Python-2.0'],
    deny: ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'LGPL-2.1', 'LGPL-3.0', 'SSPL-1.0', 'BUSL-1.1'],
    unknownSeverity: 'warning',
  },
  score: {
    penalties: { error: 15, warning: 5, info: 1 },
    maxPenaltyPerCheck: 40,
  },
  comment: {
    enabled: true,
    header: 'PR Review Bot',
  },
};

export class ConfigError extends Error {
  override name = 'ConfigError';
}

const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info'];

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function pick<T>(src: Obj, key: string, path: string, check: (v: unknown) => v is T, expected: string, fallback: T): T {
  if (!(key in src) || src[key] === null || src[key] === undefined) return fallback;
  const value = src[key];
  if (!check(value)) {
    throw new ConfigError(`\`${path}.${key}\` must be ${expected}, got ${JSON.stringify(value)}`);
  }
  return value;
}

const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isPosInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isStrList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');
const isSeverity = (v: unknown): v is Severity => typeof v === 'string' && (SEVERITIES as string[]).includes(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function section(raw: Obj, key: string): Obj {
  const value = raw[key];
  if (value === undefined || value === null) return {};
  // `tests: false` is a handy shorthand for disabling a check.
  if (value === false) return { enabled: false };
  if (value === true) return { enabled: true };
  if (!isObj(value)) throw new ConfigError(`\`${key}\` must be a mapping (or true/false)`);
  return value;
}

/** List fields accept `extend` semantics: `{ add: [...] }` appends to the defaults. */
function list(src: Obj, key: string, path: string, fallback: string[]): string[] {
  const value = src[key];
  if (isObj(value) && ('add' in value || 'remove' in value)) {
    const add = pick(value, 'add', `${path}.${key}`, isStrList, 'a list of strings', []);
    const remove = pick(value, 'remove', `${path}.${key}`, isStrList, 'a list of strings', []);
    return [...fallback.filter((item) => !remove.includes(item)), ...add];
  }
  return pick(src, key, path, isStrList, 'a list of strings (or { add, remove })', fallback);
}

function parseRules(src: Obj, fallback: LeftoverRule[]): LeftoverRule[] {
  const value = src.rules;
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) throw new ConfigError('`leftovers.rules` must be a list');
  return value.map((rule, i) => {
    const path = `leftovers.rules[${i}]`;
    if (!isObj(rule)) throw new ConfigError(`\`${path}\` must be a mapping`);
    const name = pick(rule, 'name', path, isStr, 'a string', '');
    const pattern = pick(rule, 'pattern', path, isStr, 'a string', '');
    if (!name || !pattern) throw new ConfigError(`\`${path}\` needs both \`name\` and \`pattern\``);
    const flags = pick(rule, 'flags', path, isStr, 'a string', '');
    try {
      new RegExp(pattern, flags);
    } catch (err) {
      throw new ConfigError(`\`${path}.pattern\` is not a valid regex: ${(err as Error).message}`);
    }
    return { name, pattern, flags: flags || undefined, severity: pick(rule, 'severity', path, isSeverity, 'error | warning | info', 'warning') };
  });
}

/** Parse and validate the YAML content of `.pr-review.yml`, merged over the defaults. */
export function parseConfig(yamlText: string | null | undefined): Config {
  if (!yamlText || !yamlText.trim()) return structuredClone(DEFAULT_CONFIG);

  let raw: unknown;
  try {
    raw = parse(yamlText);
  } catch (err) {
    throw new ConfigError(`Invalid YAML: ${(err as Error).message}`);
  }
  if (raw === null || raw === undefined) return structuredClone(DEFAULT_CONFIG);
  if (!isObj(raw)) throw new ConfigError('The configuration file must contain a YAML mapping');

  const known = ['size', 'tests', 'leftovers', 'dependencies', 'score', 'comment'];
  const unknown = Object.keys(raw).filter((k) => !known.includes(k));
  if (unknown.length > 0) {
    throw new ConfigError(`Unknown top-level key(s): ${unknown.join(', ')}. Expected one of: ${known.join(', ')}`);
  }

  const d = DEFAULT_CONFIG;
  const size = section(raw, 'size');
  const tests = section(raw, 'tests');
  const leftovers = section(raw, 'leftovers');
  const deps = section(raw, 'dependencies');
  const score = section(raw, 'score');
  const comment = section(raw, 'comment');
  const penalties = isObj(score.penalties) ? score.penalties : {};

  const config: Config = {
    size: {
      enabled: pick(size, 'enabled', 'size', isBool, 'a boolean', d.size.enabled),
      warn: pick(size, 'warn', 'size', isPosInt, 'a non-negative integer', d.size.warn),
      max: pick(size, 'max', 'size', isPosInt, 'a non-negative integer', d.size.max),
      exclude: list(size, 'exclude', 'size', d.size.exclude),
    },
    tests: {
      enabled: pick(tests, 'enabled', 'tests', isBool, 'a boolean', d.tests.enabled),
      severity: pick(tests, 'severity', 'tests', isSeverity, 'error | warning | info', d.tests.severity),
      source: list(tests, 'source', 'tests', d.tests.source),
      test: list(tests, 'test', 'tests', d.tests.test),
      ignore: list(tests, 'ignore', 'tests', d.tests.ignore),
    },
    leftovers: {
      enabled: pick(leftovers, 'enabled', 'leftovers', isBool, 'a boolean', d.leftovers.enabled),
      rules: parseRules(leftovers, d.leftovers.rules),
      exclude: list(leftovers, 'exclude', 'leftovers', d.leftovers.exclude),
    },
    dependencies: {
      enabled: pick(deps, 'enabled', 'dependencies', isBool, 'a boolean', d.dependencies.enabled),
      devDependencies: pick(deps, 'devDependencies', 'dependencies', isBool, 'a boolean', d.dependencies.devDependencies),
      allow: list(deps, 'allow', 'dependencies', d.dependencies.allow),
      deny: list(deps, 'deny', 'dependencies', d.dependencies.deny),
      unknownSeverity: pick(deps, 'unknownSeverity', 'dependencies', isSeverity, 'error | warning | info', d.dependencies.unknownSeverity),
    },
    score: {
      penalties: {
        error: pick(penalties, 'error', 'score.penalties', isPosInt, 'a non-negative integer', d.score.penalties.error),
        warning: pick(penalties, 'warning', 'score.penalties', isPosInt, 'a non-negative integer', d.score.penalties.warning),
        info: pick(penalties, 'info', 'score.penalties', isPosInt, 'a non-negative integer', d.score.penalties.info),
      },
      maxPenaltyPerCheck: pick(score, 'maxPenaltyPerCheck', 'score', isPosInt, 'a non-negative integer', d.score.maxPenaltyPerCheck),
    },
    comment: {
      enabled: pick(comment, 'enabled', 'comment', isBool, 'a boolean', d.comment.enabled),
      header: pick(comment, 'header', 'comment', isStr, 'a string', d.comment.header),
    },
  };

  if (config.size.max < config.size.warn) {
    throw new ConfigError(`\`size.max\` (${config.size.max}) must be greater than or equal to \`size.warn\` (${config.size.warn})`);
  }
  return config;
}
