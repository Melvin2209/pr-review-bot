import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.js';
import { baseId, createRegistryResolver, evaluateLicense, npmLicense, parseExpression, pypiLicense } from '../src/licenses.js';
import { fakeFetch } from './helpers/fixtures.js';

const { allow, deny } = DEFAULT_CONFIG.dependencies;
const evaluate = (license: string | null) => evaluateLicense(license, allow, deny);

describe('baseId', () => {
  it.each([
    ['GPL-3.0-only', 'GPL-3.0'],
    ['GPL-3.0-or-later', 'GPL-3.0'],
    ['GPL-2.0+', 'GPL-2.0'],
    ['Apache License 2.0', 'Apache-2.0'],
    ['MIT License', 'MIT'],
  ])('%s → %s', (input, expected) => expect(baseId(input)).toBe(expected));
});

describe('parseExpression', () => {
  it('gives AND precedence over OR', () => {
    expect(parseExpression('MIT OR Apache-2.0 AND GPL-3.0')).toEqual({
      op: 'OR',
      left: { id: 'MIT' },
      right: { op: 'AND', left: { id: 'Apache-2.0' }, right: { id: 'GPL-3.0' } },
    });
  });

  it('drops WITH exceptions and handles parentheses', () => {
    expect(parseExpression('(Apache-2.0 WITH LLVM-exception)')).toEqual({ id: 'Apache-2.0' });
  });

  it('returns null for malformed expressions', () => {
    expect(parseExpression('(MIT OR')).toBeNull();
    expect(parseExpression('MIT OR OR ISC')).toBeNull();
  });
});

describe('evaluateLicense', () => {
  it.each([
    ['MIT', 'allowed'],
    ['Apache License 2.0', 'allowed'],
    ['GPL-3.0-or-later', 'denied'],
    ['AGPL-3.0-only', 'denied'],
    ['MPL-2.0', 'review'],
    ['(MIT OR GPL-3.0)', 'allowed'],
    ['MIT AND GPL-3.0', 'denied'],
    ['(MIT AND MPL-2.0)', 'review'],
    ['UNLICENSED', 'unknown'],
    ['SEE LICENSE IN LICENSE.md', 'unknown'],
    [null, 'unknown'],
  ] as const)('%s → %s', (license, status) => expect(evaluate(license)).toBe(status));

  it('lets the allow list use qualified ids', () => {
    expect(evaluateLicense('LGPL-3.0-only', ['LGPL-3.0-or-later'], [])).toBe('allowed');
  });
});

describe('registry metadata', () => {
  it('reads the different npm license shapes', () => {
    expect(npmLicense({ license: 'MIT' })).toBe('MIT');
    expect(npmLicense({ license: { type: 'ISC' } })).toBe('ISC');
    expect(npmLicense({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe('(MIT OR Apache-2.0)');
    expect(npmLicense({})).toBeNull();
  });

  it('reads PyPI license fields in priority order', () => {
    expect(pypiLicense({ info: { license_expression: 'BSD-3-Clause', license: 'whatever' } })).toBe('BSD-3-Clause');
    expect(pypiLicense({ info: { license: 'Apache-2.0' } })).toBe('Apache-2.0');
    expect(pypiLicense({ info: { license: 'Copyright (c) ...\nPermission is hereby granted', classifiers: ['License :: OSI Approved :: MIT License'] } })).toBe('MIT');
    expect(pypiLicense({ info: { classifiers: ['Programming Language :: Python'] } })).toBeNull();
  });
});

describe('createRegistryResolver', () => {
  it('queries the exact version, falling back to latest', async () => {
    const fetcher = fakeFetch();
    const resolver = createRegistryResolver(fetcher);
    expect(await resolver.resolve('npm', 'lodash', '4.17.21')).toBe('MIT');
    expect(await resolver.resolve('npm', '@scope/pkg', '1.0.0')).toBe('(MIT OR Apache-2.0)');
    expect(fetcher.calls).toContain('https://registry.npmjs.org/@scope%2Fpkg/1.0.0');
    expect(fetcher.calls).toContain('https://registry.npmjs.org/@scope%2Fpkg/latest');
  });

  it('resolves PyPI packages', async () => {
    const resolver = createRegistryResolver(fakeFetch());
    expect(await resolver.resolve('pypi', 'requests', '2.32.3')).toBe('Apache-2.0');
    expect(await resolver.resolve('pypi', 'numpy', '')).toBe('BSD-3-Clause');
    expect(await resolver.resolve('pypi', 'pyqt5', '')).toBe('GPL-3.0');
  });

  it('caches lookups and turns network errors into null', async () => {
    let calls = 0;
    const resolver = createRegistryResolver(async () => {
      calls++;
      throw new Error('ECONNRESET');
    });
    expect(await resolver.resolve('npm', 'x', '1.0.0')).toBeNull();
    expect(await resolver.resolve('npm', 'x', '1.0.0')).toBeNull();
    expect(calls).toBe(1);
  });
});
