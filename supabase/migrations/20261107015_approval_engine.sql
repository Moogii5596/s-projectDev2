-- ============================================================
-- v0.2.4 Блок 6 (WF-06, WF-01, WF-03) — батлах урсгалын нэгдсэн хөдөлгүүр (цөм)
--   * workflow_definitions: entity_type (модуль бүрийн объектын төрөл) + version — урсгалыг өөрчлөхөд шинэ хувилбар,
--     ажиллаж буй instance хуучин хувилбараараа (resolved_steps snapshot) дуусна.
--     entity_type NULL = v0.2.4-өөс өмнөх MR-ийн тодорхойлолт (хуучин өгөгдлийг өөрчлөхгүй; хөдөлгүүр MR-д fallback).
--   * workflow_instances: хүсэгч, ажлын байр (эрхийн хүрээ), гарчиг, линк, дүн, шийдсэн огноо — «Миний батлах» жагсаалт.
--   * workflow_step_logs.on_behalf_of — орлон гүйцэтгэгч (delegation) хэний өмнөөс шийдсэн.
--   * алхам = эрх (ADR-007) + хүрээ; хуучин role-той алхам MR-д уншигдсаар.
-- ============================================================

ALTER TABLE workflow_definitions
  ADD COLUMN entity_type TEXT CHECK (entity_type IS NULL OR entity_type ~ '^[A-Z][A-Z0-9_]{1,59}$'),
  ADD COLUMN version     INT  NOT NULL DEFAULT 1 CHECK (version >= 1),
  ADD COLUMN created_by  UUID;

-- Нэг объектын төрөлд нэг идэвхтэй хувилбар
CREATE UNIQUE INDEX uq_workflow_definitions_active_type
  ON workflow_definitions (tenant_id, entity_type) WHERE is_active AND entity_type IS NOT NULL;
CREATE UNIQUE INDEX uq_workflow_definitions_type_version
  ON workflow_definitions (tenant_id, entity_type, version) WHERE entity_type IS NOT NULL;

ALTER TABLE workflow_instances
  ADD COLUMN requester_id UUID,
  ADD COLUMN site_id      UUID,
  ADD COLUMN title        TEXT CHECK (title IS NULL OR char_length(title) <= 300),
  ADD COLUMN link         TEXT CHECK (link IS NULL OR link ~ '^/[^/]'),
  ADD COLUMN amount       NUMERIC(18, 2),
  ADD COLUMN decided_at   TIMESTAMPTZ;
CREATE INDEX idx_workflow_instances_pending ON workflow_instances (tenant_id, status, entity_type) WHERE status = 'PENDING';

ALTER TABLE workflow_step_logs ADD COLUMN on_behalf_of UUID;
CREATE INDEX idx_workflow_step_logs_step ON workflow_step_logs (tenant_id, instance_id, step_order, actor_id);

-- MR батлах эрх (ADR-007). Хуучин role-той (APPROVER) алхам MR-д хүчинтэй хэвээр.
-- Эрхийн кодын модуль: mr нэмэгдэнэ (20261107001-ийн camp|hr|core|feed дээр)
ALTER TABLE core_permissions DROP CONSTRAINT ck_core_permissions_code;
ALTER TABLE core_permissions ADD CONSTRAINT ck_core_permissions_code CHECK (code ~ '^(camp|hr|core|feed|mr)\.[a-z_]+\.[a-z_]+$');
INSERT INTO core_permissions (code, name, sort_order, module, available_in)
VALUES ('mr.request.approve', 'Материалын хүсэлт батлах', 700, 'mr', 'v1')
ON CONFLICT (code) DO NOTHING;
