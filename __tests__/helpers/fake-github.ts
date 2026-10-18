import type { GitHubClient, IssueComment } from '../../src/github.js';
import type { ChangedFile } from '../../src/types.js';

export interface FakeRepoState {
  files: ChangedFile[];
  /** `ref -> path -> content` */
  contents?: Record<string, Record<string, string>>;
  tree?: string[];
  comments?: IssueComment[];
}

/** In-memory GitHub, recording every write so tests can assert on them. */
export class FakeGitHub implements GitHubClient {
  readonly comments: IssueComment[];
  readonly writes: { type: 'create' | 'update'; id: number; body: string }[] = [];
  /** Set to make comment writes fail like a read-only token would. */
  failWritesWith?: number;
  private nextId = 1000;

  constructor(private readonly state: FakeRepoState) {
    this.comments = [...(state.comments ?? [])];
  }

  async listPullFiles() {
    return this.state.files;
  }

  async getFileContent(_owner: string, _repo: string, path: string, ref: string) {
    return this.state.contents?.[ref]?.[path] ?? null;
  }

  async listTreePaths() {
    return this.state.tree ?? [];
  }

  async listIssueComments() {
    return [...this.comments];
  }

  async createIssueComment(_owner: string, _repo: string, _n: number, body: string) {
    this.guard();
    const comment: IssueComment = { id: this.nextId++, body, user: { login: 'github-actions[bot]', type: 'Bot' } };
    this.comments.push(comment);
    this.writes.push({ type: 'create', id: comment.id, body });
    return comment;
  }

  async updateIssueComment(_owner: string, _repo: string, id: number, body: string) {
    this.guard();
    const comment = this.comments.find((c) => c.id === id);
    if (!comment) throw Object.assign(new Error('Not Found'), { status: 404 });
    comment.body = body;
    this.writes.push({ type: 'update', id, body });
    return comment;
  }

  private guard() {
    if (this.failWritesWith) {
      throw Object.assign(new Error('Resource not accessible by integration'), { status: this.failWritesWith });
    }
  }
}
