import type { Config } from '../config.js';
import { matchesAny } from '../glob.js';
import type { ChangedFile, Finding, SizeResult } from '../types.js';

export function analyzeSize(files: ChangedFile[], config: Config['size']): { result: SizeResult; findings: Finding[] } {
  const counted = files.filter((f) => !matchesAny(f.filename, config.exclude));
  const additions = counted.reduce((sum, f) => sum + f.additions, 0);
  const deletions = counted.reduce((sum, f) => sum + f.deletions, 0);
  const changedLines = additions + deletions;

  const level: SizeResult['level'] = changedLines > config.max ? 'error' : changedLines > config.warn ? 'warning' : 'ok';
  const result: SizeResult = {
    additions,
    deletions,
    changedLines,
    files: counted.length,
    excludedFiles: files.length - counted.length,
    level,
  };

  const findings: Finding[] = [];
  if (level === 'error') {
    findings.push({
      check: 'size',
      severity: 'error',
      message: `This PR changes ${changedLines} lines, above the limit of ${config.max}. Consider splitting it into smaller PRs.`,
    });
  } else if (level === 'warning') {
    findings.push({
      check: 'size',
      severity: 'warning',
      message: `This PR changes ${changedLines} lines (warning threshold: ${config.warn}). Large PRs are harder to review.`,
    });
  }
  return { result, findings };
}
