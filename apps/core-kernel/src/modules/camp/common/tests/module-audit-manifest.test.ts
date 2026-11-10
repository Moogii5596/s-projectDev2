import { describe, expect, it } from 'vitest';
import { TENANT_MODULES, type ModuleManifest } from '../../../core/modules/module-registry';
import { CAMP_AUDIT_ENTITIES } from '../camp-audit.service';

describe('Camp audit manifest coverage', () => {
  it('assigns every audit entity to exactly one module', () => {
    const manifests: readonly ModuleManifest[] = TENANT_MODULES;
    const declared = manifests.flatMap((module) => module.auditEntityTypes ?? []);
    expect([...declared].sort()).toEqual([...CAMP_AUDIT_ENTITIES].sort());
    expect(new Set(declared).size).toBe(declared.length);
  });
});
