import { CampMaintenanceStatus } from '@prisma/client';
import { t } from '../../../common/i18n/translate';

/** Гарагийн нэр хүсэлтийн хэлээр (0 = Ням … 6 = Бямба, JS getUTCDay) */
export const weekdayText = (dow: number): string => t(`enum.weekday.${dow}`);

/** Засварын төлөвийн нэр хүсэлтийн хэлээр (алдааны мессежид) */
export const statusText = (s: CampMaintenanceStatus): string => t(`enum.maintenance_status.${s}`);
