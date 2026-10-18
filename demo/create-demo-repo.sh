#!/usr/bin/env bash
# Creates the demo repository and opens one pull request per scenario, so pr-review-bot
# runs on real PRs.
#
#   demo/create-demo-repo.sh <github-owner> [repo-name]      # create on GitHub (needs `gh auth login`)
#   demo/create-demo-repo.sh --local <dir>                   # only build the git repo locally
#
# The action must already be published as <github-owner>/pr-review-bot with a v1 tag.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "${1:-}" = "--local" ]; then
  LOCAL=1
  OWNER="your-name"
  DIR="${2:?usage: create-demo-repo.sh --local <dir>}"
else
  LOCAL=0
  OWNER="${1:?usage: create-demo-repo.sh <github-owner> [repo-name]}"
  NAME="${2:-pr-review-bot-demo}"
  DIR="$(mktemp -d)/$NAME"
fi

if [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
  echo "$DIR already exists and is not empty." >&2
  exit 1
fi
mkdir -p "$DIR"
cp -R "$HERE/template/." "$DIR/"
grep -rl '__OWNER__' "$DIR" | xargs sed -i.bak "s/__OWNER__/$OWNER/g"
find "$DIR" -name '*.bak' -delete

cd "$DIR"
git init -q -b main
git add -A
git commit -q -m "Initial commit: demo shop library"

if [ "$LOCAL" = 0 ]; then
  gh repo create "$OWNER/$NAME" --public --source . --push \
    --description "Demo repository for pr-review-bot: every open PR exercises one check."
fi

# open_pr <branch> <title> <body>: commit the working tree on a new branch and open a PR.
open_pr() {
  local branch="$1" title="$2" body="$3"
  git add -A
  git commit -q -m "$title"
  if [ "$LOCAL" = 0 ]; then
    git push -q -u origin "$branch"
    gh pr create --base main --head "$branch" --title "$title" --body "$body"
  fi
  git checkout -q main
}

# 1. Clean PR: new module with its test.
git checkout -q -b feat/coupons
cat > src/coupon.ts <<'EOF'
export interface Coupon {
  code: string;
  percent: number;
}

export function applyCoupon(total: number, coupon: Coupon): number {
  if (coupon.percent <= 0 || coupon.percent > 100) throw new RangeError(`Invalid percent: ${coupon.percent}`);
  return Math.round(total * (100 - coupon.percent)) / 100;
}
EOF
cat > src/coupon.test.ts <<'EOF'
import { describe, expect, it } from 'vitest';
import { applyCoupon } from './coupon.js';

describe('applyCoupon', () => {
  it('applies a percentage', () => {
    expect(applyCoupon(200, { code: 'TEN', percent: 10 })).toBe(180);
  });

  it('rejects invalid percentages', () => {
    expect(() => applyCoupon(100, { code: 'BAD', percent: 120 })).toThrow(RangeError);
  });
});
EOF
open_pr feat/coupons "Add coupon codes" "A clean PR: new code comes with its tests. Expected score: 100."

# 2. Leftovers + source changed without touching its test.
git checkout -q -b chore/debug-leftovers
cat > src/cart.ts <<'EOF'
export interface Item {
  sku: string;
  price: number;
  quantity: number;
}

export class Cart {
  private readonly items: Item[] = [];

  add(item: Item): void {
    console.log('adding item', item);
    const existing = this.items.find((i) => i.sku === item.sku);
    if (existing) existing.quantity += item.quantity;
    else this.items.push({ ...item });
  }

  remove(sku: string): void {
    // TODO: decrement quantity instead of removing the whole line
    const index = this.items.findIndex((i) => i.sku === sku);
    if (index >= 0) this.items.splice(index, 1);
  }

  total(): number {
    return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  get size(): number {
    return this.items.length;
  }
}
EOF
open_pr chore/debug-leftovers "Add Cart.remove" "Leaves a console.log and a TODO behind, and changes cart.ts without updating cart.test.ts."

# 3. New dependencies with different licenses.
git checkout -q -b feat/new-dependencies
node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
  Object.assign(pkg.dependencies, { "zod": "^4.0.0", "left-pad": "^1.3.0", "ffmpeg-static": "^5.2.0" });
  fs.writeFileSync("package.json", JSON.stringify(pkg, null, 2) + "\n");
'
open_pr feat/new-dependencies "Add validation and media dependencies" "Adds zod (MIT, allowed), left-pad (WTFPL, not in the allow list) and ffmpeg-static (GPL-3.0-or-later, denied)."

# 4. Oversized PR.
git checkout -q -b refactor/huge-change
mkdir -p src/catalog
for n in $(seq 1 12); do
  {
    echo "// Generated catalog page $n"
    echo "export const page$n = ["
    for i in $(seq 1 80); do echo "  { sku: 'sku-$n-$i', price: $((i * 3 % 97 + 1)), name: 'Product $n-$i' },"; done
    echo "];"
  } > "src/catalog/page$n.ts"
done
open_pr refactor/huge-change "Import the full product catalog" "Over 900 changed lines: the bot flags it as too big to review comfortably."

echo
if [ "$LOCAL" = 0 ]; then
  echo "Done: https://github.com/$OWNER/$NAME/pulls"
else
  echo "Local demo repository ready in $DIR (branches: $(git branch --format='%(refname:short)' | tr '\n' ' '))"
fi
