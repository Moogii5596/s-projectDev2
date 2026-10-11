import { SetMetadata } from '@nestjs/common';

/**
 * v0.2.2 D-06 — `core_users.must_change_password = true` хэрэглэгчид ч нээлттэй route (`GET auth/me`, `POST auth/change-password`).
 * Бусад бүх route → 403 `auth.password_change_required`.
 */
export const ALLOW_PASSWORD_CHANGE_REQUIRED_KEY = 'allowPasswordChangeRequired';
export const AllowPasswordChangeRequired = () => SetMetadata(ALLOW_PASSWORD_CHANGE_REQUIRED_KEY, true);
