import { describe, expect, it } from 'vitest';
import { addedLines } from '../src/patch.js';

describe('addedLines', () => {
  it('returns nothing for a missing patch (binary or too large)', () => {
    expect(addedLines(undefined)).toEqual([]);
  });

  it('tracks line numbers in the new file across hunks', () => {
    const patch = [
      '@@ -1,3 +1,4 @@',
      ' line one',
      '-old two',
      '+new two',
      '+inserted',
      ' line three',
      '@@ -40,2 +41,3 @@ function foo() {',
      ' context',
      '+added at 42',
      ' end',
      '\\ No newline at end of file',
    ].join('\n');
    expect(addedLines(patch)).toEqual([
      { line: 2, text: 'new two' },
      { line: 3, text: 'inserted' },
      { line: 42, text: 'added at 42' },
    ]);
  });

  it('handles hunk headers without a line count', () => {
    expect(addedLines('@@ -0,0 +1 @@\n+only line')).toEqual([{ line: 1, text: 'only line' }]);
  });
});
