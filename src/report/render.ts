import type { Finding, Report, Severity } from '../types.js';

/** Hidden marker used to find (and update) our own comment on later runs. */
export const COMMENT_MARKER = '<!-- pr-review-bot:summary -->';

const MAX_ROWS = 25;
const ICON: Record<Severity, string> = { error: '🔴', warning: '🟡', info: '🔵' };
const GRADE_ICON: Record<string, string> = { A: '🟢', B: '🟢', C: '🟡', D: '🟠', F: '🔴' };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** Keep user-controlled text from breaking out of a table cell or inline code span. */
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/`/g, "'").replace(/\r?\n/g, ' ');

function blobUrl(report: Report, file: string, line?: number): string {
  const { serverUrl, owner, repo, headSha } = report.pr;
  const path = file.split('/').map(encodeURIComponent).join('/');
  return `${serverUrl}/${owner}/${repo}/blob/${headSha}/${path}${line ? `#L${line}` : ''}`;
}

function more(total: number): string {
  return total > MAX_ROWS ? `\n\n_…and ${total - MAX_ROWS} more._` : '';
}

function count(findings: Finding[], severity: Severity) {
  return findings.filter((f) => f.severity === severity).length;
}

export function allFindings(report: Report): Finding[] {
  return [...report.size.findings, ...report.tests.findings, ...report.leftovers.findings, ...report.dependencies.findings];
}

function checklist(report: Report): string[] {
  const lines: string[] = [];
  const item = (ok: boolean, text: string) => lines.push(`- [${ok ? 'x' : ' '}] ${text}`);

  const { size, tests, leftovers, dependencies } = report;
  if (size.enabled && size.result) {
    const s = size.result;
    const label = `**Size** — ${s.changedLines} lines changed (+${s.additions} / −${s.deletions}) in ${plural(s.files, 'file')}`;
    item(s.level === 'ok', s.level === 'ok' ? label : `${label} ${s.level === 'error' ? '— too big' : '— large'}`);
  }
  if (tests.enabled && tests.result) {
    const n = tests.result.missing.length;
    item(n === 0, n === 0 ? `**Tests** — every changed source file has an associated test` : `**Tests** — ${plural(n, 'changed file')} without an associated test`);
  }
  if (leftovers.enabled && leftovers.result) {
    const n = leftovers.result.items.length;
    item(n === 0, n === 0 ? '**Leftovers** — no TODO / debug statements added' : `**Leftovers** — ${plural(n, 'TODO / debug statement')} added`);
  }
  if (dependencies.enabled && dependencies.result) {
    const added = dependencies.result.added;
    const flagged = added.filter((d) => d.status !== 'allowed').length;
    const text =
      added.length === 0
        ? '**Dependencies** — no new dependencies'
        : flagged === 0
          ? `**Dependencies** — ${`${added.length} new ${added.length === 1 ? 'dependency' : 'dependencies'}`}, all with approved licenses`
          : `**Dependencies** — ${flagged} of ${added.length} new ${added.length === 1 ? 'dependency needs' : 'dependencies need'} a license check`;
    item(flagged === 0, text);
  }
  return lines;
}

function sizeSection(report: Report): string | null {
  const s = report.size.result;
  if (!report.size.enabled || !s || s.level === 'ok') return null;
  const finding = report.size.findings[0];
  const excluded = s.excludedFiles > 0 ? `\n\n<sub>${plural(s.excludedFiles, 'file')} (lock files, generated code…) not counted.</sub>` : '';
  return `### 📏 Size\n\n> [!${s.level === 'error' ? 'CAUTION' : 'WARNING'}]\n> ${finding?.message ?? ''}${excluded}`;
}

function testsSection(report: Report): string | null {
  const t = report.tests.result;
  if (!report.tests.enabled || !t || t.missing.length === 0) return null;
  const rows = t.missing.slice(0, MAX_ROWS).map((m) => {
    const status = m.existingTest ? `test exists but not updated: [\`${cell(m.existingTest)}\`](${blobUrl(report, m.existingTest)})` : 'no test found';
    return `| [\`${cell(m.file)}\`](${blobUrl(report, m.file)}) | ${status} |`;
  });
  return `### 🧪 Files without associated tests\n\n| File | Status |\n| --- | --- |\n${rows.join('\n')}${more(t.missing.length)}`;
}

function leftoversSection(report: Report): string | null {
  const l = report.leftovers.result;
  if (!report.leftovers.enabled || !l || l.items.length === 0) return null;
  const rows = l.items.slice(0, MAX_ROWS).map(
    (i) => `| ${ICON[i.severity]} ${cell(i.rule)} | [\`${cell(i.file)}:${i.line}\`](${blobUrl(report, i.file, i.line)}) | \`${cell(i.text)}\` |`,
  );
  return `### 🧹 Leftovers\n\n| Rule | Location | Code |\n| --- | --- | --- |\n${rows.join('\n')}${more(l.items.length)}`;
}

const STATUS_LABEL = { allowed: '✅ allowed', denied: '⛔ denied', review: '⚠️ not in allow list', unknown: '❓ unknown' } as const;

function dependenciesSection(report: Report): string | null {
  const d = report.dependencies.result;
  if (!report.dependencies.enabled || !d || d.added.length === 0) return null;
  const rows = d.added.slice(0, MAX_ROWS).map(
    (dep) =>
      `| \`${cell(dep.name)}\` | \`${cell(dep.version)}\` | ${dep.ecosystem}${dep.dev ? ' (dev)' : ''} | ${dep.license ? cell(dep.license) : '—'} | ${STATUS_LABEL[dep.status]} |`,
  );
  return `### 📦 New dependencies\n\n| Package | Version | Type | License | Status |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}${more(d.added.length)}`;
}

export function renderComment(report: Report): string {
  const findings = allFindings(report);
  const errors = count(findings, 'error');
  const warnings = count(findings, 'warning');
  const infos = count(findings, 'info');

  const summary =
    findings.length === 0
      ? 'No issues found — nice work! 🎉'
      : [errors && plural(errors, 'error'), warnings && plural(warnings, 'warning'), infos && plural(infos, 'note')].filter(Boolean).join(' · ');

  const parts = [COMMENT_MARKER, `## ${GRADE_ICON[report.grade] ?? ''} ${cell(report.header)}`];
  parts.push(`**Score: ${report.score}/100 (${report.grade})** — ${summary}`);
  parts.push(`### ✅ Checklist\n\n${checklist(report).join('\n')}`);

  for (const section of [sizeSection(report), testsSection(report), leftoversSection(report), dependenciesSection(report)]) {
    if (section) parts.push(section);
  }

  if (report.suggestions.length > 0) {
    parts.push(`### 💡 Suggestions\n\n${report.suggestions.map((s) => `- ${s}`).join('\n')}`);
  }

  const sha = report.pr.headSha.slice(0, 7);
  const config = report.configFound ? `\`${report.configPath}\`` : `default rules (no \`${report.configPath}\` found)`;
  parts.push(`---\n<sub>Updated for ${sha} · ${config} · this comment is edited in place on every push.</sub>`);

  return parts.join('\n\n') + '\n';
}
