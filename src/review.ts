import { analyzeDependencies } from './analyzers/dependencies.js';
import { analyzeLeftovers } from './analyzers/leftovers.js';
import { analyzeSize } from './analyzers/size.js';
import { analyzeTests } from './analyzers/tests.js';
import type { Config } from './config.js';
import type { GitHubClient } from './github.js';
import type { LicenseResolver } from './licenses.js';
import { computeScore, grade } from './report/score.js';
import { buildSuggestions } from './report/suggestions.js';
import type { CheckOutcome, PullRequestInfo, Report } from './types.js';

const disabled = <T>(): CheckOutcome<T> => ({ enabled: false, result: null, findings: [] });

export interface ReviewInput {
  pr: PullRequestInfo;
  config: Config;
  configPath: string;
  configFound: boolean;
  client: GitHubClient;
  resolver: LicenseResolver;
}

/** Run every enabled check against the pull request and assemble the report. */
export async function reviewPullRequest({ pr, config, configPath, configFound, client, resolver }: ReviewInput): Promise<Report> {
  const files = await client.listPullFiles(pr.owner, pr.repo, pr.number);

  const size = config.size.enabled ? { enabled: true, ...analyzeSize(files, config.size) } : disabled<never>();
  const leftovers = config.leftovers.enabled ? { enabled: true, ...analyzeLeftovers(files, config.leftovers) } : disabled<never>();

  const [tests, dependencies] = await Promise.all([
    config.tests.enabled
      ? client.listTreePaths(pr.owner, pr.repo, pr.headSha).then((paths) => ({ enabled: true, ...analyzeTests(files, paths, config.tests) }))
      : disabled<never>(),
    config.dependencies.enabled
      ? analyzeDependencies(files, pr, client, resolver, config.dependencies).then((r) => ({ enabled: true, ...r }))
      : disabled<never>(),
  ]);

  const sections = { size, tests, leftovers, dependencies } as Pick<Report, 'size' | 'tests' | 'leftovers' | 'dependencies'>;
  const findings = [...size.findings, ...tests.findings, ...leftovers.findings, ...dependencies.findings];
  const score = computeScore(findings, config.score);

  return {
    pr,
    ...sections,
    score,
    grade: grade(score),
    suggestions: buildSuggestions(sections, files),
    configPath,
    configFound,
    header: config.comment.header,
  };
}
