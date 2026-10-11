-- ============================================================
-- v0.2.0 §0.4 — Кемпийн өөрчлөлтийн түүх (2026-10-11)
-- ============================================================
-- PIL-03 / FB-09-ийн суурь. Ажилтан, хэлтэс, ростер, байр, өрөөний үүсгэх/засах/идэвхгүй болгох/импорт бүрийг
-- бизнесийн transaction ДОТОР бичнэ (RLS-007) → бичлэг амжилтгүй бол түүх ч үлдэхгүй.
-- v0.3 Feed (ADR-004): "ажлын явц" ба системийн пост энэ хүснэгтээс уншина → actor, camp, summary_key (+ params).
--
-- Зөвхөн НЭМЭЛТ (шинэ төрөл + шинэ хүснэгт): хуучин хүснэгт, дүрэм өөрчлөгдөхгүй.
-- Append-only: app_user-д зөвхөн SELECT, INSERT (засах/устгах эрхгүй).
-- ============================================================

CREATE TYPE "CampAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DEACTIVATE', 'IMPORT');

CREATE TABLE camp_audit_log (
  id              UUID              PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID              NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  camp_id         UUID,                                   -- NULL = tenant түвшний (байгууллага г.м.)
  entity_type     TEXT              NOT NULL CHECK (entity_type ~ '^[a-z_]{2,40}$'),   -- employee, department, crew, building, room
  entity_id       UUID              NOT NULL,
  action          "CampAuditAction" NOT NULL,
  actor_user_id   UUID              NOT NULL,             -- core_users.id (RULE-13)
  summary_key     TEXT              NOT NULL CHECK (summary_key ~ '^[a-z0-9_.]{3,80}$'),  -- орчуулгын түлхүүр
  summary_params  JSONB             NOT NULL DEFAULT '{}'::jsonb,                        -- {code, name, ...}
  diff            JSONB             NOT NULL DEFAULT '{}'::jsonb,                        -- {талбар: {from, to}}
  import_id       UUID,                                   -- импортоор бол (camp_data_imports / camp_movement_imports)
  created_at      TIMESTAMPTZ       NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT chk_camp_audit_diff_object   CHECK (jsonb_typeof(diff) = 'object'),
  CONSTRAINT chk_camp_audit_params_object CHECK (jsonb_typeof(summary_params) = 'object'),
  CONSTRAINT fk_camp_audit_actor FOREIGN KEY (tenant_id, actor_user_id) REFERENCES core_users (tenant_id, id),
  CONSTRAINT fk_camp_audit_camp  FOREIGN KEY (tenant_id, camp_id)       REFERENCES camps (tenant_id, id)
);

-- Нэг бичлэгийн түүх (шинэ нь эхэнд) · кемпийн сүүлийн үйл явдал (Feed, v0.3)
CREATE INDEX idx_camp_audit_entity ON camp_audit_log (tenant_id, entity_type, entity_id, created_at DESC, id DESC);
CREATE INDEX idx_camp_audit_camp   ON camp_audit_log (tenant_id, camp_id, created_at DESC, id DESC);

-- RLS (RLS-004: PERMISSIVE TO app_user + FORCE + GRANT). camp_apply_tenant_rls-ийг ашиглахгүй:
-- тэр нь updated_at trigger + бүрэн CRUD эрх өгдөг — түүх засагдах ёсгүй.
ALTER TABLE camp_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_camp_audit_log ON camp_audit_log AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON camp_audit_log TO app_user;
