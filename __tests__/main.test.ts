import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = vi.hoisted(() => {
  const inputs: Record<string, string> = {};
  const summary: { addRaw: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> } = {
    addRaw: vi.fn(() => summary),
    write: vi.fn(async () => summary),
  };
  return {
    inputs,
    getInput: vi.fn((name: string) => inputs[name] ?? ''),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
    info: vi.fn(),
    notice: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    summary,
  };
});
vi.mock('@actions/core', () => core);
vi.mock('@actions/github', () => ({ context: {}, getOctokit: vi.fn() }));

import { createRegistryResolver } from '../src/licenses.js';
import { pullRequestFromContext, run } from '../src/main.js';
import { COMMENT_MARKER } from '../src/report/render.js';
import { FakeGitHub } from './helpers/fake-github.js';
import { BASE_SHA, HEAD_SHA, fakeFetch, fixture, fixtureText, prEvent, prFiles } from './helpers/fixtures.js';

const tree = fixture<{ tree: { path: string }[] }>('api/git.getTree.json').tree.map((e) => e.path);

function context(eventName = 'pull_request', payload: any = prEvent()) {
  return { eventName, payload, repo: { owner: 'acme', repo: 'shop' }, serverUrl: 'https://github.com' } as any;
}

function client(config?: { base?: string; head?: string }) {
  return new FakeGitHub({
    files: prFiles(),
    tree,
    contents: {
      [BASE_SHA]: { 'package.json': fixtureText('api/package.base.json'), ...(config?.base ? { '.pr-review.yml': config.base } : {}) },
      [HEAD_SHA]: { 'package.json': fixtureText('api/package.head.json'), ...(config?.head ? { '.pr-review.yml': config.head } : {}) },
    },
  });
}

const resolver = () => createRegistryResolver(fakeFetch());
const outputs = () => Object.fromEntries(core.setOutput.mock.calls.map(([k, v]) => [k, v]));

beforeEach(() => {
  for (const key of Object.keys(core.inputs)) delete core.inputs[key];
});

describe('pullRequestFromContext', () => {
  it('extracts PR details from a pull_request webhook payload', () => {
    expect(pullRequestFromContext(context())).toEqual({
      owner: 'acme',
      repo: 'shop',
      number: 42,
      title: 'Add checkout discount codes',
      baseRef: 'main',
      baseSha: BASE_SHA,
      headSha: HEAD_SHA,
      fromFork: false,
      serverUrl: 'https://github.com',
    });
  });

  it('detects forks and ignores other events', () => {
    const payload = prEvent();
    payload.pull_request.head.repo.full_name = 'stranger/shop';
    expect(pullRequestFromContext(context('pull_request_target', payload))?.fromFork).toBe(true);
    expect(pullRequestFromContext(context('push', {}))).toBeNull();
  });
});

describe('run', () => {
  it('skips non pull_request events', async () => {
    await run({ context: context('push', {}), client: client(), resolver: resolver() });
    expect(core.notice).toHaveBeenCalledWith(expect.stringContaining('only runs on pull_request events'));
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('reviews the PR, posts one comment and keeps updating it', async () => {
    const gh = client();
    await run({ context: context(), client: gh, resolver: resolver() });

    expect(gh.writes).toHaveLength(1);
    expect(gh.writes[0]!.type).toBe('create');
    expect(gh.comments[0]!.body).toContain(COMMENT_MARKER);
    expect(outputs()).toMatchObject({ score: 45, grade: 'D', errors: 2, warnings: 5, 'comment-id': 1000 });
    expect(core.summary.addRaw).toHaveBeenCalledWith(gh.comments[0]!.body);
    expect(core.error).toHaveBeenCalledWith(expect.stringContaining('console.log left in src/checkout/discount.ts:18'), expect.objectContaining({ file: 'src/checkout/discount.ts', startLine: 18 }));
    expect(core.setFailed).not.toHaveBeenCalled();

    // A new push on the same PR edits the existing comment.
    const next = prEvent();
    next.pull_request.head.sha = 'ffffffffffffffffffffffffffffffffffffffff';
    await run({ context: context('pull_request', next), client: gh, resolver: resolver() });
    expect(gh.comments).toHaveLength(1);
    expect(gh.writes.map((w) => w.type)).toEqual(['create', 'update']);
    expect(gh.comments[0]!.body).toContain('Updated for fffffff');
  });

  it('reads the rules from the base branch, not from the PR', async () => {
    const gh = client({ base: 'leftovers: false\ndependencies: false\n', head: 'size: false\ntests: false\nleftovers: false\ndependencies: false\n' });
    await run({ context: context(), client: gh, resolver: resolver() });
    expect(outputs()).toMatchObject({ score: 90, errors: 0, warnings: 2 });
    expect(gh.comments[0]!.body).toContain('`.pr-review.yml` ·');
  });

  it('falls back to the PR config when the base branch has none', async () => {
    const gh = client({ head: 'size: false\ntests: false\nleftovers: false\ndependencies: false\n' });
    await run({ context: context(), client: gh, resolver: resolver() });
    expect(outputs()).toMatchObject({ score: 100 });
  });

  it.each([
    [{ 'fail-on': 'error' }, 'Found 2 error(s).'],
    [{ 'fail-on': 'warning' }, 'Found 2 error(s) and 5 warning(s).'],
    [{ 'min-score': '80' }, 'Score 45 is below the required minimum of 80.'],
  ])('fails the job according to inputs %o', async (inputs, message) => {
    Object.assign(core.inputs, inputs);
    await run({ context: context(), client: client(), resolver: resolver() });
    expect(core.setFailed).toHaveBeenCalledWith(message);
  });

  it('does not comment when disabled, but still writes the job summary', async () => {
    core.inputs.comment = 'false';
    const gh = client();
    await run({ context: context(), client: gh, resolver: resolver() });
    expect(gh.writes).toEqual([]);
    expect(core.summary.write).toHaveBeenCalled();
  });

  it('degrades gracefully when the token cannot comment (fork PRs)', async () => {
    const payload = prEvent();
    payload.pull_request.head.repo.full_name = 'stranger/shop';
    const gh = client();
    gh.failWritesWith = 403;
    await run({ context: context('pull_request', payload), client: gh, resolver: resolver() });
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('pull requests from forks get a read-only token'));
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('reports invalid configuration and inputs', async () => {
    await run({ context: context(), client: client({ base: 'size:\n  warn: lots\n' }), resolver: resolver() });
    expect(core.setFailed).toHaveBeenCalledWith('Invalid configuration: `size.warn` must be a non-negative integer, got "lots"');

    core.setFailed.mockClear();
    core.inputs['fail-on'] = 'sometimes';
    await run({ context: context(), client: client(), resolver: resolver() });
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('Invalid `fail-on` input'));
  });
});
