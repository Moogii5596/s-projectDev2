-- ============================================================
-- v0.2.4 D-1 — Debug module access permission
-- OWNER is granted access by the runtime role check; other users
-- need an explicit tenant-wide core.debug.view permission.
-- ============================================================

INSERT INTO core_permissions (code, name, sort_order, module, available_in)
VALUES ('core.debug.view', 'Debug цэс ба туршилтын модулиуд харах', 900, 'core', 'v1')
ON CONFLICT (code) DO NOTHING;
