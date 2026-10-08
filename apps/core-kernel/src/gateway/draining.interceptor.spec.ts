import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ExecutionContext, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError, firstValueFrom, lastValueFrom } from 'rxjs';
import { DrainingInterceptor } from './draining.interceptor';
import type { DynamicIngressRouterService, RouteEntry } from './dynamic-ingress-router.service';

// Codebase pattern: Test.createTestingModule биш шууд new Class(mock)
const makeContext = (method: string, path: string): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest:  () => ({ method, path }),
      getResponse: () => ({ setHeader: vi.fn() }),
    }),
  }) as unknown as ExecutionContext;

const makeContextWithMockRes = (method: string, path: string) => {
  const mockRes = { setHeader: vi.fn() };
  const ctx = {
    switchToHttp: () => ({
      getRequest:  () => ({ method, path }),
      getResponse: () => mockRes,
    }),
  } as unknown as ExecutionContext;
  return { ctx, mockRes };
};

const makeRoute = (status: RouteEntry['status']): RouteEntry => ({
  target:       'http://svc-test:3001',
  status,
  moduleId:     'test-module',
  registeredAt: new Date(),
});

describe('DrainingInterceptor', () => {
  let interceptor: DrainingInterceptor;
  let mockRouter: {
    resolveRoute: Mock<any[], any>;
    setStatus:    Mock<any[], any>;
    getRoutes:    Mock<any[], any>;
  };

  beforeEach(() => {
    mockRouter = {
      resolveRoute: vi.fn(),
      setStatus:    vi.fn(),
      getRoutes:    vi.fn(() => new Map([['/api/v1/test', makeRoute('ACTIVE')]])),
    };
    interceptor = new DrainingInterceptor(mockRouter as unknown as DynamicIngressRouterService);
  });

  it('route олдохгүй → pass-through', async () => {
    mockRouter.resolveRoute.mockReturnValue(undefined);
    const result = await firstValueFrom(
      interceptor.intercept(makeContext('POST', '/unknown'), { handle: () => of('ok') }),
    );
    expect(result).toBe('ok');
  });

  it('ACTIVE + GET → pass-through', async () => {
    mockRouter.resolveRoute.mockReturnValue(makeRoute('ACTIVE'));
    const result = await firstValueFrom(
      interceptor.intercept(makeContext('GET', '/api/v1/test'), { handle: () => of('data') }),
    );
    expect(result).toBe('data');
  });

  it('ACTIVE + POST → pass-through', async () => {
    mockRouter.resolveRoute.mockReturnValue(makeRoute('ACTIVE'));
    const result = await firstValueFrom(
      interceptor.intercept(makeContext('POST', '/api/v1/test'), { handle: () => of({ id: 1 }) }),
    );
    expect(result).toEqual({ id: 1 });
  });

  it('DRAINING + GET → pass-through (readonly зөвшөөрнө)', async () => {
    mockRouter.resolveRoute.mockReturnValue(makeRoute('DRAINING'));
    const result = await firstValueFrom(
      interceptor.intercept(makeContext('GET', '/api/v1/test'), { handle: () => of('list') }),
    );
    expect(result).toBe('list');
  });

  it('DRAINING + POST → 503 + Retry-After header', () => {
    mockRouter.resolveRoute.mockReturnValue(makeRoute('DRAINING'));
    const { ctx, mockRes } = makeContextWithMockRes('POST', '/api/v1/test');
    expect(() => interceptor.intercept(ctx, { handle: () => of('ok') }))
      .toThrow(ServiceUnavailableException);
    expect(mockRes.setHeader).toHaveBeenCalledWith('Retry-After', '15');
  });

  it('DRAINING + PATCH → 503', () => {
    mockRouter.resolveRoute.mockReturnValue(makeRoute('DRAINING'));
    expect(() => interceptor.intercept(makeContext('PATCH', '/api/v1/test'), { handle: () => of('ok') }))
      .toThrow(ServiceUnavailableException);
  });

  it('DRAINING + DELETE → 503', () => {
    mockRouter.resolveRoute.mockReturnValue(makeRoute('DRAINING'));
    expect(() => interceptor.intercept(makeContext('DELETE', '/api/v1/test/1'), { handle: () => of('ok') }))
      .toThrow(ServiceUnavailableException);
  });

  it('DRAINING + complete → inflight=0 бол OFFLINE болгоно', async () => {
    const route = makeRoute('DRAINING');
    mockRouter.resolveRoute.mockReturnValue(route);
    mockRouter.getRoutes.mockReturnValue(new Map([['/api/v1/test', route]]));

    await lastValueFrom(
      interceptor.intercept(makeContext('GET', '/api/v1/test'), { handle: () => of('ok') }),
    );
    expect(mockRouter.setStatus).toHaveBeenCalledWith('/api/v1/test', 'OFFLINE');
  });

  it('request error бол inflight буурна + DRAINING→OFFLINE', async () => {
    const route = makeRoute('DRAINING');
    mockRouter.resolveRoute.mockReturnValue(route);
    mockRouter.getRoutes.mockReturnValue(new Map([['/api/v1/test', route]]));

    await expect(
      lastValueFrom(
        interceptor.intercept(makeContext('GET', '/api/v1/test'), {
          handle: () => throwError(() => new Error('upstream')),
        }),
      ),
    ).rejects.toThrow('upstream');

    expect(mockRouter.setStatus).toHaveBeenCalledWith('/api/v1/test', 'OFFLINE');
  });
});
