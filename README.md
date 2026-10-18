# PR Review Bot

[![CI](https://github.com/Melvin2209/pr-review-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/Melvin2209/pr-review-bot/actions/workflows/ci.yml)
[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-PR%20Review%20Bot-purple?logo=github)](https://github.com/marketplace/actions/pr-review-bot)

A GitHub Action that does the boring part of reviewing a pull request, so humans can focus on the interesting part.

On every PR it checks:

- 📏 **Size** — warns when a PR is too big to review comfortably (lock files and generated code don't count).
- 🧪 **Tests** — lists changed source files that have no associated test, or whose existing test wasn't updated.
- 🧹 **Leftovers** — finds `TODO`/`FIXME`, `console.log`, `debugger`, `it.only`… in the lines the PR *adds*.
- 📦 **Dependencies** — detects new npm / PyPI dependencies and checks their license against your policy.

It then posts **one** summary comment — checklist, score out of 100, suggestions — and **edits that same comment** on every push instead of piling up new ones.

> **Demo:** see the bot on real pull requests in [Melvin2209/pr-review-bot-demo](https://github.com/Melvin2209/pr-review-bot-demo/pulls).

## Example comment

> ## 🟠 PR Review Bot
>
> **Score: 45/100 (D)** — 2 errors · 5 warnings
>
> ### ✅ Checklist
>
> - [x] **Size** — 53 lines changed (+48 / −5) in 6 files
> - [ ] **Tests** — 2 changed files without an associated test
> - [ ] **Leftovers** — 3 TODO / debug statements added
> - [ ] **Dependencies** — 2 of 2 new dependencies need a license check
>
> ### 📦 New dependencies
>
> | Package | Version | Type | License | Status |
> | --- | --- | --- | --- | --- |
> | `left-pad` | `^1.3.0` | npm | WTFPL | ⚠️ not in allow list |
> | `gpl-thing` | `2.0.0` | npm | GPL-3.0-or-later | ⛔ denied |
>
> ### 💡 Suggestions
>
> - Add tests for `src/checkout/discount.ts`.
> - Remove leftover debugging code (`console.log`).
> - Replace `gpl-thing` with an alternative under an approved license, or get an explicit legal sign-off.

The full rendering is in [`__tests__/__snapshots__/comment.full.md`](__tests__/__snapshots__/comment.full.md).

## Quick start

Create `.github/workflows/pr-review.yml`:

```yaml
name: PR review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: Melvin2209/pr-review-bot@v1
```

No checkout step is needed: the action reads everything through the GitHub API. That's it — sensible defaults apply until you add a `.pr-review.yml`.

## Inputs

| Input | Default | Description |
| --- | --- | --- |
| `github-token` | `${{ github.token }}` | Token used to read the PR and write the comment. |
| `config-path` | `.pr-review.yml` | Location of the configuration file. |
| `fail-on` | `never` | Fail the job when there are findings of this severity or worse: `error`, `warning` or `never`. |
| `min-score` | `0` | Fail the job when the score is below this value. |
| `comment` | *(from config)* | `false` to skip the PR comment. The report is always written to the job summary. |

## Outputs

| Output | Description |
| --- | --- |
| `score` | Score from 0 to 100. |
| `grade` | `A` (≥ 90), `B` (≥ 75), `C` (≥ 60), `D` (≥ 40) or `F`. |
| `errors` / `warnings` | Number of findings per severity. |
| `comment-id` | ID of the summary comment. |
| `report` | The full report as JSON, for your own follow-up steps. |

```yaml
      - uses: Melvin2209/pr-review-bot@v1
        id: review
      - if: steps.review.outputs.grade == 'F'
        run: gh pr edit ${{ github.event.number }} --add-label "needs-split"
        env:
          GH_TOKEN: ${{ github.token }}
```

## Configuration

Add a `.pr-review.yml` at the root of the repository. Every key is optional; anything you leave out keeps its default. A check can be turned off with `false` (e.g. `tests: false`).

```yaml
size:
  warn: 400          # changed lines (additions + deletions) → warning
  max: 1000          # → error
  exclude:           # not counted in the size
    add: ['generated/**']

tests:
  severity: warning  # severity of a file without a test
  source: ['src/**/*.{ts,tsx,js,jsx}']   # files that should have tests
  test: ['**/*.{test,spec}.*', '**/__tests__/**']
  ignore:
    add: ['src/migrations/**']

leftovers:
  rules:             # replaces the default rules
    - name: TODO
      pattern: '\b(TODO|FIXME)\b'
      severity: warning
    - name: console.log
      pattern: '\bconsole\.(log|debug)\('
      severity: error
    - name: nocommit
      pattern: 'nocommit'
      flags: i
      severity: error
  exclude:
    add: ['scripts/**']

dependencies:
  devDependencies: true       # also check devDependencies / requirements-dev.txt
  allow:
    add: [MPL-2.0]
  deny: [GPL-3.0, AGPL-3.0]
  unknownSeverity: warning    # license unknown or not in the allow list

score:
  penalties: { error: 15, warning: 5, info: 1 }
  maxPenaltyPerCheck: 40

comment:
  enabled: true
  header: PR Review Bot
```

**List fields** (`exclude`, `source`, `test`, `ignore`, `allow`, `deny`) accept either a plain list, which replaces the default, or `{ add: [...], remove: [...] }`, which edits it.

An invalid file fails the job with a precise message, e.g. ``Invalid configuration: `size.warn` must be a non-negative integer, got "lots"``.

<details>
<summary>Default values</summary>

See [`DEFAULT_CONFIG` in `src/config.ts`](src/config.ts). Highlights:

- **size**: warn at 400, error at 1000; lock files, `dist/**`, snapshots and `*.min.js` are excluded.
- **tests**: sources under `src/`, `lib/`, `app/` and Python files; `index.ts`, `types.ts`, `*.d.ts`, `__init__.py` and config files are ignored.
- **leftovers**: `TODO`/`FIXME`/`XXX`/`HACK` (warning), `console.log`/`debug`/`trace` (error), `debugger` (error), `it.only`/`describe.only` (error), `print(` (warning). Markdown and test files are excluded.
- **dependencies**: MIT, ISC, Apache-2.0, BSD-2/3-Clause, 0BSD, Unlicense, CC0-1.0, BlueOak-1.0.0 and Python-2.0 are allowed; GPL, AGPL, LGPL, SSPL and BUSL are denied.

</details>

## How the checks work

**Size** sums additions and deletions of every file not matched by `size.exclude`.

**Tests**: a source file is "covered" when the PR also changes a test file with the same module name — `src/cart/total.ts` ↔ `total.test.ts`, `total.spec.tsx`, `__tests__/total.ts`, `test_total.py`… If no test changed, the repository tree is searched so the comment can say *"test exists but was not updated"* instead of *"no test found"*. When names collide, a test in a matching folder wins.

**Leftovers** only looks at lines added by the PR (parsed from the diff), so existing TODOs never show up. The first matching rule wins for each line.

**Dependencies** compares each changed `package.json` and `requirements*.txt` between the base and head commits. Licenses come from the npm registry and PyPI (PEP 639 `license_expression`, then `license`, then trove classifiers). SPDX expressions are evaluated properly: `MIT OR GPL-3.0` is allowed (you may pick MIT), `MIT AND GPL-3.0` is denied. `-only` / `-or-later` / `+` suffixes are normalised, and common spellings like "Apache License 2.0" are recognised. Workspace, file and git dependencies are skipped.

**Score** starts at 100 and subtracts a penalty per finding (15 / 5 / 1 by severity). A single check can cost at most 40 points, so forty TODOs can't hide a denied license.

## Security notes

- **The configuration is read from the base branch**, so a PR cannot relax the rules applied to itself. The PR's version is only used when the base branch has no config yet (the PR that introduces it).
- **Forks**: on `pull_request` events from forks, GitHub gives the workflow a read-only token. The action then can't comment; it logs a warning and the report is still available in the job summary and as annotations. If you need comments on fork PRs, use `pull_request_target` — the action never checks out or runs code from the PR, so it is safe to use there.
- Network access is limited to the GitHub API, `registry.npmjs.org` and `pypi.org`.

## Development

```bash
npm ci
npm test               # Vitest, with simulated GitHub payloads in __fixtures__/
npm run typecheck
npm run build          # bundles src/ into dist/ with @vercel/ncc
npm run all            # all of the above
```

The GitHub API is hidden behind a small `GitHubClient` interface (`src/github.ts`); tests use an in-memory fake (`__tests__/helpers/fake-github.ts`) fed with real-shaped webhook and REST payloads, and a fake `fetch` for the registries.

### Try it on a local repository

```bash
npm run review:local -- --repo ../some-repo --base main --head my-branch
```

This runs the same analysis on `git diff main...my-branch`, with real registry lookups, and prints the comment.

### Demo repository

[`demo/create-demo-repo.sh`](demo/create-demo-repo.sh) creates a small repository with the action installed and opens four PRs, one per check (clean, leftovers, licenses, oversized):

```bash
gh auth login
demo/create-demo-repo.sh <your-github-user>         # creates <user>/pr-review-bot-demo
demo/create-demo-repo.sh --local /tmp/demo          # or just build it locally
```

## Releasing

The project follows [semantic versioning](https://semver.org/). `dist/` is committed because GitHub runs the bundle directly, and CI fails if it is out of date.

1. Add a section for the new version in [`CHANGELOG.md`](CHANGELOG.md).
2. Either run `scripts/release.sh patch|minor|major` from an up-to-date `main` (it bumps `package.json`, rebuilds `dist/`, commits, tags `vX.Y.Z` and pushes), or bump the version in a normal commit and click **Actions → Release → Run workflow**, which creates the `vX.Y.Z` tag for the current `package.json` version.
3. The [Release workflow](.github/workflows/release.yml) checks the tag matches `package.json` and `dist/`, publishes a GitHub release with the changelog notes, and moves the major tag (`v1`) so `@v1` users get the update.
4. **First release only:** edit the release on GitHub and tick *"Publish this Action to the GitHub Marketplace"* (requires accepting the Marketplace agreement). Later releases stay listed.

## License

[MIT](LICENSE)
