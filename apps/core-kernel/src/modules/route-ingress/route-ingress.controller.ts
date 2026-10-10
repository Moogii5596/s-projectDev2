import {
  Controller, Post, Delete,
  Param, Body, Req,
  HttpCode, HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { RouteIngressService } from './route-ingress.service';
import { RegisterRouteDto } from './dto/register-route.dto';

interface AuthRequest {
  user: { tenantId: string };
}

@Controller('routes')
export class RouteIngressController {
  constructor(private readonly svc: RouteIngressService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterRouteDto,
    @Req() req: AuthRequest,
  ): Promise<{ ok: boolean }> {
    await this.svc.registerRoute(dto, req.user.tenantId);
    return { ok: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthRequest,
  ): Promise<{ ok: boolean }> {
    await this.svc.deactivateRoute(id, req.user.tenantId);
    return { ok: true };
  }
}
