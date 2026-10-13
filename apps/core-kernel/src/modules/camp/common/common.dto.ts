import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { toBool, trim } from './camp-dto.util';

export const CODE = /^[A-Za-z0-9._-]+$/;

export const CODE_MSG = 'code зөвхөн латин үсэг, тоо, . _ - агуулна';

/** v0.2.2 H1 — Кемп, HR, Core хуваалцдаг DTO (нэрийн каталог, идэвхтэй шүүлт, код) */
export class QueryActiveOnlyDto {
  @IsOptional() @Transform(toBool) @IsBoolean()
  activeOnly?: boolean;
}

/** v0.2.1 (C-01, Q2) — албан тушаал / (C-12, Q4) — байрны төрөл: байгууллагын каталог (нэр л) */
export class CreateCatalogItemDto {
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'name шаардлагатай' }) @MaxLength(100)
  name!: string;
}

export class UpdateCatalogItemDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(100)
  name?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}

export class QueryCatalogDto {
  @IsOptional() @Transform(toBool) @IsBoolean() activeOnly?: boolean;
}
