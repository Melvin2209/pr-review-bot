import type { Ecosystem, LicenseStatus } from './types.js';

/** Common non-SPDX spellings found in package metadata, mapped to SPDX ids. */
const ALIASES: Record<string, string> = {
  'mit license': 'MIT',
  'the mit license': 'MIT',
  'apache 2.0': 'Apache-2.0',
  'apache-2': 'Apache-2.0',
  'apache 2': 'Apache-2.0',
  'apache license 2.0': 'Apache-2.0',
  'apache license, version 2.0': 'Apache-2.0',
  'apache software license': 'Apache-2.0',
  'bsd': 'BSD-3-Clause',
  'bsd license': 'BSD-3-Clause',
  'new bsd license': 'BSD-3-Clause',
  'simplified bsd license': 'BSD-2-Clause',
  'isc license': 'ISC',
  'isc license (iscl)': 'ISC',
  'gplv2': 'GPL-2.0',
  'gplv3': 'GPL-3.0',
  'gnu general public license v2 (gplv2)': 'GPL-2.0',
  'gnu general public license v3 (gplv3)': 'GPL-3.0',
  'gnu affero general public license v3': 'AGPL-3.0',
  'gnu lesser general public license v2 or later (lgplv2+)': 'LGPL-2.1',
  'gnu lesser general public license v3 (lgplv3)': 'LGPL-3.0',
  'mozilla public license 2.0 (mpl 2.0)': 'MPL-2.0',
  'python software foundation license': 'Python-2.0',
  'the unlicense (unlicense)': 'Unlicense',
  'public domain': 'Unlicense',
};

/** Strip version qualifiers so `GPL-3.0-only`, `GPL-3.0-or-later` and `GPL-3.0+` all compare as `GPL-3.0`. */
export function baseId(id: string): string {
  const trimmed = id.trim();
  const alias = ALIASES[trimmed.toLowerCase()];
  return (alias ?? trimmed).replace(/-(only|or-later)$/i, '').replace(/\+$/, '');
}

type Expr = { id: string } | { op: 'AND' | 'OR'; left: Expr; right: Expr };

function tokenize(expression: string): string[] {
  return expression.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').split(/\s+/).filter(Boolean);
}

/** Tiny recursive-descent parser for SPDX expressions (`AND` binds tighter than `OR`). */
export function parseExpression(expression: string): Expr | null {
  const tokens = tokenize(expression);
  // Free-text licenses ("Apache License 2.0") are not expressions: treat them as one identifier.
  if (!tokens.some((t) => /^(AND|OR|WITH|\(|\))$/i.test(t))) return { id: expression.trim() };
  let pos = 0;

  const primary = (): Expr | null => {
    const token = tokens[pos++];
    if (token === undefined) return null;
    if (token === '(') {
      const inner = orExpr();
      if (tokens[pos++] !== ')') return null;
      return inner;
    }
    if (/^(AND|OR|WITH|\))$/i.test(token)) return null;
    // `Apache-2.0 WITH LLVM-exception`: the exception only adds permissions, keep the base license.
    if (tokens[pos]?.toUpperCase() === 'WITH') pos += 2;
    return { id: token };
  };
  const andExpr = (): Expr | null => {
    let left = primary();
    while (left && tokens[pos]?.toUpperCase() === 'AND') {
      pos++;
      const right = primary();
      if (!right) return null;
      left = { op: 'AND', left, right };
    }
    return left;
  };
  const orExpr = (): Expr | null => {
    let left = andExpr();
    while (left && tokens[pos]?.toUpperCase() === 'OR') {
      pos++;
      const right = andExpr();
      if (!right) return null;
      left = { op: 'OR', left, right };
    }
    return left;
  };

  const expr = orExpr();
  return expr && pos === tokens.length ? expr : null;
}

const RANK: Record<LicenseStatus, number> = { allowed: 0, review: 1, unknown: 2, denied: 3 };

/**
 * Evaluate a license against the policy. With `OR` the consumer may pick the best option;
 * with `AND` every license applies, so the worst one wins.
 */
export function evaluateLicense(license: string | null, allow: readonly string[], deny: readonly string[]): LicenseStatus {
  if (!license || /^(UNLICENSED|UNKNOWN|NOASSERTION|SEE LICENSE IN .*)$/i.test(license.trim())) return 'unknown';
  const expr = parseExpression(license);
  if (!expr) return 'unknown';

  const allowSet = new Set(allow.map((l) => baseId(l).toLowerCase()));
  const denySet = new Set(deny.map((l) => baseId(l).toLowerCase()));

  const visit = (node: Expr): LicenseStatus => {
    if ('id' in node) {
      const id = baseId(node.id).toLowerCase();
      if (denySet.has(id)) return 'denied';
      if (allowSet.has(id)) return 'allowed';
      return 'review';
    }
    const a = visit(node.left);
    const b = visit(node.right);
    if (node.op === 'OR') return RANK[a] <= RANK[b] ? a : b;
    return RANK[a] >= RANK[b] ? a : b;
  };
  return visit(expr);
}

export type Fetcher = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface LicenseResolver {
  resolve(ecosystem: Ecosystem, name: string, version: string): Promise<string | null>;
}

const TIMEOUT_MS = 10_000;

async function getJson(fetcher: Fetcher, url: string): Promise<unknown | null> {
  const res = await fetcher(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.json();
}

/** npm metadata has used `license: "MIT"`, `license: { type }` and `licenses: [{ type }]` over the years. */
export function npmLicense(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const m = meta as { license?: unknown; licenses?: unknown };
  if (typeof m.license === 'string') return m.license;
  if (m.license && typeof m.license === 'object' && typeof (m.license as { type?: unknown }).type === 'string') {
    return (m.license as { type: string }).type;
  }
  if (Array.isArray(m.licenses)) {
    const types = m.licenses.map((l) => (l && typeof l === 'object' ? (l as { type?: unknown }).type : l)).filter((t): t is string => typeof t === 'string');
    if (types.length > 0) return types.length === 1 ? types[0]! : `(${types.join(' OR ')})`;
  }
  return null;
}

/** PyPI: prefer the PEP 639 `license_expression`, then a short `license` field, then trove classifiers. */
export function pypiLicense(meta: unknown): string | null {
  const info = (meta as { info?: Record<string, unknown> } | null)?.info;
  if (!info) return null;
  if (typeof info.license_expression === 'string' && info.license_expression.trim()) return info.license_expression.trim();
  // Some packages paste the whole license text in `license`; only trust short values.
  if (typeof info.license === 'string' && info.license.trim() && info.license.length <= 64 && !info.license.includes('\n')) {
    return info.license.trim();
  }
  const classifiers = Array.isArray(info.classifiers) ? (info.classifiers as unknown[]) : [];
  const fromClassifiers = classifiers
    .filter((c): c is string => typeof c === 'string' && c.startsWith('License :: '))
    .map((c) => c.split(' :: ').pop()!)
    .filter((name) => name !== 'OSI Approved')
    .map((name) => ALIASES[name.toLowerCase()] ?? name);
  if (fromClassifiers.length === 0) return null;
  return fromClassifiers.length === 1 ? fromClassifiers[0]! : `(${fromClassifiers.join(' OR ')})`;
}

/**
 * Resolves licenses from the public registries. `version` is the exact version to look up
 * (see `resolveVersion` in the dependency analyzer); it falls back to the latest release.
 */
export function createRegistryResolver(fetcher: Fetcher = fetch as unknown as Fetcher): LicenseResolver {
  const cache = new Map<string, Promise<string | null>>();

  const lookup = async (ecosystem: Ecosystem, name: string, version: string): Promise<string | null> => {
    if (ecosystem === 'npm') {
      const pkg = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);
      const exact = version ? await getJson(fetcher, `https://registry.npmjs.org/${pkg}/${encodeURIComponent(version)}`) : null;
      return npmLicense(exact ?? (await getJson(fetcher, `https://registry.npmjs.org/${pkg}/latest`)));
    }
    const pkg = encodeURIComponent(name);
    const exact = version ? await getJson(fetcher, `https://pypi.org/pypi/${pkg}/${encodeURIComponent(version)}/json`) : null;
    return pypiLicense(exact ?? (await getJson(fetcher, `https://pypi.org/pypi/${pkg}/json`)));
  };

  return {
    resolve(ecosystem, name, version) {
      const key = `${ecosystem}:${name}@${version}`;
      let pending = cache.get(key);
      if (!pending) {
        pending = lookup(ecosystem, name, version).catch(() => null);
        cache.set(key, pending);
      }
      return pending;
    },
  };
}
