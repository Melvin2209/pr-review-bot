import { posix } from 'node:path';
import type { ChangedFile, Report } from '../types.js';

type Sections = Pick<Report, 'size' | 'tests' | 'leftovers' | 'dependencies'>;

const list = (items: string[], max = 3) =>
  items.length <= max ? items.join(', ') : `${items.slice(0, max).join(', ')} and ${items.length - max} more`;

/** Top-level-ish directories with the most changed lines: natural boundaries to split a PR. */
function biggestAreas(files: ChangedFile[]): string[] {
  const byDir = new Map<string, number>();
  for (const f of files) {
    const parts = posix.dirname(f.filename).split('/');
    const dir = parts[0] === '.' ? '(root)' : parts.slice(0, 2).join('/');
    byDir.set(dir, (byDir.get(dir) ?? 0) + f.changes);
  }
  return [...byDir.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([dir, n]) => `\`${dir}\` (${n} lines)`);
}

export function buildSuggestions(sections: Sections, files: ChangedFile[]): string[] {
  const out: string[] = [];
  const { size, tests, leftovers, dependencies } = sections;

  if (size.result && size.result.level !== 'ok') {
    const areas = biggestAreas(files);
    out.push(
      areas.length > 1
        ? `Split this PR into smaller ones — the biggest areas are ${areas.join(', ')}.`
        : 'Split this PR into smaller, independently reviewable steps (e.g. refactor first, then behaviour change).',
    );
  }

  if (tests.result && tests.result.missing.length > 0) {
    const stale = tests.result.missing.filter((m) => m.existingTest).map((m) => `\`${m.existingTest}\``);
    const untested = tests.result.missing.filter((m) => !m.existingTest).map((m) => `\`${m.file}\``);
    if (untested.length > 0) out.push(`Add tests for ${list(untested)}.`);
    if (stale.length > 0) out.push(`Check whether ${list(stale)} should cover the new behaviour.`);
  }

  if (leftovers.result && leftovers.result.items.length > 0) {
    const rules = new Set(leftovers.result.items.map((i) => i.rule));
    if (rules.has('TODO')) out.push('Turn new TODO/FIXME comments into issues, or resolve them before merging.');
    const debug = [...rules].filter((r) => r !== 'TODO');
    if (debug.length > 0) out.push(`Remove leftover debugging code (${debug.map((r) => `\`${r}\``).join(', ')}).`);
  }

  if (dependencies.result) {
    const denied = dependencies.result.added.filter((d) => d.status === 'denied').map((d) => `\`${d.name}\``);
    const unclear = dependencies.result.added.filter((d) => d.status === 'unknown' || d.status === 'review').map((d) => `\`${d.name}\``);
    if (denied.length > 0) out.push(`Replace ${list(denied)} with an alternative under an approved license, or get an explicit legal sign-off.`);
    if (unclear.length > 0) {
      out.push(`Verify the license of ${list(unclear)}; if acceptable, add it to \`dependencies.allow\` in \`.pr-review.yml\`.`);
    }
  }

  return out;
}
