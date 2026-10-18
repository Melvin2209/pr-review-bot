export type Severity = 'error' | 'warning' | 'info';

/** A file changed by the pull request, as returned by `GET /pulls/{n}/files`. */
export interface ChangedFile {
  filename: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  /** Unified diff. Missing for binary files and very large diffs. */
  patch?: string;
  previous_filename?: string;
}

export interface PullRequestInfo {
  owner: string;
  repo: string;
  number: number;
  title: string;
  baseRef: string;
  baseSha: string;
  headSha: string;
  /** True when the head branch lives in a fork (the token is then usually read-only). */
  fromFork: boolean;
  /** `https://github.com`, or the GitHub Enterprise Server URL. */
  serverUrl: string;
}

export interface Finding {
  /** Which check produced it: `size`, `tests`, `leftovers`, `dependencies`. */
  check: CheckId;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
}

export type CheckId = 'size' | 'tests' | 'leftovers' | 'dependencies';

export interface SizeResult {
  additions: number;
  deletions: number;
  changedLines: number;
  files: number;
  /** Files left out of the count by `size.exclude` (lock files, generated code…). */
  excludedFiles: number;
  level: 'ok' | 'warning' | 'error';
}

export interface MissingTest {
  file: string;
  /** A matching test exists in the repo but was not touched by this PR. */
  existingTest?: string;
}

export interface TestsResult {
  checkedFiles: number;
  missing: MissingTest[];
}

export interface Leftover {
  file: string;
  line: number;
  rule: string;
  severity: Severity;
  text: string;
}

export interface LeftoversResult {
  items: Leftover[];
}

export type Ecosystem = 'npm' | 'pypi';

export type LicenseStatus = 'allowed' | 'denied' | 'unknown' | 'review';

export interface AddedDependency {
  name: string;
  version: string;
  ecosystem: Ecosystem;
  manifest: string;
  dev: boolean;
  license: string | null;
  status: LicenseStatus;
}

export interface DependenciesResult {
  added: AddedDependency[];
}

export interface CheckOutcome<T> {
  enabled: boolean;
  result: T | null;
  findings: Finding[];
}

export interface Report {
  pr: PullRequestInfo;
  size: CheckOutcome<SizeResult>;
  tests: CheckOutcome<TestsResult>;
  leftovers: CheckOutcome<LeftoversResult>;
  dependencies: CheckOutcome<DependenciesResult>;
  score: number;
  grade: string;
  suggestions: string[];
  configPath: string;
  configFound: boolean;
  /** Comment heading, from `comment.header`. */
  header: string;
}
