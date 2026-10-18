import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { computeScore, grade } from '../src/report/score.js';
import type { Finding } from '../src/types.js';

const f = (check: Finding['check'], severity: Finding['severity']): Finding => ({ check, severity, message: '' });

describe('computeScore', () => {
  it('is 100 without findings', () => {
    expect(computeScore([], DEFAULT_CONFIG.score)).toBe(100);
  });

  it('subtracts the configured penalty per severity', () => {
    expect(computeScore([f('size', 'error'), f('tests', 'warning'), f('tests', 'info')], DEFAULT_CONFIG.score)).toBe(100 - 15 - 5 - 1);
  });

  it('caps the penalty of a single check', () => {
    const many = Array.from({ length: 20 }, () => f('leftovers', 'error'));
    expect(computeScore(many, DEFAULT_CONFIG.score)).toBe(60);
    expect(computeScore([...many, f('size', 'error')], DEFAULT_CONFIG.score)).toBe(45);
  });

  it('never goes below zero', () => {
    const config = { penalties: { error: 50, warning: 0, info: 0 }, maxPenaltyPerCheck: 100 };
    expect(computeScore([f('size', 'error'), f('tests', 'error'), f('leftovers', 'error')], config)).toBe(0);
  });
});

describe('grade', () => {
  it.each([
    [100, 'A'],
    [90, 'A'],
    [89, 'B'],
    [75, 'B'],
    [60, 'C'],
    [40, 'D'],
    [39, 'F'],
    [0, 'F'],
  ])('%i → %s', (score, letter) => expect(grade(score)).toBe(letter));
});
