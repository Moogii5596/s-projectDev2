import { describe, it, expect } from 'vitest';
import { parseDeploymentConfig, TENANT_SLUG_PATTERN } from './deployment-mode';

// ADR-001: DEPLOYMENT_MODE=shared|dedicated тайлбарлалт
describe('parseDeploymentConfig()', () => {
  describe('shared (default)', () => {
    it('юу ч тохируулаагүй → shared', () => {
      expect(parseDeploymentConfig({})).toEqual({ mode: 'shared', dedicatedTenantSlug: null });
    });

    it('хоосон string (`DEPLOYMENT_MODE=`) → shared', () => {
      expect(parseDeploymentConfig({ DEPLOYMENT_MODE: '  ' })).toEqual({
        mode: 'shared',
        dedicatedTenantSlug: null,
      });
    });

    it('shared үед DEDICATED_TENANT_SLUG тохируулсан ч үл тооно (null)', () => {
      expect(
        parseDeploymentConfig({ DEPLOYMENT_MODE: 'shared', DEDICATED_TENANT_SLUG: 'acme' }),
      ).toEqual({ mode: 'shared', dedicatedTenantSlug: null });
    });
  });

  describe('dedicated', () => {
    it('зөв slug → dedicated + slug', () => {
      expect(
        parseDeploymentConfig({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: 'acme-mining' }),
      ).toEqual({ mode: 'dedicated', dedicatedTenantSlug: 'acme-mining' });
    });

    it('slug-ийн хоосон зайг тайрна', () => {
      expect(
        parseDeploymentConfig({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: ' acme ' })
          .dedicatedTenantSlug,
      ).toBe('acme');
    });

    it('slug байхгүй → алдаа', () => {
      expect(() => parseDeploymentConfig({ DEPLOYMENT_MODE: 'dedicated' })).toThrow(
        /DEDICATED_TENANT_SLUG/,
      );
    });

    it('slug хоосон string → алдаа', () => {
      expect(() =>
        parseDeploymentConfig({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: '' }),
      ).toThrow(/DEDICATED_TENANT_SLUG/);
    });

    it.each(['Acme', 'acme_mining', '-acme', 'acme-', 'acme.mn', 'а-кирилл'])(
      'буруу хэлбэрийн slug "%s" → алдаа',
      (slug) => {
        expect(() =>
          parseDeploymentConfig({ DEPLOYMENT_MODE: 'dedicated', DEDICATED_TENANT_SLUG: slug }),
        ).toThrow(/буруу хэлбэр/);
      },
    );
  });

  describe('буруу mode', () => {
    it.each(['vpc', 'Dedicated', 'SHARED'])('"%s" → алдаа', (mode) => {
      expect(() => parseDeploymentConfig({ DEPLOYMENT_MODE: mode })).toThrow(/DEPLOYMENT_MODE/);
    });
  });

  it('seed-ийн test-tenant slug хэлбэрт таарна', () => {
    expect(TENANT_SLUG_PATTERN.test('test-tenant')).toBe(true);
  });
});
