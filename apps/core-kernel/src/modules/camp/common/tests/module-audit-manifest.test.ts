import { describe, expect, it } from 'vitest';
import { TENANT_MODULES, type ModuleManifest } from '../../../core/modules/module-registry';
import { AUDIT_ENTITIES } from '../../../core/platform/audit.service';

describe('Camp audit manifest coverage', () => {
  it('assigns every audit entity to exactly one module', () => {
    const manifests: readonly ModuleManifest[] = TENANT_MODULES;
    const declared = manifests.flatMap((module) => module.auditEntityTypes ?? []);
    expect([...declared].sort()).toEqual([...AUDIT_ENTITIES].sort());
    expect(new Set(declared).size).toBe(declared.length);
  });
});
