export interface AddedLine {
  /** Line number in the new version of the file. */
  line: number;
  text: string;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Extract the lines added by a unified diff, with their line numbers in the new file. */
export function addedLines(patch: string | undefined): AddedLine[] {
  if (!patch) return [];
  const result: AddedLine[] = [];
  let line = 0;
  let inHunk = false;

  for (const raw of patch.split('\n')) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      line = Number(header[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (raw.startsWith('+')) {
      result.push({ line, text: raw.slice(1) });
      line++;
    } else if (raw.startsWith('-')) {
      // Removed line: does not exist in the new file.
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file"
    } else {
      line++;
    }
  }
  return result;
}
