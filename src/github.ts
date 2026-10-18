import type { ChangedFile } from './types.js';

export interface IssueComment {
  id: number;
  body?: string | null;
  user?: { login: string; type?: string } | null;
}

/**
 * The small slice of the GitHub API the action needs. Keeping it behind an
 * interface lets the tests run against in-memory fakes instead of HTTP mocks.
 */
export interface GitHubClient {
  listPullFiles(owner: string, repo: string, pullNumber: number): Promise<ChangedFile[]>;
  /** Raw file content at `ref`, or `null` if the file does not exist there. */
  getFileContent(owner: string, repo: string, path: string, ref: string): Promise<string | null>;
  /** Every blob path in the tree at `ref`. */
  listTreePaths(owner: string, repo: string, ref: string): Promise<string[]>;
  listIssueComments(owner: string, repo: string, issueNumber: number): Promise<IssueComment[]>;
  createIssueComment(owner: string, repo: string, issueNumber: number, body: string): Promise<IssueComment>;
  updateIssueComment(owner: string, repo: string, commentId: number, body: string): Promise<IssueComment>;
}

/** Structural type for the parts of Octokit we use, so we don't depend on its internal types. */
export interface OctokitLike {
  paginate: <T>(route: any, params: Record<string, unknown>) => Promise<T[]>;
  rest: {
    pulls: { listFiles: any };
    repos: { getContent: (params: Record<string, unknown>) => Promise<{ data: unknown }> };
    git: { getTree: (params: Record<string, unknown>) => Promise<{ data: { tree: { path?: string; type?: string }[]; truncated?: boolean } }> };
    issues: {
      listComments: any;
      createComment: (params: Record<string, unknown>) => Promise<{ data: IssueComment }>;
      updateComment: (params: Record<string, unknown>) => Promise<{ data: IssueComment }>;
    };
  };
}

const isNotFound = (err: unknown): boolean => (err as { status?: number })?.status === 404;

export function createGitHubClient(octokit: OctokitLike): GitHubClient {
  return {
    async listPullFiles(owner, repo, pullNumber) {
      // The endpoint returns at most 3000 files; that is plenty for a review summary.
      return octokit.paginate<ChangedFile>(octokit.rest.pulls.listFiles, { owner, repo, pull_number: pullNumber, per_page: 100 });
    },

    async getFileContent(owner, repo, path, ref) {
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
        if (Array.isArray(data) || typeof data !== 'object' || data === null) return null;
        const file = data as { type?: string; content?: string; encoding?: string };
        if (file.type !== 'file' || typeof file.content !== 'string') return null;
        return file.encoding === 'base64' ? Buffer.from(file.content, 'base64').toString('utf8') : file.content;
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    },

    async listTreePaths(owner, repo, ref) {
      try {
        const { data } = await octokit.rest.git.getTree({ owner, repo, tree_sha: ref, recursive: 'true' });
        return data.tree.filter((e) => e.type === 'blob' && e.path).map((e) => e.path as string);
      } catch (err) {
        if (isNotFound(err)) return [];
        throw err;
      }
    },

    async listIssueComments(owner, repo, issueNumber) {
      return octokit.paginate<IssueComment>(octokit.rest.issues.listComments, { owner, repo, issue_number: issueNumber, per_page: 100 });
    },

    async createIssueComment(owner, repo, issueNumber, body) {
      const { data } = await octokit.rest.issues.createComment({ owner, repo, issue_number: issueNumber, body });
      return data;
    },

    async updateIssueComment(owner, repo, commentId, body) {
      const { data } = await octokit.rest.issues.updateComment({ owner, repo, comment_id: commentId, body });
      return data;
    },
  };
}
