import { Injectable } from '@nestjs/common';
import { CampAuditAction } from '@prisma/client';
import { badRequest, notFound } from '../../../common/i18n/app-error';
import { PrismaTenantClientService } from '../../../db/prisma-tenant-client.service';
import { CampAccessService } from '../../camp/common/camp-access.service';
import { CampAuditService } from '../../camp/common/camp-audit.service';
import { inTenantTx } from '../../camp/common/camp-tx';
import { CreateCalendarHolidayDto, CreateHolidayCalendarDto, UpdateHolidayCalendarDto } from './core-calendar.dto';

const CALENDAR_SELECT = {
  id: true,
  code: true,
  name: true,
  countryCode: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;
const HOLIDAY_SELECT = {
  id: true,
  calendarId: true,
  name: true,
  recurrence: true,
  holidayDate: true,
  month: true,
  day: true,
  isActive: true,
} as const;

@Injectable()
export class CoreCalendarService {
  constructor(
    private readonly prisma: PrismaTenantClientService,
    private readonly access: CampAccessService,
    private readonly audit: CampAuditService,
  ) {}

  async list(tenantId: string, authId: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      await this.access.requireTenantAdmin(tx, tenantId, authId);
      return tx.coreHolidayCalendar.findMany({
        where: { tenantId },
        select: {
          ...CALENDAR_SELECT,
          holidays: {
            where: { isActive: true },
            select: HOLIDAY_SELECT,
            orderBy: [{ holidayDate: 'asc' }, { month: 'asc' }, { day: 'asc' }],
          },
        },
        orderBy: { code: 'asc' },
      });
    });
  }

  async create(tenantId: string, authId: string, dto: CreateHolidayCalendarDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const calendar = await tx.coreHolidayCalendar.create({
        data: { tenantId, code: dto.code, name: dto.name.trim(), countryCode: dto.countryCode ?? null },
        select: CALENDAR_SELECT,
      });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'holiday_calendar', entityId: calendar.id,
        action: CampAuditAction.CREATE, actorUserId: actorId,
        fields: ['code', 'name', 'countryCode'],
        after: { code: calendar.code, name: calendar.name, countryCode: calendar.countryCode },
      });
      return calendar;
    });
  }

  async update(tenantId: string, authId: string, id: string, dto: UpdateHolidayCalendarDto) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const before = await tx.coreHolidayCalendar.findFirst({ where: { id, tenantId }, select: CALENDAR_SELECT });
      if (!before) throw notFound('core.calendar.not_found');
      const data = {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      };
      if (dto.name !== undefined && !dto.name.trim()) throw badRequest('core.calendar.name_required');
      const updated = await tx.coreHolidayCalendar.update({ where: { id }, data, select: CALENDAR_SELECT });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'holiday_calendar', entityId: id,
        action: CampAuditAction.UPDATE, actorUserId: actorId,
        fields: Object.keys(data),
        before: { name: before.name, countryCode: before.countryCode, isActive: before.isActive },
        after: { name: updated.name, countryCode: updated.countryCode, isActive: updated.isActive },
      });
      return updated;
    });
  }

  async addHoliday(tenantId: string, authId: string, calendarId: string, dto: CreateCalendarHolidayDto) {
    const date = this.validateHoliday(dto);
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const calendar = await tx.coreHolidayCalendar.findFirst({ where: { id: calendarId, tenantId }, select: { id: true } });
      if (!calendar) throw notFound('core.calendar.not_found');
      const holiday = await tx.coreCalendarHoliday.create({
        data: { tenantId, calendarId, name: dto.name.trim(), recurrence: dto.recurrence, ...date },
        select: HOLIDAY_SELECT,
      });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'calendar_holiday', entityId: holiday.id,
        action: CampAuditAction.CREATE, actorUserId: actorId,
        fields: ['calendarId', 'name', 'recurrence', 'holidayDate', 'month', 'day'],
        after: { ...holiday, holidayDate: holiday.holidayDate?.toISOString().slice(0, 10) ?? null },
      });
      return holiday;
    });
  }

  async removeHoliday(tenantId: string, authId: string, calendarId: string, id: string) {
    return inTenantTx(this.prisma, tenantId, async (tx) => {
      const actorId = await this.access.requireTenantAdmin(tx, tenantId, authId);
      const holiday = await tx.coreCalendarHoliday.findFirst({
        where: { id, calendarId, tenantId },
        select: HOLIDAY_SELECT,
      });
      if (!holiday) throw notFound('core.calendar.holiday_not_found');
      await tx.coreCalendarHoliday.update({ where: { id }, data: { isActive: false } });
      await this.audit.record(tx, {
        tenantId, campId: null, entityType: 'calendar_holiday', entityId: id,
        action: CampAuditAction.UPDATE, actorUserId: actorId,
        fields: ['isActive'],
        before: { isActive: holiday.isActive },
        after: { isActive: false },
      });
    });
  }

  private validateHoliday(dto: CreateCalendarHolidayDto) {
    if (!dto.name.trim()) throw badRequest('core.calendar.holiday_name_required');
    if (dto.recurrence === 'ONCE') {
      if (!dto.holidayDate || dto.month !== undefined || dto.day !== undefined || !isValidDate(dto.holidayDate)) {
        throw badRequest('core.calendar.invalid_holiday');
      }
      return { holidayDate: new Date(`${dto.holidayDate}T00:00:00.000Z`), month: null, day: null };
    }
    if (dto.holidayDate !== undefined || dto.month === undefined || dto.day === undefined) {
      throw badRequest('core.calendar.invalid_holiday');
    }
    const date = new Date(Date.UTC(2000, dto.month - 1, dto.day));
    if (date.getUTCMonth() !== dto.month - 1 || date.getUTCDate() !== dto.day) {
      throw badRequest('core.calendar.invalid_holiday');
    }
    return { holidayDate: null, month: dto.month, day: dto.day };
  }
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
