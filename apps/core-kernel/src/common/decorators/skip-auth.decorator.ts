import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Route-г TenantAuthGuard-с алгасуулахад ашиглана */
export const SkipAuth = () => SetMetadata(IS_PUBLIC_KEY, true);
