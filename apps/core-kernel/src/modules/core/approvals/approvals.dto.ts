import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches,
  Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

export class DecideApprovalDto {
  @IsIn(['APPROVE', 'REJECT']) action!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ApprovalStepDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsString() @Matches(/^[a-z]+\.[a-z_]+\.[a-z_]+$/) permission!: string;
  @IsInt() @Min(1) @Max(20) quorum!: number;
  @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @IsOptional() @IsNumber() @Min(0) maxAmount?: number;
}

export class SaveApprovalDefinitionDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,59}$/) entityType!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => ApprovalStepDto) steps!: ApprovalStepDto[];
  @IsInt() @Min(0) @Max(720) slaHours!: number;
  @IsBoolean() escalationEnabled!: boolean;
  @IsBoolean() delegationEnabled!: boolean;
}

export class CreateDelegationDto {
  @IsUUID() delegateId!: string;
  @IsOptional() @IsISO8601() validFrom?: string;
  @IsISO8601() validUntil!: string;
  @IsOptional() @IsString() @MaxLength(300) reason?: string;
}

export class DefinitionsQueryDto {
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{1,59}$/) entityType!: string;
}
