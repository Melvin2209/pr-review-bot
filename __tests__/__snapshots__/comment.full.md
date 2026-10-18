<!-- pr-review-bot:summary -->

## 🟠 PR Review Bot

**Score: 45/100 (D)** — 2 errors · 5 warnings

### ✅ Checklist

- [x] **Size** — 53 lines changed (+48 / −5) in 6 files
- [ ] **Tests** — 2 changed files without an associated test
- [ ] **Leftovers** — 3 TODO / debug statements added
- [ ] **Dependencies** — 2 of 2 new dependencies need a license check

### 🧪 Files without associated tests

| File | Status |
| --- | --- |
| [`src/checkout/discount.ts`](https://github.com/acme/shop/blob/9f1c2e7b4a8d3f6e5c1b0a9d8e7f6a5b4c3d2e1f/src/checkout/discount.ts) | no test found |
| [`src/checkout/format.ts`](https://github.com/acme/shop/blob/9f1c2e7b4a8d3f6e5c1b0a9d8e7f6a5b4c3d2e1f/src/checkout/format.ts) | test exists but not updated: [`test/checkout/format.spec.ts`](https://github.com/acme/shop/blob/9f1c2e7b4a8d3f6e5c1b0a9d8e7f6a5b4c3d2e1f/test/checkout/format.spec.ts) |

### 🧹 Leftovers

| Rule | Location | Code |
| --- | --- | --- |
| 🟡 TODO | [`src/checkout/discount.ts:6`](https://github.com/acme/shop/blob/9f1c2e7b4a8d3f6e5c1b0a9d8e7f6a5b4c3d2e1f/src/checkout/discount.ts#L6) | `// TODO: load codes from the database` |
| 🔴 console.log | [`src/checkout/discount.ts:18`](https://github.com/acme/shop/blob/9f1c2e7b4a8d3f6e5c1b0a9d8e7f6a5b4c3d2e1f/src/checkout/discount.ts#L18) | `console.log('applying discount', discount);` |
| 🟡 TODO | [`src/checkout/cart.ts:15`](https://github.com/acme/shop/blob/9f1c2e7b4a8d3f6e5c1b0a9d8e7f6a5b4c3d2e1f/src/checkout/cart.ts#L15) | `// FIXME: rounding errors on large carts` |

### 📦 New dependencies

| Package | Version | Type | License | Status |
| --- | --- | --- | --- | --- |
| `left-pad` | `^1.3.0` | npm | WTFPL | ⚠️ not in allow list |
| `gpl-thing` | `2.0.0` | npm | GPL-3.0-or-later | ⛔ denied |

### 💡 Suggestions

- Add tests for `src/checkout/discount.ts`.
- Check whether `test/checkout/format.spec.ts` should cover the new behaviour.
- Turn new TODO/FIXME comments into issues, or resolve them before merging.
- Remove leftover debugging code (`console.log`).
- Replace `gpl-thing` with an alternative under an approved license, or get an explicit legal sign-off.
- Verify the license of `left-pad`; if acceptable, add it to `dependencies.allow` in `.pr-review.yml`.

---
<sub>Updated for 9f1c2e7 · default rules (no `.pr-review.yml` found) · this comment is edited in place on every push.</sub>
