import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { reqUser } from '../../camp/common/camp-request';
import { NotificationService } from './notification.service';
import { ListNotificationsDto, UpdateNotificationPrefsDto } from './notifications.dto';

/** v0.2.4 Блок 7 (NTF-01) — өөрийн мэдэгдэл (бүх нэвтэрсэн хэрэглэгч; бусдын мэдэгдэлд хандахгүй) */
@Controller('core/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  list(@Req() req: FastifyRequest, @Query() q: ListNotificationsDto) {
    const user = reqUser(req);
    return this.notifications.list(user.tenantId, user.id, q);
  }

  @Get('unread-count')
  unreadCount(@Req() req: FastifyRequest) {
    const user = reqUser(req);
    return this.notifications.unreadCount(user.tenantId, user.id);
  }

  @Post('read-all')
  readAll(@Req() req: FastifyRequest) {
    const user = reqUser(req);
    return this.notifications.markAllRead(user.tenantId, user.id);
  }

  @Post(':id/read')
  read(@Req() req: FastifyRequest, @Param('id', new ParseUUIDPipe()) id: string) {
    const user = reqUser(req);
    return this.notifications.markRead(user.tenantId, user.id, id);
  }

  @Get('preferences')
  preferences(@Req() req: FastifyRequest) {
    const user = reqUser(req);
    return this.notifications.preferences(user.tenantId, user.id);
  }

  @Put('preferences')
  updatePreferences(@Req() req: FastifyRequest, @Body() dto: UpdateNotificationPrefsDto) {
    const user = reqUser(req);
    return this.notifications.updatePreferences(user.tenantId, user.id, dto.items);
  }
}
