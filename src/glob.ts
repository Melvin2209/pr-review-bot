import { minimatch } from 'minimatch';

const OPTIONS = { dot: true, nocomment: true } as const;

/** True if `path` matches at least one of the glob `patterns`. */
export function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => minimatch(path, pattern, OPTIONS));
}
