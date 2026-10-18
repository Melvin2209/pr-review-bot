import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseConfig } from '../src/config.js';
import { createRegistryResolver } from '../src/licenses.js';
import { COMMENT_MARKER, renderComment } from '../src/report/render.js';
import { reviewPullRequest } from '../src/review.js';
import { FakeGitHub } from './helpers/fake-github.js';
import { BASE_SHA, HEAD_SHA, fakeFetch, file, fixture, fixtureText, prFiles, prInfo } from './helpers/fixtures.js';

const tree = fixture<{ tree: { path: string; type: string }[] }>('api/git.getTree.json').tree.map((e) => e.path);

function shopClient() {
  return new FakeGitHub({
    files: prFiles(),
    tree,
    contents: {
      [BASE_SHA]: { 'package.json': fixtureText('api/package.base.json') },
      [HEAD_SHA]: { 'package.json': fixtureText('api/package.head.json') },
    },
  });
}

const review = (client: FakeGitHub, config = DEFAULT_CONFIG) =>
  reviewPullRequest({ pr: prInfo(), config, configPath: '.pr-review.yml', configFound: false, client, resolver: createRegistryResolver(fakeFetch()) });

describe('renderComment', () => {
  it('renders the full report', async () => {
    const report = await review(shopClient());
    expect(report.score).toBe(100 - 10 - 25 - 20);
    expect(report.grade).toBe('D');
    await expect(renderComment(report)).toMatchFileSnapshot('__snapshots__/comment.full.md');
  });

  it('renders a clean PR', async () => {
    const files = [file('src/math.ts', { additions: 5, patch: '@@ -1 +1,5 @@\n+export const add = (a: number, b: number) => a + b;' }), file('src/math.test.ts', { additions: 8 })];
    const report = await review(new FakeGitHub({ files }));
    const body = renderComment(report);
    expect(report.score).toBe(100);
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    expect(body).toContain('No issues found');
    expect(body).toContain('- [x] **Tests** — every changed source file has an associated test');
    expect(body).not.toContain('Suggestions');
    await expect(body).toMatchFileSnapshot('__snapshots__/comment.clean.md');
  });

  it('warns about oversized PRs with a split suggestion', async () => {
    const files = [file('src/api/a.ts', { additions: 700 }), file('web/ui/b.tsx', { additions: 400 }), file('src/api/a.test.ts', { additions: 10 }), file('web/ui/b.test.tsx')];
    const body = renderComment(await review(new FakeGitHub({ files })));
    expect(body).toContain('> [!CAUTION]');
    expect(body).toContain('above the limit of 1000');
    expect(body).toContain('the biggest areas are `src/api` (710 lines), `web/ui` (401 lines)');
  });

  it('omits disabled checks and uses the configured header', async () => {
    const config = parseConfig('tests: false\ndependencies: false\ncomment:\n  header: Robo review');
    const body = renderComment(await review(shopClient(), config));
    expect(body).toContain('## 🟢 Robo review');
    expect(body).not.toContain('**Tests**');
    expect(body).not.toContain('**Dependencies**');
    expect(body).toContain('**Leftovers**');
  });

  it('escapes table-breaking characters from file contents', async () => {
    const files = [file('src/x.ts', { patch: '@@ -0,0 +1 @@\n+// TODO a | b `code`' })];
    const body = renderComment(await review(new FakeGitHub({ files }), parseConfig('tests: false')));
    expect(body).toContain("`// TODO a \\| b 'code'`");
  });

  it('truncates long tables', async () => {
    const patch = '@@ -0,0 +1,40 @@\n' + Array.from({ length: 40 }, (_, i) => `+// TODO ${i}`).join('\n');
    const body = renderComment(await review(new FakeGitHub({ files: [file('src/x.ts', { patch })] }), parseConfig('tests: false')));
    expect(body).toContain('_…and 15 more._');
  });
});
