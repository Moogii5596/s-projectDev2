import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { DynamicIngressRouterService, ModuleManifest } from './dynamic-ingress-router.service';

// Codebase pattern: Test.createTestingModule биш шууд new Service(mock) — RULE-08 шаардагдахгүй
const makeManifest = (overrides: Partial<ModuleManifest['api_routes']> = {}): ModuleManifest => ({
  module_id:    'test-module',
  version:      '1.0.0',
  dependencies: [],
  api_routes: {
    base_path:   '/api/v1/test',
    target_port: 3001,
    ...overrides,
  },
  permissions: [],
});

describe('DynamicIngressRouterService', () => {
  let service: DynamicIngressRouterService;
  let mockEmit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockEmit = vi.fn();
    service = new DynamicIngressRouterService({ emit: mockEmit } as never);
  });

  describe('registerModule', () => {
    it('route бүртгэж ACTIVE болгоно', () => {
      service.registerModule(makeManifest());
      const route = service.resolveRoute('/api/v1/test/items');
      expect(route).toBeDefined();
      expect(route!.status).toBe('ACTIVE');
      expect(route!.moduleId).toBe('test-module');
    });

    it('target_host байвал тэрийг ашиглана', () => {
      service.registerModule(makeManifest({ target_host: 'http://custom-host:3001' }));
      expect(service.resolveRoute('/api/v1/test')!.target).toBe('http://custom-host:3001');
    });

    it('target_host байхгүй бол svc-<id>:<port> форматаар үүсгэнэ', () => {
      service.registerModule(makeManifest());
      expect(service.resolveRoute('/api/v1/test')!.target).toBe('http://svc-test-module:3001');
    });

    it('ACTIVE route давхардвал ConflictException шидэнэ', () => {
      service.registerModule(makeManifest());
      expect(() => service.registerModule(makeManifest())).toThrow(ConflictException);
    });

    it('OFFLINE route дээр дахин бүртгэх боломжтой', () => {
      service.registerModule(makeManifest());
      service.setStatus('/api/v1/test', 'OFFLINE');
      expect(() => service.registerModule(makeManifest())).not.toThrow();
    });

    it('gateway.route.updated event гаргана', () => {
      service.registerModule(makeManifest());
      expect(mockEmit).toHaveBeenCalledWith('gateway.route.updated', expect.any(Object));
    });
  });

  describe('resolveRoute', () => {
    it('prefix тохирвол route буцаана', () => {
      service.registerModule(makeManifest());
      expect(service.resolveRoute('/api/v1/test/123')).toBeDefined();
    });

    it('тохирохгүй path → undefined', () => {
      service.registerModule(makeManifest());
      expect(service.resolveRoute('/api/v2/other')).toBeUndefined();
    });
  });

  describe('setStatus', () => {
    it('DRAINING болгоход event гаргана', () => {
      service.registerModule(makeManifest());
      service.setStatus('/api/v1/test', 'DRAINING');
      expect(service.resolveRoute('/api/v1/test')!.status).toBe('DRAINING');
      expect(mockEmit).toHaveBeenCalledWith('gateway.route.draining', expect.any(Object));
    });

    it('байхгүй basePath → юу ч хийхгүй', () => {
      expect(() => service.setStatus('/nonexistent', 'OFFLINE')).not.toThrow();
    });
  });
});
