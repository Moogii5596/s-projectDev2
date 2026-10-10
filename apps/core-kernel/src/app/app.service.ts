import { Injectable } from '@nestjs/common';
import { APP_VERSION } from '../config/app-version';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'core-kernel',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    };
  }
}
