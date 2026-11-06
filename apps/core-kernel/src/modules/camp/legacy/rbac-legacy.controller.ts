import { Controller, UseInterceptors } from '@nestjs/common';
import { DeprecatedRouteInterceptor } from '../common/deprecated-route.interceptor';
import { CoreRbacController } from '../rbac/core-rbac.controller';

/*
 * v0.2.3 Блок 3 (ADR-007 B3-1) — хуучин `/api/v1/camp/{permissions,me/permissions,users,roles,user-roles,...}` замууд
 * НЭГ хувилбарын турш (хуучин кэштэй хөтөч эвдрэхгүй). Логик хуулахгүй: `CoreRbacController`-ийг өвлөж зөвхөн замыг өөрчилнө;
 * хариунд `Deprecation: true`. v0.2.4-т устгана (ARC-05).
 */
@Controller('camp')
@UseInterceptors(DeprecatedRouteInterceptor)
export class CampRbacLegacyController extends CoreRbacController {}
