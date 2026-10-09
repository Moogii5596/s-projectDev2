import type { FastifyRequest } from 'fastify';
import type { RequestUser } from '@s-project/shared-types';

/** TenantAuthGuard-ийн тавьсан хэрэглэгч. `id` = Supabase authId (RULE-13: core_users.id биш) */
export const reqUser = (req: FastifyRequest): RequestUser => (req as unknown as { user: RequestUser }).user;
