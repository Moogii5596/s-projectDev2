import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ISO_DATE, toBool } from '../common/camp-dto.util';

const DATE_MSG = (f: string) => ({ message: `${f} YYYY-MM-DD` });

export class DateQueryDto {
  @IsString() @Matches(ISO_DATE, DATE_MSG('date'))
  date!: string;
}

/** v0.2.1 (C-14): ирцийн жагсаалт — тухайн өдрийн тооцоолсон ээлжээр шүүх */
const STAY_SHIFT_GROUPS = ['DAY', 'NIGHT', 'UNKNOWN', 'MOVEMENT'] as const;

export type StayShiftGroup = (typeof STAY_SHIFT_GROUPS)[number];

export class StaysQueryDto extends DateQueryDto {
  @IsOptional() @IsIn(STAY_SHIFT_GROUPS, { message: `shift: ${STAY_SHIFT_GROUPS.join(' | ')}` })
  shift?: StayShiftGroup;
}

export class CreateRoomAllocationDto {
  @IsUUID('all', { message: 'employeeId UUID байх ёстой' })
  employeeId!: string;

  @IsUUID('all', { message: 'roomId UUID байх ёстой' })
  roomId!: string;

  @IsString() @Matches(ISO_DATE, DATE_MSG('startDate'))
  startDate!: string;

  /** true = одоогийн өрөөг startDate-ийн өмнөх өдрөөр дуусгаж шилжүүлнэ */
  @IsOptional() @Transform(toBool) @IsBoolean()
  replaceCurrent?: boolean;
}

export class EndRoomAllocationDto {
  /** Сүүлийн хонох өдөр (хамруулна) */
  @IsString() @Matches(ISO_DATE, DATE_MSG('endDate'))
  endDate!: string;
}

export class QueryAllocationsDto {
  @IsOptional() @IsUUID() roomId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() @Matches(ISO_DATE, DATE_MSG('date')) date?: string;
}
