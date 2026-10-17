-- ============================================================
-- v0.2.2 Блок 5 — хувийн мэдээлэл үзсэн лог (PIL-03, D-08, B5-Q6) (2026-10-17)
-- ============================================================
-- Tech plan: 07_v0.2.2_tech_plan.md §3.7, §13
--
-- Ажилтны профайл (утас, имэйл бүтнээр) нээсэн хэн / хэзээ / аль ажилтан. camp_audit_log-оос ТУСДАА (түүхийг дүүргэхгүй).
-- Зөвхөн нэмэх (app_user: SELECT + INSERT — засах/устгах эрхгүй). Давтамж: нэг хүн × ажилтан 15 мин тутамд 1 мөр (app).
-- "Хэн үзсэн" — camp.roles.manage (Кемп админ) + tenant admin.
--
-- Rollback: DROP TABLE camp_pii_access_log;
-- ============================================================

CREATE TABLE camp_pii_access_log (
  id              UUID        NOT NULL PRIMARY KEY DEFAULT uuid_generate_v7(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  viewer_user_id  UUID        NOT NULL,                       -- core_users.id (RULE-13)
  employee_id     UUID        NOT NULL,
  context         TEXT        NOT NULL CHECK (context ~ '^[a-z_]{2,40}$'),   -- 'profile'
  viewed_at       TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_camp_pii_viewer   FOREIGN KEY (tenant_id, viewer_user_id) REFERENCES core_users (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_pii_employee FOREIGN KEY (tenant_id, employee_id)    REFERENCES camp_employees (tenant_id, id) ON DELETE CASCADE
);
CREATE INDEX idx_camp_pii_access_employee ON camp_pii_access_log (tenant_id, employee_id, viewed_at DESC);
CREATE INDEX idx_camp_pii_access_viewer   ON camp_pii_access_log (tenant_id, viewer_user_id, employee_id, viewed_at DESC);

ALTER TABLE camp_pii_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE camp_pii_access_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_camp_pii_access_log ON camp_pii_access_log AS PERMISSIVE FOR ALL TO app_user
  USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
GRANT SELECT, INSERT ON camp_pii_access_log TO app_user;
