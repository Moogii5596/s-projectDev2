import { Module } from '@nestjs/common';
import { RouteIngressService }    from './route-ingress.service';
import { RouteIngressController } from './route-ingress.controller';

@Module({
  controllers: [RouteIngressController],
  providers:   [RouteIngressService],
  exports:     [RouteIngressService],
})
export class RouteIngressModule {}
