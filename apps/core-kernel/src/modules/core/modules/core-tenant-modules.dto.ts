import { IsBoolean } from 'class-validator';

export class UpdateTenantModuleDto {
  @IsBoolean()
  active!: boolean;
}
