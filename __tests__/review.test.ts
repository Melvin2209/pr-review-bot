import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../src/config.js';
import { reviewPullRequest } from '../src/review.js';
import { FakeGitHub } from './helpers/fake-github.js';
import { prFiles, prInfo } from './helpers/fixtures.js';

describe('reviewPullRequest', () => {
  it('skips disabled checks entirely, including their API calls', async () => {
    const client = new FakeGitHub({ files: prFiles() });
    const tree = vi.spyOn(client, 'listTreePaths');
    const resolver = { resolve: vi.fn() };
    const report = await reviewPullRequest({
      pr: prInfo(),
      config: parseConfig('tests: false\ndependencies: false\nleftovers: false\nsize: false'),
      configPath: '.pr-review.yml',
      configFound: true,
      client,
      resolver,
    });
    expect(report).toMatchObject({ score: 100, grade: 'A', suggestions: [], configFound: true });
    for (const check of [report.size, report.tests, report.leftovers, report.dependencies]) {
      expect(check).toEqual({ enabled: false, result: null, findings: [] });
    }
    expect(tree).not.toHaveBeenCalled();
    expect(resolver.resolve).not.toHaveBeenCalled();
  });
});
