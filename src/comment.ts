import type { GitHubClient, IssueComment } from './github.js';
import { COMMENT_MARKER } from './report/render.js';

export interface UpsertResult {
  action: 'created' | 'updated' | 'unchanged';
  comment: IssueComment;
}

/** Prefer a comment written by a bot, in case a human quoted our marker in their own comment. */
export function findExistingComment(comments: IssueComment[]): IssueComment | undefined {
  const ours = comments.filter((c) => c.body?.includes(COMMENT_MARKER));
  return ours.find((c) => c.user?.type === 'Bot') ?? ours[0];
}

/** Create the summary comment, or edit it in place if a previous run already posted one. */
export async function upsertComment(
  client: GitHubClient,
  target: { owner: string; repo: string; number: number },
  body: string,
): Promise<UpsertResult> {
  const { owner, repo, number } = target;
  const existing = findExistingComment(await client.listIssueComments(owner, repo, number));
  if (!existing) {
    return { action: 'created', comment: await client.createIssueComment(owner, repo, number, body) };
  }
  if (existing.body === body) return { action: 'unchanged', comment: existing };
  return { action: 'updated', comment: await client.updateIssueComment(owner, repo, existing.id, body) };
}
