import { posix } from 'node:path';
import semver from 'semver';
import type { Config } from '../config.js';
import type { GitHubClient } from '../github.js';
import { evaluateLicense, type LicenseResolver } from '../licenses.js';
import type { AddedDependency, ChangedFile, DependenciesResult, Ecosystem, Finding, PullRequestInfo, Severity } from '../types.js';

interface DeclaredDependency {
  name: string;
  /** Version spec as written in the manifest. */
  spec: string;
  dev: boolean;
}

type ManifestKind = { ecosystem: Ecosystem; parse: (content: string, includeDev: boolean) => DeclaredDependency[] };

export function parsePackageJson(content: string, includeDev: boolean): DeclaredDependency[] {
  let pkg: Record<string, unknown>;
  try {
    pkg = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return [];
  }
  const sections: [string, boolean][] = [
    ['dependencies', false],
    ['optionalDependencies', false],
    ['peerDependencies', false],
  ];
  if (includeDev) sections.push(['devDependencies', true]);

  const result: DeclaredDependency[] = [];
  for (const [key, dev] of sections) {
    const deps = pkg[key];
    if (!deps || typeof deps !== 'object') continue;
    for (const [name, spec] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof spec === 'string') result.push({ name, spec, dev });
    }
  }
  return result;
}

const PEP503 = (name: string) => name.toLowerCase().replace(/[-_.]+/g, '-');

export function parseRequirements(content: string, isDev: boolean): DeclaredDependency[] {
  const result: DeclaredDependency[] = [];
  for (const raw of content.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trim();
    if (!line || line.startsWith('-') || line.includes('://')) continue;
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(\[[^\]]*\])?\s*([^;]*)/.exec(line);
    if (!match) continue;
    result.push({ name: PEP503(match[1]!), spec: match[3]!.trim(), dev: isDev });
  }
  return result;
}

function manifestKind(path: string): ManifestKind | null {
  if (path.split('/').includes('node_modules')) return null;
  const base = posix.basename(path);
  if (base === 'package.json') return { ecosystem: 'npm', parse: parsePackageJson };
  if (/^requirements([-_.].*)?\.txt$/i.test(base)) {
    const dev = /dev|test|lint|doc/i.test(base);
    return { ecosystem: 'pypi', parse: (content, includeDev) => (dev && !includeDev ? [] : parseRequirements(content, dev)) };
  }
  return null;
}

/** Turn a manifest spec into an exact version we can look up, or `''` for "latest". */
export function resolveVersion(ecosystem: Ecosystem, spec: string): string | null {
  if (ecosystem === 'pypi') {
    const pinned = /^===?\s*([^,\s]+)$/.exec(spec);
    return pinned ? pinned[1]! : '';
  }
  // Not from the registry: workspaces, local paths, git URLs, tarballs…
  if (/^(workspace:|file:|link:|portal:|git\+|git:|github:|https?:)/.test(spec) || spec.includes('/')) return null;
  if (spec === '' || spec === '*' || spec === 'latest') return '';
  if (semver.valid(spec)) return spec;
  if (semver.validRange(spec)) return semver.minVersion(spec)?.version ?? '';
  return ''; // dist-tag such as `next`
}

/** Map over `items` with at most `limit` promises in flight. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function analyzeDependencies(
  files: ChangedFile[],
  pr: PullRequestInfo,
  client: GitHubClient,
  resolver: LicenseResolver,
  config: Config['dependencies'],
): Promise<{ result: DependenciesResult; findings: Finding[] }> {
  const manifests = files
    .filter((f) => f.status !== 'removed')
    .map((f) => ({ file: f, kind: manifestKind(f.filename) }))
    .filter((m): m is { file: ChangedFile; kind: ManifestKind } => m.kind !== null);

  const candidates: { dep: DeclaredDependency; ecosystem: Ecosystem; manifest: string; version: string }[] = [];
  for (const { file, kind } of manifests) {
    const basePath = file.status === 'renamed' && file.previous_filename ? file.previous_filename : file.filename;
    const [before, after] = await Promise.all([
      file.status === 'added' ? Promise.resolve(null) : client.getFileContent(pr.owner, pr.repo, basePath, pr.baseSha),
      client.getFileContent(pr.owner, pr.repo, file.filename, pr.headSha),
    ]);
    if (after === null) continue;
    const existing = new Set(before ? kind.parse(before, true).map((d) => d.name) : []);
    for (const dep of kind.parse(after, config.devDependencies)) {
      if (existing.has(dep.name)) continue;
      let { name, spec } = dep;
      // npm aliases: "my-lodash": "npm:lodash@^4"
      const alias = kind.ecosystem === 'npm' ? /^npm:((?:@[^/]+\/)?[^@]+)(?:@(.*))?$/.exec(spec) : null;
      if (alias) {
        name = alias[1]!;
        spec = alias[2] ?? '';
      }
      const version = resolveVersion(kind.ecosystem, spec);
      if (version === null) continue;
      candidates.push({ dep: { ...dep, name, spec }, ecosystem: kind.ecosystem, manifest: file.filename, version });
    }
  }

  const added: AddedDependency[] = await mapLimit(candidates, 8, async ({ dep, ecosystem, manifest, version }) => {
    const license = await resolver.resolve(ecosystem, dep.name, version);
    return {
      name: dep.name,
      version: dep.spec || 'latest',
      ecosystem,
      manifest,
      dev: dep.dev,
      license,
      status: evaluateLicense(license, config.allow, config.deny),
    };
  });

  const findings: Finding[] = [];
  for (const dep of added) {
    const label = `\`${dep.name}@${dep.version}\``;
    let severity: Severity | null = null;
    let message = '';
    if (dep.status === 'denied') {
      severity = 'error';
      message = `${label} uses a denied license (${dep.license}).`;
    } else if (dep.status === 'unknown') {
      severity = config.unknownSeverity;
      message = `Could not determine the license of ${label}.`;
    } else if (dep.status === 'review') {
      severity = config.unknownSeverity;
      message = `${label} uses ${dep.license}, which is not in the allow list.`;
    }
    if (severity) findings.push({ check: 'dependencies', severity, file: dep.manifest, message });
  }
  return { result: { added }, findings };
}
