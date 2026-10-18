import { describe, expect, it } from 'vitest';
import { analyzeSize } from '../src/analyzers/size.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { file, prFiles } from './helpers/fixtures.js';

const config = { ...DEFAULT_CONFIG.size, warn: 100, max: 300 };

describe('analyzeSize', () => {
  it('counts additions and deletions, ignoring excluded files', () => {
    const { result, findings } = analyzeSize(prFiles(), DEFAULT_CONFIG.size);
    // package-lock.json is excluded by default.
    expect(result).toEqual({ additions: 48, deletions: 5, changedLines: 53, files: 6, excludedFiles: 1, level: 'ok' });
    expect(findings).toEqual([]);
  });

  it('warns above the warning threshold', () => {
    const { result, findings } = analyzeSize([file('a.ts', { additions: 80, deletions: 40 })], config);
    expect(result.level).toBe('warning');
    expect(findings).toEqual([expect.objectContaining({ check: 'size', severity: 'warning' })]);
    expect(findings[0]!.message).toContain('120 lines');
  });

  it('errors above the maximum', () => {
    const { result, findings } = analyzeSize([file('a.ts', { additions: 250 }), file('b.ts', { deletions: 51 })], config);
    expect(result.level).toBe('error');
    expect(findings[0]).toMatchObject({ severity: 'error' });
    expect(findings[0]!.message).toContain('above the limit of 300');
  });

  it('treats the thresholds as inclusive limits', () => {
    expect(analyzeSize([file('a.ts', { additions: 100 })], config).result.level).toBe('ok');
    expect(analyzeSize([file('a.ts', { additions: 300 })], config).result.level).toBe('warning');
  });
});
