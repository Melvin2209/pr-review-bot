import type { Config } from '../config.js';
import { matchesAny } from '../glob.js';
import { addedLines } from '../patch.js';
import type { ChangedFile, Finding, Leftover, LeftoversResult } from '../types.js';

const MAX_TEXT = 120;

export function analyzeLeftovers(files: ChangedFile[], config: Config['leftovers']): { result: LeftoversResult; findings: Finding[] } {
  // `g`/`y` would make `RegExp#test` stateful across lines, so they are dropped.
  const rules = config.rules.map((rule) => ({ ...rule, regex: new RegExp(rule.pattern, rule.flags?.replace(/[gy]/g, '')) }));
  const items: Leftover[] = [];

  for (const file of files) {
    if (file.status === 'removed' || matchesAny(file.filename, config.exclude)) continue;
    for (const { line, text } of addedLines(file.patch)) {
      // One finding per line: the first matching rule wins (rules are ordered by the user).
      const rule = rules.find((r) => r.regex.test(text));
      if (!rule) continue;
      const trimmed = text.trim();
      items.push({
        file: file.filename,
        line,
        rule: rule.name,
        severity: rule.severity,
        text: trimmed.length > MAX_TEXT ? `${trimmed.slice(0, MAX_TEXT - 1)}…` : trimmed,
      });
    }
  }

  const findings: Finding[] = items.map((item) => ({
    check: 'leftovers',
    severity: item.severity,
    file: item.file,
    line: item.line,
    message: `${item.rule} left in \`${item.file}:${item.line}\``,
  }));
  return { result: { items }, findings };
}
