import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { TenantModuleGuard } from './tenant-module.guard';
import { moduleForApiPath } from '../modules/core/modules/module-registry';

describe('TenantModuleGuard (SYS-02)', () => {
  it('API path бүрийг хамгийн нарийн тохирох модулиар ангилна', () => {
    expect(moduleForApiPath('/camp/camps')).toBe('camp');
    expect(moduleForApiPath('/hr/sites')).toBe('hr');
    expect(moduleForApiPath('/routes')).toBe('mfe');
    expect(moduleForApiPath('/core/feed/posts')).toBe('feed');
    expect(moduleForApiPath('/reports/approval-sla')).toBe('workflow');
    expect(moduleForApiPath('/reports/monthly')).toBe('reports');
    expect(moduleForApiPath('/core/settings')).toBeUndefined();
  });

  it('идэвхгүй модулийн endpoint-ийг 404 болгоно', async () => {
    const modules = { isActive: vi.fn().mockResolvedValue(false), canViewDebugModules: vi.fn() };
    const guard = new TenantModuleGuard(modules as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/inventory/items', user: { tenantId: 'tenant-id', id: 'auth-id' } }),
      }),
    } as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(modules.isActive).toHaveBeenCalledWith('tenant-id', 'inventory');
  });

  it('debug-only endpoint-ийг идэвхтэй байсан ч эрх эсвэл flag үгүй бол 404 болгоно', async () => {
    const modules = {
      isActive: vi.fn().mockResolvedValue(true),
      canViewDebugModules: vi.fn().mockResolvedValue(false),
    };
    const guard = new TenantModuleGuard(modules as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/inventory/items', user: { tenantId: 'tenant-id', id: 'auth-id' } }),
      }),
    } as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(NotFoundException);
    expect(modules.canViewDebugModules).toHaveBeenCalledWith('tenant-id', 'auth-id');
  });

  it('module-д хамаарахгүй замыг өөрчлөхгүй нэвтрүүлнэ', async () => {
    const modules = { isActive: vi.fn() };
    const guard = new TenantModuleGuard(modules as never);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ url: '/api/v1/core/settings', user: { tenantId: 'tenant-id' } }),
      }),
    } as ExecutionContext;
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(modules.isActive).not.toHaveBeenCalled();
  });
});
