import type { Config } from '../config.js';
import type { CheckId, Finding } from '../types.js';

export function computeScore(findings: Finding[], config: Config['score']): number {
  const perCheck = new Map<CheckId, number>();
  for (const f of findings) {
    perCheck.set(f.check, (perCheck.get(f.check) ?? 0) + config.penalties[f.severity]);
  }
  let penalty = 0;
  for (const value of perCheck.values()) penalty += Math.min(value, config.maxPenaltyPerCheck);
  return Math.max(0, 100 - penalty);
}

export function grade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
