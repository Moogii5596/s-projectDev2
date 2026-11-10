import { Injectable } from '@nestjs/common';
import { getModuleManifest } from '../modules/module-registry';
import type { DataImportHandler } from './data-transfer.types';

export interface DataTransferRegistration {
  module: string;
  type: string;
  specType: string;
  handler: DataImportHandler;
}

@Injectable()
export class DataTransferRegistry {
  private readonly imports = new Map<string, DataTransferRegistration>();
  private readonly exports = new Map<string, DataTransferRegistration>();

  registerImport(registration: DataTransferRegistration): void {
    this.register(this.imports, 'importTypes', registration);
  }

  registerExport(registration: DataTransferRegistration): void {
    this.register(this.exports, 'exportTypes', registration);
  }

  registerHandler(module: string, handler: DataImportHandler): void {
    const type = handler.spec.type;
    const manifest = getModuleManifest(module);
    if (!manifest) throw new Error(`Data transfer module manifest-д байхгүй: ${module}`);
    const capabilities = [
      ...(manifest.importTypes?.includes(type) ? ['import'] : []),
      ...(manifest.exportTypes?.includes(type) ? ['export'] : []),
    ];
    if (capabilities.length === 0) throw new Error(`Data transfer төрөл manifest-д бүртгэгдээгүй: ${type}`);
    const registration = { module, type, specType: handler.spec.type, handler };
    if (capabilities.includes('import')) this.registerImport(registration);
    if (capabilities.includes('export')) this.registerExport(registration);
  }

  getImport(type: string): DataImportHandler | undefined {
    return this.imports.get(type)?.handler;
  }

  getExport(type: string): DataImportHandler | undefined {
    return this.exports.get(type)?.handler;
  }

  importTypes(): string[] {
    return [...this.imports.keys()].sort();
  }

  private register(
    target: Map<string, DataTransferRegistration>,
    capability: 'importTypes' | 'exportTypes',
    registration: DataTransferRegistration,
  ): void {
    const manifest = getModuleManifest(registration.module);
    if (!manifest) throw new Error(`Data transfer module manifest-д байхгүй: ${registration.module}`);
    const declared = manifest[capability] ?? [];
    if (declared.filter((type) => type === registration.type).length !== 1) {
      throw new Error(`${capability} manifest-д яг нэг удаа бүртгэгдсэн байх ёстой: ${registration.type}`);
    }
    if (registration.type !== registration.handler.spec.type || registration.specType !== registration.handler.spec.type) {
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
