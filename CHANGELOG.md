# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] - 2026-10-18

### Added

- PR size check with configurable warning and error thresholds; lock files and generated code are excluded by default.
- Detection of changed source files without an associated test, distinguishing "no test" from "test exists but was not updated".
- Detection of leftover `TODO`/`FIXME`, `console.log`, `debugger`, focused tests (`.only`) and `print()` in added lines, with custom rules.
- New dependency detection for `package.json` and `requirements*.txt`, with license lookup on npm / PyPI and an allow/deny policy that understands SPDX expressions.
- Single summary comment (checklist, score, grade, suggestions) edited in place on every push.
- `.pr-review.yml` configuration, read from the base branch.
- Job summary, inline annotations, `fail-on` / `min-score` inputs and `score`, `grade`, `errors`, `warnings`, `comment-id`, `report` outputs.

[Unreleased]: https://github.com/OWNER/pr-review-bot/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/OWNER/pr-review-bot/releases/tag/v1.0.0
