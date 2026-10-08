import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CursorPaginationDto } from '../../../common/dto/cursor-pagination.dto';

const MR_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
  'PROVISIONALLY_APPROVED',
] as const;

export class QueryMrDto extends CursorPaginationDto {
  @IsOptional()
  @IsEnum(MR_STATUSES, { message: 'status буруу утгатай байна' })
  status?: (typeof MR_STATUSES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;
}
