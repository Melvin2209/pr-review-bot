import { posix } from 'node:path';
import type { Config } from '../config.js';
import { matchesAny } from '../glob.js';
import type { ChangedFile, Finding, MissingTest, TestsResult } from '../types.js';

/** `src/utils/date.ts` → `date`; `tests/test_date.py` → `date`; `date.spec.tsx` → `date`. */
export function moduleKey(path: string): string {
  let name = posix.basename(path);
  name = name.replace(/\.[^.]+$/, ''); // extension
  name = name.replace(/\.(test|spec|e2e|unit|integration)$/i, '');
  name = name.replace(/^test_/, '').replace(/_test$/, '');
  return name.toLowerCase();
}

/**
 * A test "belongs" to a source file when they share the same module name. When several source
 * files share a name (`a/index.ts`, `b/index.ts`) we prefer tests that also mention the parent folder.
 */
function findTest(source: string, candidates: string[]): string | undefined {
  const key = moduleKey(source);
  const matching = candidates.filter((t) => moduleKey(t) === key);
  if (matching.length <= 1) return matching[0];
  const parent = posix.basename(posix.dirname(source)).toLowerCase();
  return matching.find((t) => t.toLowerCase().includes(`/${parent}/`)) ?? matching[0];
}

export function analyzeTests(
  files: ChangedFile[],
  repoPaths: string[],
  config: Config['tests'],
): { result: TestsResult; findings: Finding[] } {
  const isTest = (path: string) => matchesAny(path, config.test);
  const live = files.filter((f) => f.status !== 'removed');

  const changedTests = live.map((f) => f.filename).filter(isTest);
  const sources = live
    .map((f) => f.filename)
    .filter((path) => !isTest(path) && matchesAny(path, config.source) && !matchesAny(path, config.ignore));
  const repoTests = repoPaths.filter(isTest);

  const missing: MissingTest[] = [];
  for (const source of sources) {
    if (findTest(source, changedTests)) continue;
    const existing = findTest(source, repoTests);
    missing.push(existing ? { file: source, existingTest: existing } : { file: source });
  }

  const findings: Finding[] = missing.map((m) => ({
    check: 'tests',
    severity: config.severity,
    file: m.file,
    message: m.existingTest
      ? `\`${m.file}\` changed but its test \`${m.existingTest}\` was not updated.`
      : `\`${m.file}\` changed and has no associated test.`,
  }));

  return { result: { checkedFiles: sources.length, missing }, findings };
}
