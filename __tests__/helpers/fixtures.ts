import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Fetcher } from '../../src/licenses.js';
import type { ChangedFile, PullRequestInfo } from '../../src/types.js';

const root = new URL('../../__fixtures__/', import.meta.url);

export function fixtureText(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, root)), 'utf8');
}

export function fixture<T = unknown>(path: string): T {
  return JSON.parse(fixtureText(path)) as T;
}

export const prEvent = () => fixture<{ pull_request: any; repository: any }>('events/pull_request.opened.json');
export const prFiles = () => fixture<ChangedFile[]>('api/pulls.listFiles.json');

export const BASE_SHA = '1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b';
export const HEAD_SHA = '9f1c2e7b4a8d3f6e5c1b0a9d8e7f6a5b4c3d2e1f';

export function prInfo(overrides: Partial<PullRequestInfo> = {}): PullRequestInfo {
  return {
    owner: 'acme',
    repo: 'shop',
    number: 42,
    title: 'Add checkout discount codes',
    baseRef: 'main',
    baseSha: BASE_SHA,
    headSha: HEAD_SHA,
    fromFork: false,
    serverUrl: 'https://github.com',
    ...overrides,
  };
}

/** A `ChangedFile` with sensible defaults, for analyzer unit tests. */
export function file(filename: string, overrides: Partial<ChangedFile> = {}): ChangedFile {
  const additions = overrides.additions ?? 1;
  const deletions = overrides.deletions ?? 0;
  return { filename, status: 'modified', additions, deletions, changes: additions + deletions, ...overrides };
}

/** Fake `fetch` answering from `api/registry.json`; everything else is a 404. */
export function fakeFetch(extra: Record<string, unknown> = {}): Fetcher & { calls: string[] } {
  const responses = { ...fixture<Record<string, unknown>>('api/registry.json'), ...extra };
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const body = responses[url];
    return { ok: body !== undefined, status: body === undefined ? 404 : 200, json: async () => body };
  };
  return Object.assign(fn, { calls });
}
