import { describe, expect, it } from 'vitest';
import { analyzeLeftovers } from '../src/analyzers/leftovers.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { file, prFiles } from './helpers/fixtures.js';

describe('analyzeLeftovers', () => {
  it('finds TODO/FIXME and console.log in added lines only', () => {
    const { result } = analyzeLeftovers(prFiles(), DEFAULT_CONFIG.leftovers);
    expect(result.items).toEqual([
      { file: 'src/checkout/discount.ts', line: 6, rule: 'TODO', severity: 'warning', text: '// TODO: load codes from the database' },
      { file: 'src/checkout/discount.ts', line: 18, rule: 'console.log', severity: 'error', text: "console.log('applying discount', discount);" },
      { file: 'src/checkout/cart.ts', line: 15, rule: 'TODO', severity: 'warning', text: '// FIXME: rounding errors on large carts' },
    ]);
  });

  it('ignores removed lines and excluded files', () => {
    const files = [
      file('src/a.ts', { patch: '@@ -1,2 +1,1 @@\n-console.log("removed")\n keep' }),
      file('docs/guide.md', { patch: '@@ -0,0 +1 @@\n+TODO: write docs' }),
      file('src/a.spec.ts', { patch: '@@ -0,0 +1 @@\n+it.only("x", () => {})' }),
    ];
    expect(analyzeLeftovers(files, DEFAULT_CONFIG.leftovers).result.items).toEqual([]);
  });

  it('detects debugger statements and focused tests outside excluded files', () => {
    const patch = '@@ -0,0 +1,3 @@\n+function f() {\n+  debugger;\n+  describe.only("x", fn)\n';
    const { findings } = analyzeLeftovers([file('src/f.ts', { patch })], DEFAULT_CONFIG.leftovers);
    expect(findings.map((f) => [f.line, f.severity])).toEqual([
      [2, 'error'],
      [3, 'error'],
    ]);
  });

  it('applies custom rules, ignoring stateful regex flags', () => {
    const patch = '@@ -0,0 +1,2 @@\n+// NOCOMMIT\n+// nocommit';
    const rules = [{ name: 'nocommit', pattern: 'nocommit', flags: 'gi', severity: 'error' as const }];
    const { result } = analyzeLeftovers([file('src/x.ts', { patch })], { ...DEFAULT_CONFIG.leftovers, rules });
    expect(result.items.map((i) => i.line)).toEqual([1, 2]);
  });

  it('truncates very long lines', () => {
    const patch = `@@ -0,0 +1 @@\n+// TODO ${'x'.repeat(300)}`;
    const [item] = analyzeLeftovers([file('src/x.ts', { patch })], DEFAULT_CONFIG.leftovers).result.items;
    expect(item!.text.length).toBe(120);
    expect(item!.text.endsWith('…')).toBe(true);
  });
});
