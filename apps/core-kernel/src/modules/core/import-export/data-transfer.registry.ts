import { Injectable } from '@nestjs/common';
import { getModuleManifest } from '../modules/module-registry';

export interface DataTransferRegistration<T> {
  module: string;
  type: string;
  specType: string;
  handler: T;
}

@Injectable()
export class DataTransferRegistry {
  private readonly imports = new Map<string, DataTransferRegistration<unknown>>();
  private readonly exports = new Map<string, DataTransferRegistration<unknown>>();

  registerImport<T>(registration: DataTransferRegistration<T>): void {
    this.register(this.imports, 'importTypes', registration);
  }

  registerExport<T>(registration: DataTransferRegistration<T>): void {
    this.register(this.exports, 'exportTypes', registration);
  }

  getImport<T>(type: string): T | undefined {
    return this.imports.get(type)?.handler as T | undefined;
  }

  getExport<T>(type: string): T | undefined {
    return this.exports.get(type)?.handler as T | undefined;
  }

  importTypes(): string[] {
    return [...this.imports.keys()].sort();
  }

  private register<T>(
    target: Map<string, DataTransferRegistration<unknown>>,
    capability: 'importTypes' | 'exportTypes',
    registration: DataTransferRegistration<T>,
  ): void {
    const manifest = getModuleManifest(registration.module);
    if (!manifest) throw new Error(`Data transfer module manifest-д байхгүй: ${registration.module}`);
    const declared = manifest[capability] ?? [];
    if (declared.filter((type) => type === registration.type).length !== 1) {
      throw new Error(`${capability} manifest-д яг нэг удаа бүртгэгдсэн байх ёстой: ${registration.type}`);
    }
    if (registration.specType !== registration.type) {
      throw new Error(`Data transfer spec төрөл зөрүүтэй: ${registration.type}`);
    }
    const existing = target.get(registration.type);
    if (existing && existing.module !== registration.module) {
      throw new Error(`Data transfer төрөл давхардсан: ${registration.type}`);
    }
    if (existing) throw new Error(`Data transfer төрөл дахин бүртгэгдсэн: ${registration.type}`);
    target.set(registration.type, registration);
  }
}
