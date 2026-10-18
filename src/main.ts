import * as core from '@actions/core';
import * as github from '@actions/github';
import { upsertComment } from './comment.js';
import { ConfigError, parseConfig } from './config.js';
import { createGitHubClient, type GitHubClient, type OctokitLike } from './github.js';
import { createRegistryResolver, type LicenseResolver } from './licenses.js';
import { allFindings, renderComment } from './report/render.js';
import { reviewPullRequest } from './review.js';
import type { PullRequestInfo, Severity } from './types.js';

type Context = Pick<typeof github.context, 'eventName' | 'payload' | 'repo' | 'serverUrl'>;

export interface RunDependencies {
  context?: Context;
  client?: GitHubClient;
  resolver?: LicenseResolver;
}

const PR_EVENTS = ['pull_request', 'pull_request_target'];

export function pullRequestFromContext(context: Context): PullRequestInfo | null {
  if (!PR_EVENTS.includes(context.eventName)) return null;
  const pr = context.payload.pull_request;
  if (!pr) return null;
  return {
    owner: context.repo.owner,
    repo: context.repo.repo,
    number: pr.number,
    title: pr.title ?? '',
    baseRef: pr.base.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    fromFork: pr.head.repo?.full_name !== pr.base.repo?.full_name,
    serverUrl: context.serverUrl || 'https://github.com',
  };
}

/** Load the rules from the base branch, so a PR cannot relax the checks applied to itself. */
async function loadConfig(client: GitHubClient, pr: PullRequestInfo, path: string) {
  const fromBase = await client.getFileContent(pr.owner, pr.repo, path, pr.baseSha);
  // First PR introducing the file: use the proposed one.
  const text = fromBase ?? (await client.getFileContent(pr.owner, pr.repo, path, pr.headSha));
  if (fromBase === null && text !== null) core.info(`${path} not found on ${pr.baseRef}; using the version from this PR.`);
  return { config: parseConfig(text), found: text !== null };
}

function parseFailOn(value: string): Severity | 'never' {
  const v = value.trim().toLowerCase() || 'never';
  if (v === 'error' || v === 'warning' || v === 'never') return v;
  throw new Error(`Invalid \`fail-on\` input "${value}": expected error, warning or never`);
}

function parseMinScore(value: string): number {
  const n = Number(value.trim() || '0');
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Invalid \`min-score\` input "${value}": expected a number between 0 and 100`);
  return n;
}

export async function run(deps: RunDependencies = {}): Promise<void> {
  try {
    const context = deps.context ?? github.context;
    const pr = pullRequestFromContext(context);
    if (!pr) {
      core.notice(`pr-review-bot only runs on pull_request events (got "${context.eventName}"); skipping.`);
      return;
    }

    const configPath = core.getInput('config-path') || '.pr-review.yml';
    const failOn = parseFailOn(core.getInput('fail-on'));
    const minScore = parseMinScore(core.getInput('min-score'));
    const commentInput = core.getInput('comment').trim().toLowerCase();

    const client = deps.client ?? createGitHubClient(github.getOctokit(core.getInput('github-token', { required: true })) as unknown as OctokitLike);
    const resolver = deps.resolver ?? createRegistryResolver();

    const { config, found } = await loadConfig(client, pr, configPath);
    const report = await reviewPullRequest({ pr, config, configPath, configFound: found, client, resolver });
    const body = renderComment(report);
    const findings = allFindings(report);
    const errors = findings.filter((f) => f.severity === 'error').length;
    const warnings = findings.filter((f) => f.severity === 'warning').length;

    core.setOutput('score', report.score);
    core.setOutput('grade', report.grade);
    core.setOutput('errors', errors);
    core.setOutput('warnings', warnings);
    core.setOutput('report', JSON.stringify(report));

    await core.summary.addRaw(body).write();

    for (const f of findings) {
      const props = { title: `pr-review-bot: ${f.check}`, file: f.file, startLine: f.line };
      const message = f.message.replace(/`/g, '');
      if (f.severity === 'error') core.error(message, props);
      else if (f.severity === 'warning') core.warning(message, props);
      else core.notice(message, props);
    }

    const shouldComment = commentInput === '' ? config.comment.enabled : commentInput === 'true';
    if (shouldComment) {
      try {
        const { action, comment } = await upsertComment(client, pr, body);
        core.info(`Summary comment ${action} (id ${comment.id}).`);
        core.setOutput('comment-id', comment.id);
      } catch (err) {
        const status = (err as { status?: number }).status;
        if (status === 403 || status === 404) {
          core.warning(
            pr.fromFork
              ? 'Could not comment: workflows triggered by pull requests from forks get a read-only token. The report is available in the job summary.'
              : 'Could not comment: the token needs `pull-requests: write` (or `issues: write`) permission. The report is available in the job summary.',
          );
        } else {
          throw err;
        }
      }
    }

    core.info(`Score: ${report.score}/100 (${report.grade}) — ${errors} error(s), ${warnings} warning(s).`);

    if (report.score < minScore) {
      core.setFailed(`Score ${report.score} is below the required minimum of ${minScore}.`);
    } else if (failOn === 'error' && errors > 0) {
      core.setFailed(`Found ${errors} error(s).`);
    } else if (failOn === 'warning' && errors + warnings > 0) {
      core.setFailed(`Found ${errors} error(s) and ${warnings} warning(s).`);
    }
  } catch (err) {
    if (err instanceof ConfigError) core.setFailed(`Invalid configuration: ${err.message}`);
    else core.setFailed(err instanceof Error ? err.message : String(err));
  }
}
