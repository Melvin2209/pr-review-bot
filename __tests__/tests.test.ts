import { describe, expect, it } from 'vitest';
import { analyzeTests, moduleKey } from '../src/analyzers/tests.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { file, fixture, prFiles } from './helpers/fixtures.js';

const tree = fixture<{ tree: { path: string; type: string }[] }>('api/git.getTree.json')
  .tree.filter((e) => e.type === 'blob')
  .map((e) => e.path);

describe('moduleKey', () => {
  it.each([
    ['src/utils/date.ts', 'date'],
    ['src/utils/date.test.ts', 'date'],
    ['src/Button.spec.tsx', 'button'],
    ['tests/test_parser.py', 'parser'],
    ['pkg/parser_test.py', 'parser'],
    ['e2e/login.e2e.ts', 'login'],
  ])('%s → %s', (path, key) => expect(moduleKey(path)).toBe(key));
});

describe('analyzeTests', () => {
  it('flags source files without a test in the PR, noting existing tests', () => {
    const { result, findings } = analyzeTests(prFiles(), tree, DEFAULT_CONFIG.tests);
    // cart.ts has cart.test.ts in the PR; discount.ts has no test; format.ts has one that wasn't updated.
    expect(result.checkedFiles).toBe(3);
    expect(result.missing).toEqual([
      { file: 'src/checkout/discount.ts' },
      { file: 'src/checkout/format.ts', existingTest: 'test/checkout/format.spec.ts' },
    ]);
    expect(findings.map((f) => f.severity)).toEqual(['warning', 'warning']);
    expect(findings[1]!.message).toContain('was not updated');
  });

  it('ignores removed files, non-source files and ignored patterns', () => {
    const files = [
      file('src/old.ts', { status: 'removed' }),
      file('README.md'),
      file('src/index.ts'),
      file('src/types.d.ts'),
      file('vite.config.ts'),
    ];
    expect(analyzeTests(files, [], DEFAULT_CONFIG.tests).result).toEqual({ checkedFiles: 0, missing: [] });
  });

  it('matches Python tests', () => {
    const files = [file('app/parser.py'), file('tests/test_parser.py'), file('app/models.py')];
    expect(analyzeTests(files, [], DEFAULT_CONFIG.tests).result.missing).toEqual([{ file: 'app/models.py' }]);
  });

  it('uses the configured severity', () => {
    const { findings } = analyzeTests([file('src/a.ts')], [], { ...DEFAULT_CONFIG.tests, severity: 'error' });
    expect(findings[0]!.severity).toBe('error');
  });

  it('prefers a test in the same folder when module names collide', () => {
    const { result } = analyzeTests([file('src/api/client.ts')], ['test/db/client.test.ts', 'test/api/client.test.ts'], DEFAULT_CONFIG.tests);
    expect(result.missing).toEqual([{ file: 'src/api/client.ts', existingTest: 'test/api/client.test.ts' }]);
  });
});
