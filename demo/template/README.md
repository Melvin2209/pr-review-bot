# pr-review-bot demo

A tiny shop library used to show [pr-review-bot](https://github.com/__OWNER__/pr-review-bot) running on real pull requests.

Each open PR exercises one check:

| PR | What it shows |
| --- | --- |
| `feat/coupons` | A clean PR: code + tests → score 100 |
| `chore/debug-leftovers` | `console.log` / `TODO` left behind, source changed without updating tests |
| `feat/new-dependencies` | New dependencies with an allowed (MIT), unlisted (WTFPL) and denied (GPL-3.0) license |
| `refactor/huge-change` | A PR over the size limit |

Push a new commit to any of them: the bot edits its existing comment instead of posting a new one.
