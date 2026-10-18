import { describe, expect, it, vi } from 'vitest';
import { createGitHubClient, type OctokitLike } from '../src/github.js';
import { fixture, prFiles } from './helpers/fixtures.js';

function fakeOctokit(overrides: Partial<Record<string, any>> = {}) {
  const octokit = {
    paginate: vi.fn(async (route: unknown, _params: unknown) => (route === octokit.rest.pulls.listFiles ? prFiles() : [])),
    rest: {
      pulls: { listFiles: Symbol('listFiles') },
      repos: { getContent: vi.fn() },
      git: { getTree: vi.fn(async () => ({ data: fixture('api/git.getTree.json') })) },
      issues: {
        listComments: Symbol('listComments'),
        createComment: vi.fn(async (p: any) => ({ data: { id: 1, body: p.body } })),
        updateComment: vi.fn(async (p: any) => ({ data: { id: p.comment_id, body: p.body } })),
      },
      ...overrides,
    },
  };
  return octokit;
}

describe('createGitHubClient', () => {
  it('paginates PR files', async () => {
    const octokit = fakeOctokit();
    const client = createGitHubClient(octokit as unknown as OctokitLike);
    expect(await client.listPullFiles('acme', 'shop', 42)).toHaveLength(7);
    expect(octokit.paginate).toHaveBeenCalledWith(octokit.rest.pulls.listFiles, { owner: 'acme', repo: 'shop', pull_number: 42, per_page: 100 });
  });

  it('decodes base64 file contents and maps 404 to null', async () => {
    const octokit = fakeOctokit();
    octokit.rest.repos.getContent
      .mockResolvedValueOnce({ data: { type: 'file', encoding: 'base64', content: Buffer.from('size:\n  warn: 10\n').toString('base64') } })
      .mockResolvedValueOnce({ data: [{ type: 'file', name: 'a' }] })
      .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { status: 404 }))
      .mockRejectedValueOnce(Object.assign(new Error('Server Error'), { status: 500 }));
    const client = createGitHubClient(octokit as unknown as OctokitLike);
    expect(await client.getFileContent('acme', 'shop', '.pr-review.yml', 'main')).toBe('size:\n  warn: 10\n');
    expect(await client.getFileContent('acme', 'shop', 'src', 'main')).toBeNull();
    expect(await client.getFileContent('acme', 'shop', 'missing', 'main')).toBeNull();
    await expect(client.getFileContent('acme', 'shop', 'boom', 'main')).rejects.toThrow('Server Error');
  });

  it('lists blob paths from the recursive tree', async () => {
    const client = createGitHubClient(fakeOctokit() as unknown as OctokitLike);
    const paths = await client.listTreePaths('acme', 'shop', 'sha');
    expect(paths).toContain('src/checkout/cart.ts');
    expect(paths).not.toContain('src');
  });

  it('creates and updates issue comments', async () => {
    const octokit = fakeOctokit();
    const client = createGitHubClient(octokit as unknown as OctokitLike);
    await client.createIssueComment('acme', 'shop', 42, 'hello');
    await client.updateIssueComment('acme', 'shop', 99, 'bye');
    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith({ owner: 'acme', repo: 'shop', issue_number: 42, body: 'hello' });
    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith({ owner: 'acme', repo: 'shop', comment_id: 99, body: 'bye' });
  });
});
