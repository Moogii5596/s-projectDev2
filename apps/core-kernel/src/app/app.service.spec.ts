import { describe, it, expect } from 'vitest';
import { AppService } from './app.service';

describe('AppService', () => {
  const service = new AppService();

  describe('getHealth()', () => {
    it('status ок байх ёстой', () => {
      const result = service.getHealth();
      expect(result.status).toBe('ok');
    });

    it('service нэр core-kernel байх ёстой', () => {
      const result = service.getHealth();
      expect(result.service).toBe('core-kernel');
    });

    it('timestamp ISO формат байх ёстой', () => {
      const result = service.getHealth();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });

    it('uptime тоо байх ёстой', () => {
      const result = service.getHealth();
      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
