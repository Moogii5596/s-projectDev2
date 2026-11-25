import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataTransferRegistry } from '../../core/import-export/data-transfer.registry';
import { SiteDataTransferScope } from '../../camp/common/site-data-transfer.scope';
import { departmentsHandler } from './departments.handler';
import { employeesHandler } from './employees.handler';
import { formerEmployeesHandler } from './former-employees.handler';
import { positionsHandler } from './positions.handler';

@Injectable()
export class HrDataTransferRegistration implements OnModuleInit {
  constructor(
    private readonly transfers: DataTransferRegistry,
    private readonly scope: SiteDataTransferScope,
  ) {}

  onModuleInit(): void {
    for (const handler of [employeesHandler, formerEmployeesHandler, departmentsHandler, positionsHandler]) {
      this.transfers.registerHandler('hr', handler, this.scope);
    }
  }
}
