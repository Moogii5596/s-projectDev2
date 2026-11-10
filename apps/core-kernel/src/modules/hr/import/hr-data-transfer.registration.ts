import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataTransferRegistry } from '../../core/import-export/data-transfer.registry';
import { departmentsHandler } from './departments.handler';
import { employeesHandler } from './employees.handler';
import { formerEmployeesHandler } from './former-employees.handler';
import { positionsHandler } from './positions.handler';

@Injectable()
export class HrDataTransferRegistration implements OnModuleInit {
  constructor(private readonly transfers: DataTransferRegistry) {}

  onModuleInit(): void {
    for (const handler of [employeesHandler, formerEmployeesHandler, departmentsHandler, positionsHandler]) {
      this.transfers.registerHandler('hr', handler);
    }
  }
}
