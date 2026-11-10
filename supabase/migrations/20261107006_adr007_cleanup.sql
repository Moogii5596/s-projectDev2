-- ADR-007: v0.2.3 нэг хувилбарын шилжилтийн хуулбар, alias болон хуучин роль enum-ийг цэвэрлэх.
DROP TABLE IF EXISTS public.legacy_camp_user_permissions;
DROP TABLE IF EXISTS public.legacy_camp_user_roles;
DROP TABLE IF EXISTS public.legacy_camp_role_permissions;
DROP TABLE IF EXISTS public.legacy_camp_position_role_templates;
DROP TABLE IF EXISTS public.legacy_camp_roles;
DROP TABLE IF EXISTS public.legacy_camp_permissions;

DROP TABLE IF EXISTS public.core_permission_aliases;
DROP TYPE IF EXISTS public."CampRoleCode";
