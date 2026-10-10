import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './app-version';

describe('APP_VERSION', () => {
  it('core-kernel package.json-ийн version-тэй ижил (release-д хоёуланг нь солино)', () => {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('root package.json-той ижил', () => {
    const root = JSON.parse(readFileSync(resolve(__dirname, '../../../../package.json'), 'utf8')) as { version: string };
    expect(APP_VERSION).toBe(root.version);
  });
});
