import { describe, expect, it } from 'vitest';
import { findExistingComment, upsertComment } from '../src/comment.js';
import { COMMENT_MARKER } from '../src/report/render.js';
import { FakeGitHub } from './helpers/fake-github.js';

const target = { owner: 'acme', repo: 'shop', number: 42 };
const human = { login: 'octocat', type: 'User' };
const bot = { login: 'github-actions[bot]', type: 'Bot' };

describe('upsertComment', () => {
  it('creates the comment on the first run', async () => {
    const client = new FakeGitHub({ files: [], comments: [{ id: 1, body: 'LGTM', user: human }] });
    const result = await upsertComment(client, target, `${COMMENT_MARKER}\nv1`);
    expect(result.action).toBe('created');
    expect(client.writes).toEqual([{ type: 'create', id: 1000, body: `${COMMENT_MARKER}\nv1` }]);
  });

  it('updates the same comment on later runs instead of adding new ones', async () => {
    const client = new FakeGitHub({ files: [] });
    await upsertComment(client, target, `${COMMENT_MARKER}\nv1`);
    const second = await upsertComment(client, target, `${COMMENT_MARKER}\nv2`);
    expect(second.action).toBe('updated');
    expect(client.comments).toHaveLength(1);
    expect(client.comments[0]!.body).toContain('v2');
  });

  it('skips the API call when nothing changed', async () => {
    const body = `${COMMENT_MARKER}\nsame`;
    const client = new FakeGitHub({ files: [], comments: [{ id: 7, body, user: bot }] });
    expect((await upsertComment(client, target, body)).action).toBe('unchanged');
    expect(client.writes).toEqual([]);
  });
});

describe('findExistingComment', () => {
  it('prefers the bot comment over a human quoting the marker', () => {
    const comments = [
      { id: 1, body: `> ${COMMENT_MARKER} quoted`, user: human },
      { id: 2, body: `${COMMENT_MARKER}\nreport`, user: bot },
    ];
    expect(findExistingComment(comments)?.id).toBe(2);
  });

  it('returns undefined when there is no summary comment yet', () => {
    expect(findExistingComment([{ id: 1, body: null, user: null }])).toBeUndefined();
  });
});
