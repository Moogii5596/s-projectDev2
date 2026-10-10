/**
 * Phase 4.8.5 — Integration тестийн DB холболтууд (2026-10-10)
 *
 * Апп `DATABASE_URL`-ээр (зорилго: app_user, RLS идэвхтэй) ажиллах үед тестийн бэлтгэл/цэвэрлэгээ
 * (tenant үүсгэх, өөр tenant-ийн мөр оруулах, устгах) нь RLS-ийг алгасах ёстой →
 * `SYSTEM_DATABASE_URL` (postgres, BYPASSRLS), тохируулаагүй бол `DATABASE_URL`.
 */
const FALLBACK = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Setup/teardown — RLS bypass */
export const ADMIN_DB_URL = process.env.SYSTEM_DATABASE_URL?.trim() || process.env.DATABASE_URL || FALLBACK;

/** RLS шалгалт — app_user (NOBYPASSRLS), ADMIN_DB_URL-ийн host/port/db-тэй */
export const APP_USER_DB_URL = ADMIN_DB_URL.replace(/postgresql:\/\/[^@]+@/, 'postgresql://app_user:change_in_production@');
