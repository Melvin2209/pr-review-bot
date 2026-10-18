import { describe, expect, it } from 'vitest';
import { analyzeDependencies, parsePackageJson, parseRequirements, resolveVersion } from '../src/analyzers/dependencies.js';
import { DEFAULT_CONFIG } from '../src/config.js';
import { createRegistryResolver } from '../src/licenses.js';
import { FakeGitHub } from './helpers/fake-github.js';
import { BASE_SHA, HEAD_SHA, fakeFetch, file, fixtureText, prFiles, prInfo } from './helpers/fixtures.js';

const config = DEFAULT_CONFIG.dependencies;

describe('manifest parsing', () => {
  it('reads every dependency section of package.json', () => {
    const pkg = JSON.stringify({
      dependencies: { a: '^1.0.0' },
      devDependencies: { b: '2.0.0' },
      peerDependencies: { c: '*' },
      optionalDependencies: { d: '~3.1.0' },
    });
    expect(parsePackageJson(pkg, true).map((d) => [d.name, d.dev])).toEqual([
      ['a', false],
      ['d', false],
      ['c', false],
      ['b', true],
    ]);
    expect(parsePackageJson(pkg, false).map((d) => d.name)).toEqual(['a', 'd', 'c']);
    expect(parsePackageJson('{ not json', true)).toEqual([]);
  });

  it('reads requirements.txt, skipping options, URLs and comments', () => {
    const txt = [
      '# pinned',
      'requests==2.32.3  # http',
      'Django_REST.framework>=3.15',
      'uvicorn[standard]~=0.30 ; python_version >= "3.9"',
      '-r base.txt',
      '-e .',
      'git+https://github.com/x/y.git',
      '',
    ].join('\n');
    expect(parseRequirements(txt, false).map((d) => [d.name, d.spec])).toEqual([
      ['requests', '==2.32.3'],
      ['django-rest-framework', '>=3.15'],
      ['uvicorn', '~=0.30'],
    ]);
  });
});

describe('resolveVersion', () => {
  it.each([
    ['npm', '1.2.3', '1.2.3'],
    ['npm', '^1.3.0', '1.3.0'],
    ['npm', '>=2 <3', '2.0.0'],
    ['npm', '*', ''],
    ['npm', 'next', ''],
    ['npm', 'workspace:*', null],
    ['npm', 'file:../lib', null],
    ['npm', 'github:user/repo', null],
    ['npm', 'user/repo#main', null],
    ['pypi', '==2.32.3', '2.32.3'],
    ['pypi', '>=3.15', ''],
  ] as const)('%s %s → %s', (eco, spec, expected) => expect(resolveVersion(eco, spec)).toBe(expected));
});

describe('analyzeDependencies', () => {
  it('reports dependencies added to package.json with their license status', async () => {
    const client = new FakeGitHub({
      files: prFiles(),
      contents: {
        [BASE_SHA]: { 'package.json': fixtureText('api/package.base.json') },
        [HEAD_SHA]: { 'package.json': fixtureText('api/package.head.json') },
      },
    });
    const { result, findings } = await analyzeDependencies(prFiles(), prInfo(), client, createRegistryResolver(fakeFetch()), config);

    expect(result.added).toEqual([
      { name: 'left-pad', version: '^1.3.0', ecosystem: 'npm', manifest: 'package.json', dev: false, license: 'WTFPL', status: 'review' },
      { name: 'gpl-thing', version: '2.0.0', ecosystem: 'npm', manifest: 'package.json', dev: false, license: 'GPL-3.0-or-later', status: 'denied' },
    ]);
    expect(findings).toEqual([
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('WTFPL, which is not in the allow list') }),
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('denied license (GPL-3.0-or-later)') }),
    ]);
  });

  it('treats every dependency of a new manifest as added, and resolves npm aliases', async () => {
    const manifest = JSON.stringify({ dependencies: { lodash: '4.17.21', 'my-scope': 'npm:@scope/pkg@^1.0.0', local: 'workspace:*' } });
    const files = [file('packages/new/package.json', { status: 'added' })];
    const client = new FakeGitHub({ files, contents: { [HEAD_SHA]: { 'packages/new/package.json': manifest } } });
    const { result, findings } = await analyzeDependencies(files, prInfo(), client, createRegistryResolver(fakeFetch()), config);
    expect(result.added.map((d) => [d.name, d.version, d.status])).toEqual([
      ['lodash', '4.17.21', 'allowed'],
      ['@scope/pkg', '^1.0.0', 'allowed'],
    ]);
    expect(findings).toEqual([]);
  });

  it('handles requirements files and unknown licenses', async () => {
    const files = [file('requirements.txt'), file('requirements-dev.txt')];
    const client = new FakeGitHub({
      files,
      contents: {
        [BASE_SHA]: { 'requirements.txt': 'flask==3.0.0\n', 'requirements-dev.txt': '' },
        [HEAD_SHA]: { 'requirements.txt': 'flask==3.0.0\nrequests==2.32.3\nmystery==0.1\n', 'requirements-dev.txt': 'pyqt5\n' },
      },
    });
    const resolver = createRegistryResolver(fakeFetch());
    const all = await analyzeDependencies(files, prInfo(), client, resolver, config);
    expect(all.result.added.map((d) => [d.name, d.dev, d.status])).toEqual([
      ['requests', false, 'allowed'],
      ['mystery', false, 'unknown'],
      ['pyqt5', true, 'denied'],
    ]);
    expect(all.findings.map((f) => f.severity)).toEqual(['warning', 'error']);

    const prodOnly = await analyzeDependencies(files, prInfo(), client, resolver, { ...config, devDependencies: false, unknownSeverity: 'info' });
    expect(prodOnly.result.added.map((d) => d.name)).toEqual(['requests', 'mystery']);
    expect(prodOnly.findings.map((f) => f.severity)).toEqual(['info']);
  });

  it('ignores manifests in node_modules, removed manifests and unchanged dependencies', async () => {
    const files = [file('node_modules/x/package.json'), file('old/package.json', { status: 'removed' }), file('package.json')];
    const pkg = JSON.stringify({ dependencies: { express: '^4.0.0' }, version: '2.0.0' });
    const client = new FakeGitHub({ files, contents: { [BASE_SHA]: { 'package.json': pkg }, [HEAD_SHA]: { 'package.json': pkg } } });
    const { result } = await analyzeDependencies(files, prInfo(), client, createRegistryResolver(fakeFetch()), config);
    expect(result.added).toEqual([]);
  });
});
