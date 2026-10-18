import { describe, expect, it } from 'vitest';
import { buildSuggestions } from '../src/report/suggestions.js';
import type { CheckOutcome, DependenciesResult, LeftoversResult, SizeResult, TestsResult } from '../src/types.js';
import { file } from './helpers/fixtures.js';

const off = { enabled: false, result: null, findings: [] };
const on = <T>(result: T): CheckOutcome<T> => ({ enabled: true, result, findings: [] });
const size = (level: SizeResult['level']) => on<SizeResult>({ additions: 0, deletions: 0, changedLines: 0, files: 0, excludedFiles: 0, level });

describe('buildSuggestions', () => {
  it('suggests nothing for a clean PR', () => {
    expect(buildSuggestions({ size: size('ok'), tests: on<TestsResult>({ checkedFiles: 1, missing: [] }), leftovers: off, dependencies: off }, [])).toEqual([]);
  });

  it('names the biggest areas when splitting a PR, or gives generic advice', () => {
    const files = [file('src/api/a.ts', { additions: 500 }), file('web/b.ts', { additions: 300 }), file('README.md', { additions: 5 })];
    const [split] = buildSuggestions({ size: size('error'), tests: off, leftovers: off, dependencies: off }, files);
    expect(split).toBe('Split this PR into smaller ones — the biggest areas are `src/api` (500 lines), `web` (300 lines), `(root)` (5 lines).');
    const [generic] = buildSuggestions({ size: size('warning'), tests: off, leftovers: off, dependencies: off }, [file('src/a.ts')]);
    expect(generic).toContain('independently reviewable steps');
  });

  it('separates missing tests from stale ones and summarises long lists', () => {
    const missing = ['a', 'b', 'c', 'd', 'e'].map((n) => ({ file: `src/${n}.ts` }));
    const out = buildSuggestions(
      { size: off, tests: on<TestsResult>({ checkedFiles: 6, missing: [...missing, { file: 'src/f.ts', existingTest: 'src/f.test.ts' }] }), leftovers: off, dependencies: off },
      [],
    );
    expect(out).toEqual(['Add tests for `src/a.ts`, `src/b.ts`, `src/c.ts` and 2 more.', 'Check whether `src/f.test.ts` should cover the new behaviour.']);
  });

  it('covers leftovers and dependencies', () => {
    const leftovers = on<LeftoversResult>({ items: [{ file: 'a', line: 1, rule: 'debugger', severity: 'error', text: '' }] });
    const dependencies = on<DependenciesResult>({
      added: [{ name: 'x', version: '1', ecosystem: 'npm', manifest: 'package.json', dev: false, license: null, status: 'unknown' }],
    });
    expect(buildSuggestions({ size: off, tests: off, leftovers, dependencies }, [])).toEqual([
      'Remove leftover debugging code (`debugger`).',
      'Verify the license of `x`; if acceptable, add it to `dependencies.allow` in `.pr-review.yml`.',
    ]);
  });
});
