/**
 * Run the review against a local git repository and print the comment, without GitHub.
 *
 *   npm run review:local -- [--repo <dir>] [--base main] [--head HEAD] [--config .pr-review.yml]
 *
 * Licenses are looked up on the real npm / PyPI registries.
 */
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { parseConfig } from '../src/config.js';
import type { GitHubClient } from '../src/github.js';
import { createRegistryResolver } from '../src/licenses.js';
import { renderComment } from '../src/report/render.js';
import { reviewPullRequest } from '../src/review.js';
import type { ChangedFile } from '../src/types.js';

const { values } = parseArgs({
  options: {
    repo: { type: 'string', default: '.' },
    base: { type: 'string', default: 'main' },
    head: { type: 'string', default: 'HEAD' },
    config: { type: 'string', default: '.pr-review.yml' },
  },
});

const git = (...args: string[]) => execFileSync('git', ['-C', values.repo!, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const tryGit = (...args: string[]) => {
  try {
    return git(...args);
  } catch {
    return null;
  }
};

const STATUS: Record<string, ChangedFile['status']> = { A: 'added', D: 'removed', M: 'modified', R: 'renamed', C: 'copied', T: 'changed' };

/** Mimic `GET /pulls/{n}/files` from `git diff base...head`. */
function changedFiles(base: string, head: string): ChangedFile[] {
  const range = `${base}...${head}`;
  const statuses = git('diff', '--name-status', '-M', range).trim().split('\n').filter(Boolean);
  const numstat = new Map(
    git('diff', '--numstat', '-M', range)
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [add, del, ...path] = l.split('\t');
        return [path.at(-1)!, { additions: Number(add) || 0, deletions: Number(del) || 0 }] as const;
      }),
  );
  return statuses.map((line) => {
    const [code, ...paths] = line.split('\t');
    const filename = paths.at(-1)!;
    const { additions, deletions } = numstat.get(filename) ?? { additions: 0, deletions: 0 };
    const diff = git('diff', '-M', range, '--', ...paths);
    const at = diff.indexOf('\n@@');
    return {
      filename,
      previous_filename: paths.length > 1 ? paths[0] : undefined,
      status: STATUS[code![0]!] ?? 'modified',
      additions,
      deletions,
      changes: additions + deletions,
      patch: at >= 0 ? diff.slice(at + 1).trimEnd() : undefined,
    };
  });
}

const base = git('merge-base', values.base!, values.head!).trim();
const head = git('rev-parse', values.head!).trim();
const files = changedFiles(base, head);

const client: GitHubClient = {
  listPullFiles: async () => files,
  getFileContent: async (_o, _r, path, ref) => tryGit('show', `${ref}:${path}`),
  listTreePaths: async (_o, _r, ref) => git('ls-tree', '-r', '--name-only', ref).trim().split('\n'),
  listIssueComments: async () => [],
  createIssueComment: async () => ({ id: 0 }),
  updateIssueComment: async () => ({ id: 0 }),
};

const configText = tryGit('show', `${base}:${values.config}`) ?? tryGit('show', `${head}:${values.config}`);
const report = await reviewPullRequest({
  pr: { owner: 'local', repo: 'repo', number: 0, title: '', baseRef: values.base!, baseSha: base, headSha: head, fromFork: false, serverUrl: 'https://github.com' },
  config: parseConfig(configText),
  configPath: values.config!,
  configFound: configText !== null,
  client,
  resolver: createRegistryResolver(),
});
process.stdout.write(renderComment(report));
